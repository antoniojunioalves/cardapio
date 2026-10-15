import { senhaSchema } from '@repo/shared'

import { definirContaPropria, definirEmailDaConta } from '../accounts/context.js'
import {
  buscarContaPeloEmail,
  inserirConta,
  marcarEmailConfirmado,
  type ContaComSenha,
} from '../accounts/repository.js'
import { recordAudit } from '../audit/record.js'
import { hashPassword, verifyPassword } from '../auth/password.js'
import type { Ator } from '../auth/permissions.js'
import { emitirSessao, logout, type Session } from '../auth/service.js'
import { generateTenantToken, hashToken, parseTokenTenant } from '../auth/tokens.js'
import { env } from '../config/env.js'
import { enviarSemDerrubar } from '../email/index.js'
import { UNICIDADE, violacaoDoBanco } from '../lib/db-errors.js'
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../lib/errors.js'
import { exigirVagaNaEquipe } from '../plans/service.js'
import { buscarPerfil, type Perfil } from '../profiles/repository.js'
import { exigirAlcance } from '../profiles/service.js'
import { tenantContextFromToken, type TenantContext } from '../tenant/context.js'
import { findTenantById } from '../tenant/repository.js'
import { withTenant, type TenantTransaction } from '../tenant/with-tenant.js'
import { inserirVinculo, vinculoDoEmail } from '../users/repository.js'
import { mensagemDeConvite, VALIDADE_DO_CONVITE_EM_DIAS } from './messages.js'
import {
  buscarConvite,
  buscarConviteDoEmail,
  buscarConvitePeloToken,
  contarConvites,
  contarEnviosDesde,
  excluirConvite,
  inserirConvite,
  listarConvites as listarDoBanco,
  renovarConvite,
  type ConviteDoPainel,
  type ConviteDoToken,
} from './repository.js'

/**
 * Os convites para a equipe: a única porta de entrada de alguém no painel de
 * um estabelecimento, fora quem o cadastrou.
 *
 * Quem convida informa o e-mail e o perfil. O nome e a senha são da pessoa: se
 * ela já tem conta — trabalha em outro estabelecimento, ou é dona de um —,
 * aceita com a senha de sempre; se não tem, cria a conta ao aceitar. Ninguém do
 * estabelecimento fica sabendo qual dos dois casos é.
 *
 * Regras:
 * - ninguém convida para um perfil que não alcança, nem reenvia ou cancela um
 *   convite assim — a regra dos perfis (`profiles/service.ts`);
 * - um convite pendente no prazo ocupa uma vaga do plano, como uma pessoa
 *   ativa (`exigirVagaNaEquipe`);
 * - contra abuso, e não regra de negócio: no máximo 20 pendentes, um minuto
 *   entre os envios do mesmo convite e um teto de envios por hora em cada
 *   estabelecimento (`INVITATION_EMAILS_PER_HOUR`). O e-mail vai para um
 *   endereço que outra pessoa digitou.
 */

const DIA_EM_MS = 24 * 60 * 60_000
const HORA_EM_MS = 60 * 60_000
const INTERVALO_ENTRE_ENVIOS_MS = 60_000
const MAXIMO_DE_CONVITES = 20

const validadeDoConvite = () => new Date(Date.now() + VALIDADE_DO_CONVITE_EM_DIAS * DIA_EM_MS)

const naoEncontrado = () => new NotFoundError('Convite não encontrado.')

async function exigirPerfil(tx: TenantTransaction, id: string): Promise<Perfil> {
  const perfil = await buscarPerfil(tx, id)
  // Um perfil de outro estabelecimento é invisível aqui: para quem pede, não existe.
  if (!perfil) throw new NotFoundError('Perfil não encontrado.')
  return perfil
}

async function exigirConvite(tx: TenantTransaction, id: string): Promise<ConviteDoPainel> {
  const convite = await buscarConvite(tx, id)
  if (!convite) throw naoEncontrado()
  return convite
}

async function exigirEnvioPermitido(tx: TenantTransaction): Promise<void> {
  const enviados = await contarEnviosDesde(tx, new Date(Date.now() - HORA_EM_MS))
  if (enviados < env.INVITATION_EMAILS_PER_HOUR) return
  throw new AppError(
    'O estabelecimento já mandou muitos convites na última hora. Tente de novo mais tarde.',
    429,
    'INVITATION_RATE_LIMIT',
  )
}

async function enviarConvite(
  context: TenantContext,
  dados: { para: string; token: string },
): Promise<boolean> {
  const estabelecimento = await findTenantById(context.tenantId)
  if (!estabelecimento) return false
  return enviarSemDerrubar(
    mensagemDeConvite({
      para: dados.para,
      slug: estabelecimento.slug,
      token: dados.token,
      webOrigin: env.WEB_ORIGIN,
    }),
    { motivo: 'convite para a equipe', tenantId: context.tenantId },
  )
}

export interface ResultadoDoEnvio {
  convite: ConviteDoPainel
  /** Falso quando o servidor de e-mail falhou: o convite vale, e a tela oferece o reenvio. */
  emailEnviado: boolean
}

// --- No painel -------------------------------------------------------------------

export async function listarConvites(context: TenantContext): Promise<ConviteDoPainel[]> {
  return withTenant(context, (tx) => listarDoBanco(tx))
}

export async function convidar(
  context: TenantContext,
  ator: Ator,
  dados: { email: string; profileId: string },
): Promise<ResultadoDoEnvio> {
  // O login compara em minúsculas.
  const email = dados.email.toLowerCase()

  const { convite, token } = await withTenant(context, async (tx) => {
    const perfil = await exigirPerfil(tx, dados.profileId)
    exigirAlcance(ator, perfil.permissions, 'Este perfil')

    const vinculo = await vinculoDoEmail(tx, email)
    if (vinculo) {
      throw new ConflictError(
        vinculo.isActive
          ? 'Esta pessoa já está na equipe.'
          : 'Esta pessoa já está na equipe, desativada. Para ela voltar, reative-a na lista.',
        'USER_ALREADY_MEMBER',
      )
    }
    if (await buscarConviteDoEmail(tx, email)) throw conviteRepetido()
    if ((await contarConvites(tx)) >= MAXIMO_DE_CONVITES) {
      throw new ConflictError(
        `O estabelecimento já tem ${String(MAXIMO_DE_CONVITES)} convites pendentes. ` +
          'Cancele um para convidar outra pessoa.',
        'INVITATION_LIMIT',
      )
    }
    await exigirEnvioPermitido(tx)
    await exigirVagaNaEquipe(tx, context)

    const { token, tokenHash } = generateTenantToken(context.tenantId)
    const id = await inserirConvite(tx, {
      tenantId: context.tenantId,
      email,
      profileId: perfil.id,
      invitedByUserId: ator.id,
      tokenHash,
      expiresAt: validadeDoConvite(),
    })

    await recordAudit(tx, context, {
      action: 'invitation.created',
      entityType: 'invitation',
      entityId: id,
      actorUserId: ator.id,
      metadata: { email, perfil: perfil.name },
    })
    return { convite: await exigirConvite(tx, id), token }
  }).catch((erro: unknown) => {
    // Dois convites para o mesmo e-mail ao mesmo tempo: o banco segura o segundo.
    const violacao = violacaoDoBanco(erro)
    if (violacao?.code === UNICIDADE && violacao.constraint === 'invitations_um_por_email') {
      throw conviteRepetido()
    }
    throw erro
  })

  // Depois do commit: um convite que não chegou a existir não manda e-mail.
  return { convite, emailEnviado: await enviarConvite(context, { para: email, token }) }
}

function conviteRepetido() {
  return new ConflictError(
    'Já há um convite pendente para este e-mail. Reenvie-o na lista de convites.',
    'INVITATION_PENDING',
  )
}

/**
 * Manda o convite de novo, com um link novo: o anterior deixa de valer, e o
 * prazo recomeça. Um convite vencido não ocupava vaga; reenviado, volta a
 * ocupar, e por isso a vaga é conferida.
 */
export async function reenviarConvite(
  context: TenantContext,
  ator: Ator,
  id: string,
): Promise<ResultadoDoEnvio> {
  const { convite, token } = await withTenant(context, async (tx) => {
    const anterior = await exigirConvite(tx, id)
    exigirAlcance(ator, (await exigirPerfil(tx, anterior.perfil.id)).permissions, 'Este convite')

    const esperar = anterior.enviadoEm.getTime() + INTERVALO_ENTRE_ENVIOS_MS - Date.now()
    if (esperar > 0) {
      throw new AppError(
        `Aguarde ${String(Math.ceil(esperar / 1000))} segundos para reenviar este convite.`,
        429,
        'RESEND_TOO_SOON',
      )
    }
    await exigirEnvioPermitido(tx)
    if (anterior.expiresAt.getTime() <= Date.now()) await exigirVagaNaEquipe(tx, context)

    const { token, tokenHash } = generateTenantToken(context.tenantId)
    await renovarConvite(tx, id, { tokenHash, expiresAt: validadeDoConvite() })

    await recordAudit(tx, context, {
      action: 'invitation.resent',
      entityType: 'invitation',
      entityId: id,
      actorUserId: ator.id,
      metadata: { email: anterior.email },
    })
    return { convite: await exigirConvite(tx, id), token }
  })

  return { convite, emailEnviado: await enviarConvite(context, { para: convite.email, token }) }
}

export async function cancelarConvite(
  context: TenantContext,
  ator: Ator,
  id: string,
): Promise<void> {
  await withTenant(context, async (tx) => {
    const convite = await exigirConvite(tx, id)
    exigirAlcance(ator, (await exigirPerfil(tx, convite.perfil.id)).permissions, 'Este convite')

    await excluirConvite(tx, id)
    await recordAudit(tx, context, {
      action: 'invitation.cancelled',
      entityType: 'invitation',
      entityId: id,
      actorUserId: ator.id,
      metadata: { email: convite.email },
    })
  })
}

// --- Pelo link -------------------------------------------------------------------

const conviteInvalido = () =>
  new AppError(
    'Este convite não vale mais. Se você já o aceitou, é só entrar; se não, peça outro a quem ' +
      'convidou você.',
    400,
    'INVITATION_INVALID',
  )

/**
 * O convite do link, ainda de pé: existe, está no prazo e o estabelecimento
 * não está suspenso. O tenant sai do próprio token, como no link de
 * confirmação: é dica de roteamento, e o hash do token inteiro precisa existir
 * dentro dele.
 */
async function conviteDePe(
  tx: TenantTransaction,
  token: string,
  opcoes: { travar?: boolean } = {},
): Promise<ConviteDoToken> {
  const convite = await buscarConvitePeloToken(tx, hashToken(token), opcoes)
  if (!convite) throw conviteInvalido()
  if (convite.expiresAt.getTime() <= Date.now()) {
    throw new AppError(
      'Este convite venceu. Peça outro a quem convidou você.',
      400,
      'INVITATION_EXPIRED',
    )
  }
  if (convite.estabelecimento.status === 'SUSPENDED') {
    throw new ForbiddenError('Este estabelecimento está suspenso. Fale com quem convidou você.')
  }
  return convite
}

function contextoDoToken(token: string): TenantContext {
  const tenantId = parseTokenTenant(token)
  if (!tenantId) throw conviteInvalido()
  return tenantContextFromToken(tenantId)
}

export interface ConviteParaAceitar {
  email: string
  estabelecimento: { nome: string; slug: string }
  perfil: string
  convidadoPor: string | null
  /** O e-mail já tem conta: quem aceita entra com a senha dela, em vez de criar uma. */
  contaExiste: boolean
}

/**
 * O que a página do convite mostra. Diz se o e-mail já tem conta — mas só a
 * quem tem o link, que chegou àquele e-mail.
 */
export async function consultarConvite(token: string): Promise<ConviteParaAceitar> {
  return withTenant(contextoDoToken(token), async (tx) => {
    const convite = await conviteDePe(tx, token)
    await definirEmailDaConta(tx, convite.email)
    return {
      email: convite.email,
      estabelecimento: { nome: convite.estabelecimento.nome, slug: convite.estabelecimento.slug },
      perfil: convite.perfilNome,
      convidadoPor: convite.convidadoPor,
      contaExiste: (await buscarContaPeloEmail(tx, convite.email)) !== null,
    }
  })
}

/**
 * Aceita o convite e já entra no painel do estabelecimento.
 *
 * - **Com conta:** a senha tem de ser a dela. O nome que vier é ignorado — é o
 *   da conta.
 * - **Sem conta:** cria a conta com o nome e a senha, já com o e-mail
 *   confirmado: o link chegou a ele.
 *
 * As senhas são conferidas e calculadas **fora** da transação; dentro dela, o
 * convite é travado e conferido de novo, e só então vira um vínculo. O convite
 * sai da tabela — o que aconteceu fica na auditoria —, e a vaga que ele ocupava
 * passa para a pessoa.
 *
 * `sessaoAnterior` é o refresh token que o navegador já tinha, de outra conta
 * ou de outro estabelecimento: com a sessão nova aberta, ele é revogado.
 */
export async function aceitarConvite(
  token: string,
  dados: { password: string; name?: string | undefined },
  sessaoAnterior?: string,
): Promise<Session> {
  const context = contextoDoToken(token)

  const { convite, conta } = await withTenant(context, async (tx) => {
    const convite = await conviteDePe(tx, token)
    await definirEmailDaConta(tx, convite.email)
    return { convite, conta: await buscarContaPeloEmail(tx, convite.email) }
  })

  const credencial = conta
    ? await conferirSenha(conta, dados.password)
    : await credencialNova(dados)

  const sessao = await withTenant(context, async (tx) => {
    const travado = await conviteDePe(tx, token, { travar: true })
    // O convite mudou entre as duas transações (cancelado e refeito, por exemplo).
    if (travado.id !== convite.id) throw conviteInvalido()

    await definirEmailDaConta(tx, travado.email)
    const pessoa = await contaDoAceite(tx, travado.email, credencial)

    if (await vinculoDoEmail(tx, travado.email)) {
      throw new ConflictError(
        'Você já está na equipe deste estabelecimento. É só entrar.',
        'USER_ALREADY_MEMBER',
      )
    }

    await excluirConvite(tx, travado.id)
    await exigirVagaNaEquipe(tx, context)
    const userId = await inserirVinculo(tx, {
      tenantId: context.tenantId,
      accountId: pessoa.id,
      profileId: travado.profileId,
    })

    await recordAudit(tx, context, {
      action: 'invitation.accepted',
      entityType: 'user',
      entityId: userId,
      actorUserId: userId,
      metadata: { email: travado.email, perfil: travado.perfilNome },
    })
    await recordAudit(tx, context, {
      action: 'auth.login',
      entityType: 'user',
      entityId: userId,
      actorUserId: userId,
      metadata: { via: 'convite' },
    })

    return emitirSessao(tx, context, { id: userId, name: pessoa.name, email: travado.email })
  }).catch((erro: unknown) => {
    // A conta nasceu por outro caminho entre a consulta e a gravação.
    const violacao = violacaoDoBanco(erro)
    if (violacao?.code === UNICIDADE && violacao.constraint === 'accounts_email') {
      throw new ConflictError(
        'Este e-mail acabou de ganhar uma conta. Abra o convite de novo.',
        'ACCOUNT_CREATED_MEANWHILE',
      )
    }
    throw erro
  })

  if (sessaoAnterior) await logout(sessaoAnterior)
  return sessao
}

type Credencial =
  { tipo: 'conta'; conta: ContaComSenha } | { tipo: 'nova'; nome: string; passwordHash: string }

async function conferirSenha(conta: ContaComSenha, senha: string): Promise<Credencial> {
  if (!(await verifyPassword(conta.passwordHash, senha))) {
    throw new UnauthorizedError('A senha não confere. Use a senha da sua conta.')
  }
  return { tipo: 'conta', conta }
}

async function credencialNova(dados: {
  password: string
  name?: string | undefined
}): Promise<Credencial> {
  const nome = dados.name?.trim() ?? ''
  if (nome.length < 2) {
    throw new AppError('Informe o seu nome, com pelo menos 2 letras.', 400, 'NAME_REQUIRED')
  }
  const senha = senhaSchema.safeParse(dados.password)
  if (!senha.success) {
    throw new AppError(senha.error.issues[0]?.message ?? 'Senha inválida.', 400, 'WEAK_PASSWORD')
  }
  return { tipo: 'nova', nome, passwordHash: await hashPassword(dados.password) }
}

/**
 * A conta de quem aceita, dentro da transação do aceite. A que existia é
 * conferida de novo — a senha foi verificada contra ela, e não contra outra —
 * e ganha o e-mail confirmado; a nova é criada.
 */
async function contaDoAceite(
  tx: TenantTransaction,
  email: string,
  credencial: Credencial,
): Promise<{ id: string; name: string }> {
  if (credencial.tipo === 'nova') {
    const id = await inserirConta(tx, {
      email,
      name: credencial.nome,
      passwordHash: credencial.passwordHash,
      emailVerifiedAt: new Date(),
    })
    return { id, name: credencial.nome }
  }

  const atual = await buscarContaPeloEmail(tx, email)
  if (atual?.id !== credencial.conta.id) throw conviteInvalido()
  await definirContaPropria(tx, atual.id)
  await marcarEmailConfirmado(tx, atual.id, email)
  return { id: atual.id, name: atual.name }
}
