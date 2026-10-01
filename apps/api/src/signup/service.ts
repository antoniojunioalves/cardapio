import { FUSO_PADRAO, slugReservado, type Cadastro } from '@repo/shared'
import { sql } from 'drizzle-orm'

import { recordAudit } from '../audit/record.js'
import { hashPassword } from '../auth/password.js'
import { emitirSessao, type Session } from '../auth/service.js'
import { generateTenantToken, hashToken, parseTokenTenant } from '../auth/tokens.js'
import { env } from '../config/env.js'
import { db } from '../db/index.js'
import { enviarSemDerrubar } from '../email/index.js'
import { UNICIDADE, violacaoDoBanco } from '../lib/db-errors.js'
import { AppError, ConflictError } from '../lib/errors.js'
import { infraLogger } from '../lib/logger.js'
import {
  tenantContextFromSignup,
  tenantContextFromToken,
  type TenantContext,
} from '../tenant/context.js'
import { findTenantBySlug } from '../tenant/repository.js'
import { withTenant, type TenantTransaction } from '../tenant/with-tenant.js'
import {
  avisoDeNovoCadastro,
  mensagemDeConfirmacao,
  VALIDADE_DO_LINK_EM_HORAS,
} from './messages.js'
import {
  buscarDono,
  buscarEstabelecimento,
  buscarPapel,
  buscarPlanoAtivo,
  buscarTokenDeConfirmacao,
  inserirAssinatura,
  inserirDono,
  inserirEstabelecimento,
  inserirTokenDeConfirmacao,
  marcarEmailConfirmado,
  marcarTokenUsado,
  publicarEstabelecimento,
  ultimoEnvio,
  vincularPapel,
} from './repository.js'

/** O cadastro pela página inicial assina sempre o plano gratuito; pagos ficam para a cobrança (ROADMAP). */
const PLANO_DO_CADASTRO = 'FREE'
const PAPEL_DO_DONO = 'OWNER'
const INTERVALO_ENTRE_ENVIOS_MS = 60_000
const HORA_EM_MS = 60 * 60_000

// --- Criação do estabelecimento ------------------------------------------------

/**
 * Um id novo de estabelecimento, gerado pelo banco (UUIDv7, como todo id do
 * projeto), **antes** da transação que o cria: é dele que nasce o contexto em
 * que o estabelecimento, o dono e a assinatura são gravados juntos.
 */
export async function novoIdDeEstabelecimento(): Promise<string> {
  const resultado = await db.execute<{ id: string }>(sql`select uuidv7() as id`)
  const id = resultado.rows[0]?.id
  if (!id) throw new Error('o banco não gerou o id do estabelecimento')
  return id
}

export interface NovoEstabelecimento {
  nome: string
  slug: string
  fuso: string
  /** `PENDING` no cadastro pela página, até o e-mail ser confirmado; `ACTIVE` no seed. */
  status: 'PENDING' | 'ACTIVE'
  planoCodigo: string
  /** A senha já chega como hash: o argon2 não segura uma conexão do pool enquanto calcula. */
  dono: { nome: string; email: string; senhaHash: string }
}

/**
 * Cria um estabelecimento: o registro, a assinatura do plano e o dono com o
 * papel OWNER. As configurações não entram — nascem sob demanda na primeira
 * leitura (`ensureSettings`), como sempre nasceram.
 *
 * Recebe a transação, e não abre a sua, porque quem chama compõe mais trabalho
 * nela: o cadastro emite o link de confirmação e a sessão; se qualquer passo
 * falhar, não sobra estabelecimento pela metade. `context` é o do
 * estabelecimento novo (`tenantContextFromSignup`).
 */
export async function criarEstabelecimento(
  tx: TenantTransaction,
  context: TenantContext,
  dados: NovoEstabelecimento,
): Promise<{ donoId: string }> {
  const plano = await buscarPlanoAtivo(tx, dados.planoCodigo)
  const papel = await buscarPapel(tx, PAPEL_DO_DONO)

  if (!plano || !papel) {
    // Configuração da plataforma, não erro de quem se cadastra: o seed de
    // planos e papéis não rodou neste banco.
    infraLogger.error(
      { plano: dados.planoCodigo, planoExiste: Boolean(plano), papelExiste: Boolean(papel) },
      'cadastro sem o plano ou o papel do dono no banco — rode os seeds da plataforma',
    )
    throw new AppError(
      'O cadastro está indisponível no momento. Tente de novo mais tarde.',
      503,
      'SIGNUP_UNAVAILABLE',
    )
  }

  try {
    await inserirEstabelecimento(tx, {
      id: context.tenantId,
      slug: dados.slug,
      name: dados.nome,
      timezone: dados.fuso,
      status: dados.status,
    })
  } catch (error) {
    const violacao = violacaoDoBanco(error)
    if (violacao?.code === UNICIDADE && violacao.constraint === 'tenants_slug_unique') {
      throw new ConflictError('Este endereço já está em uso. Escolha outro.', 'SLUG_TAKEN')
    }
    throw error
  }

  await inserirAssinatura(tx, context.tenantId, plano.id)

  const dono = await inserirDono(tx, {
    tenantId: context.tenantId,
    name: dados.dono.nome,
    email: dados.dono.email.toLowerCase(),
    passwordHash: dados.dono.senhaHash,
  }).catch((error: unknown) => {
    const violacao = violacaoDoBanco(error)
    if (violacao?.code === UNICIDADE && violacao.constraint === 'users_email') {
      // O e-mail é o login, único na plataforma. Dizer que ele já existe revela
      // quem tem conta — o preço de entrar só com e-mail e senha (SECURITY.md).
      throw new ConflictError(
        'Este e-mail já tem uma conta. Entre para acessar o painel.',
        'EMAIL_TAKEN',
      )
    }
    throw error
  })
  await vincularPapel(tx, { tenantId: context.tenantId, userId: dono.id, roleId: papel.id })

  await recordAudit(tx, context, {
    action: 'tenant.created',
    entityType: 'tenant',
    entityId: context.tenantId,
    actorUserId: dono.id,
    metadata: { slug: dados.slug, plano: dados.planoCodigo, status: dados.status },
  })

  return { donoId: dono.id }
}

// --- Cadastro pela página ------------------------------------------------------

export interface ResultadoDoCadastro {
  /** A sessão já traz o estabelecimento criado, como a do login. */
  sessao: Session
  /** Falso quando o servidor de e-mail falhou: o cadastro vale, e o painel oferece o reenvio. */
  emailDeConfirmacaoEnviado: boolean
}

/**
 * Cadastra um estabelecimento pela página inicial, no plano gratuito.
 *
 * Tudo numa transação: estabelecimento, assinatura, dono, aceite dos termos,
 * link de confirmação e a sessão — quem se cadastra já entra no painel. Os
 * e-mails saem **depois** do commit: se a transação falhasse, nenhum e-mail
 * teria sido enviado sobre um cadastro que não existe.
 *
 * O cardápio nasce `PENDING` e só fica público quando o dono confirmar o
 * e-mail. Um e-mail que já tem conta é recusado com `EMAIL_TAKEN`: o e-mail é
 * o login, único na plataforma (`criarEstabelecimento`).
 */
export async function cadastrarEstabelecimento(
  dados: Cadastro,
  origem: { ip: string },
): Promise<ResultadoDoCadastro> {
  const senhaHash = await hashPassword(dados.password)
  const email = dados.email.toLowerCase()
  const tenantId = await novoIdDeEstabelecimento()
  const context = tenantContextFromSignup(tenantId)

  const { sessao, token } = await withTenant(context, async (tx) => {
    const { donoId } = await criarEstabelecimento(tx, context, {
      nome: dados.establishmentName,
      slug: dados.slug,
      fuso: dados.timezone ?? FUSO_PADRAO,
      status: 'PENDING',
      planoCodigo: PLANO_DO_CADASTRO,
      dono: { nome: dados.ownerName, email, senhaHash },
    })

    await recordAudit(tx, context, {
      action: 'terms.accepted',
      entityType: 'tenant',
      entityId: tenantId,
      actorUserId: donoId,
      metadata: { versao: dados.termsVersion, ip: origem.ip },
    })

    const token = await emitirLinkDeConfirmacao(tx, context, { userId: donoId, email })
    const sessao = await emitirSessao(tx, context, { id: donoId, name: dados.ownerName, email })

    return { sessao, token }
  })

  const emailDeConfirmacaoEnviado = await enviarSemDerrubar(
    mensagemDeConfirmacao({ para: email, slug: dados.slug, token, webOrigin: env.WEB_ORIGIN }),
    { motivo: 'confirmação do cadastro', tenantId },
  )

  if (env.PLATFORM_NOTIFY_EMAIL) {
    await enviarSemDerrubar(
      avisoDeNovoCadastro({
        para: env.PLATFORM_NOTIFY_EMAIL,
        nome: dados.establishmentName,
        slug: dados.slug,
        donoNome: dados.ownerName,
        donoEmail: email,
        plano: PLANO_DO_CADASTRO,
        quando: new Date(),
      }),
      { motivo: 'aviso de novo cadastro', tenantId },
    )
  }

  return { sessao, emailDeConfirmacaoEnviado }
}

/** Livre para um cadastro novo: nem reservado, nem de outro estabelecimento. */
export async function enderecoDisponivel(slug: string): Promise<boolean> {
  if (slugReservado(slug)) return false
  return (await findTenantBySlug(slug)) === null
}

// --- Confirmação de e-mail -------------------------------------------------------

async function emitirLinkDeConfirmacao(
  tx: TenantTransaction,
  context: TenantContext,
  destino: { userId: string; email: string },
): Promise<string> {
  const { token, tokenHash } = generateTenantToken(context.tenantId)

  await inserirTokenDeConfirmacao(tx, {
    tenantId: context.tenantId,
    userId: destino.userId,
    email: destino.email,
    tokenHash,
    expiresAt: new Date(Date.now() + VALIDADE_DO_LINK_EM_HORAS * HORA_EM_MS),
  })

  return token
}

export interface ResultadoDaConfirmacao {
  situacao: 'CONFIRMED' | 'ALREADY_CONFIRMED'
  slug: string
}

/**
 * Confirma o e-mail pelo token do link e publica o cardápio.
 *
 * O tenant sai do próprio token, como no refresh token: a busca pelo hash
 * acontece dentro dele, sob RLS. Clicar de novo no mesmo link responde "já
 * confirmado", e não erro — é o que a pessoa espera de um link já usado.
 */
export async function confirmarEmail(token: string): Promise<ResultadoDaConfirmacao> {
  const invalido = () =>
    new AppError(
      'Este link de confirmação não vale. Peça outro no painel.',
      400,
      'CONFIRMATION_INVALID',
    )

  const tenantId = parseTokenTenant(token)
  if (!tenantId) throw invalido()

  const context = tenantContextFromToken(tenantId)

  return withTenant(context, async (tx) => {
    const registro = await buscarTokenDeConfirmacao(tx, hashToken(token))
    const estabelecimento = registro && (await buscarEstabelecimento(tx, tenantId))
    if (!registro || !estabelecimento) throw invalido()

    if (registro.usedAt) return { situacao: 'ALREADY_CONFIRMED', slug: estabelecimento.slug }

    if (registro.expiresAt.getTime() <= Date.now()) {
      throw new AppError(
        'Este link de confirmação expirou. Peça outro no painel.',
        400,
        'CONFIRMATION_EXPIRED',
      )
    }

    // O link confirma o e-mail para o qual foi enviado. Se a pessoa trocou de
    // e-mail depois, ele não prova nada sobre o endereço novo.
    if (!(await marcarEmailConfirmado(tx, registro.userId, registro.email))) throw invalido()

    await marcarTokenUsado(tx, registro.id)
    const publicado = await publicarEstabelecimento(tx, tenantId)

    await recordAudit(tx, context, {
      action: 'user.email_confirmed',
      entityType: 'user',
      entityId: registro.userId,
      actorUserId: registro.userId,
    })
    if (publicado) {
      await recordAudit(tx, context, {
        action: 'tenant.published',
        entityType: 'tenant',
        entityId: tenantId,
        actorUserId: registro.userId,
      })
    }

    return { situacao: 'CONFIRMED', slug: estabelecimento.slug }
  })
}

export interface SituacaoDaConfirmacao {
  /** `PENDING` enquanto o cardápio espera a confirmação; `CONFIRMED` depois — e para quem nunca passou pelo cadastro. */
  status: 'PENDING' | 'CONFIRMED'
  /** Para onde o link vai: o e-mail de quem cadastrou o estabelecimento. */
  email: string | null
}

export async function situacaoDaConfirmacao(
  context: TenantContext,
): Promise<SituacaoDaConfirmacao> {
  return withTenant(context, async (tx) => {
    const estabelecimento = await buscarEstabelecimento(tx, context.tenantId)
    const dono = await buscarDono(tx)
    return {
      status: estabelecimento?.status === 'PENDING' ? 'PENDING' : 'CONFIRMED',
      email: dono?.email ?? null,
    }
  })
}

/**
 * Envia um link novo ao dono do estabelecimento.
 *
 * Vai sempre para o e-mail de quem cadastrou, seja quem for que peça: é a
 * confirmação **dele** que publica o cardápio. Os links anteriores continuam
 * valendo até expirar — são 256 bits aleatórios, e invalidá-los só criaria um
 * caso a mais para dar errado. Entre um envio e outro, um minuto.
 */
export async function reenviarConfirmacao(
  context: TenantContext,
  solicitanteId: string,
): Promise<{ email: string }> {
  const resultado = await withTenant(context, async (tx) => {
    const estabelecimento = await buscarEstabelecimento(tx, context.tenantId)
    if (estabelecimento?.status !== 'PENDING') return { tipo: 'ja-confirmado' } as const

    const dono = await buscarDono(tx)
    if (!dono) return { tipo: 'sem-dono' } as const

    const ultimo = await ultimoEnvio(tx, dono.id)
    const esperar = ultimo ? ultimo.getTime() + INTERVALO_ENTRE_ENVIOS_MS - Date.now() : 0
    if (esperar > 0) return { tipo: 'cedo', segundos: Math.ceil(esperar / 1000) } as const

    const token = await emitirLinkDeConfirmacao(tx, context, {
      userId: dono.id,
      email: dono.email,
    })
    await recordAudit(tx, context, {
      action: 'email_confirmation.resent',
      entityType: 'user',
      entityId: dono.id,
      actorUserId: solicitanteId,
    })

    return { tipo: 'emitido', token, email: dono.email, slug: estabelecimento.slug } as const
  })

  if (resultado.tipo === 'ja-confirmado') {
    throw new ConflictError(
      'O e-mail já foi confirmado, e o cardápio está publicado.',
      'ALREADY_CONFIRMED',
    )
  }
  if (resultado.tipo === 'sem-dono') {
    throw new ConflictError('Este estabelecimento não tem dono a quem enviar.', 'NO_OWNER')
  }
  if (resultado.tipo === 'cedo') {
    throw new AppError(
      `Aguarde ${String(resultado.segundos)} segundos para pedir outro e-mail.`,
      429,
      'RESEND_TOO_SOON',
    )
  }

  const enviado = await enviarSemDerrubar(
    mensagemDeConfirmacao({
      para: resultado.email,
      slug: resultado.slug,
      token: resultado.token,
      webOrigin: env.WEB_ORIGIN,
    }),
    { motivo: 'reenvio da confirmação', tenantId: context.tenantId },
  )
  if (!enviado) {
    throw new AppError(
      'Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.',
      503,
      'EMAIL_UNAVAILABLE',
    )
  }

  return { email: resultado.email }
}
