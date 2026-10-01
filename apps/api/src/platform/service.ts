import { recordAudit } from '../audit/record.js'
import { ConflictError, NotFoundError } from '../lib/errors.js'
import { avisarPedido } from '../realtime/notify.js'
import { reenviarConfirmacao } from '../signup/service.js'
import { tenantContextFromPlatform, type TenantContext } from '../tenant/context.js'
import { findTenantBySlug, type TenantRecord } from '../tenant/repository.js'
import { withTenant } from '../tenant/with-tenant.js'
import {
  buscarAssinaturaAtiva,
  buscarDono,
  contarUsuariosAtivos,
  listarPlanosAtivos,
  listarRegistro,
  mudarStatus,
  encerrarTodasAsSessoes,
  statusAntesDaSuspensao,
  trocarAssinatura,
  type StatusDoEstabelecimento,
} from './repository.js'

/**
 * As ações da plataforma sobre os estabelecimentos — o que o Super Admin faz
 * no MVP, por comando (`platform/cli.ts`), e não por tela.
 *
 * Não há rota HTTP para nada daqui: quem roda o comando já está no servidor.
 * O comando conecta com a mesma role da API, sem `BYPASSRLS`, então cada ação
 * abre o contexto do estabelecimento como qualquer outra (`withTenant`).
 *
 * Toda ação que altera algo vai para a auditoria do estabelecimento, sem
 * usuário — não foi ninguém de lá — e com o operador do comando nos detalhes.
 */

/** Quem rodou o comando, para a auditoria. */
export interface Operador {
  operador: string
}

async function exigirEstabelecimento(
  slug: string,
): Promise<{ tenant: TenantRecord; context: TenantContext }> {
  const tenant = await findTenantBySlug(slug)
  if (!tenant) throw new NotFoundError(`Não há estabelecimento com o endereço "${slug}".`)
  return { tenant, context: tenantContextFromPlatform(tenant.id) }
}

export interface EstabelecimentoListado {
  slug: string
  nome: string
  status: StatusDoEstabelecimento
  plano: string | null
  dono: string | null
  emailConfirmado: boolean
  usuariosAtivos: number
  criadoEm: Date
}

export async function listarEstabelecimentos(
  filtro: { status?: StatusDoEstabelecimento | undefined } = {},
): Promise<EstabelecimentoListado[]> {
  const registro = await listarRegistro(filtro.status)
  const lista: EstabelecimentoListado[] = []

  // Um contexto por estabelecimento: plano, dono e usuários estão sob RLS.
  for (const tenant of registro) {
    const detalhes = await withTenant(tenantContextFromPlatform(tenant.id), async (tx) => ({
      assinatura: await buscarAssinaturaAtiva(tx),
      dono: await buscarDono(tx),
      usuariosAtivos: await contarUsuariosAtivos(tx),
    }))
    lista.push({
      slug: tenant.slug,
      nome: tenant.name,
      status: tenant.status,
      plano: detalhes.assinatura?.planoCodigo ?? null,
      dono: detalhes.dono?.email ?? null,
      emailConfirmado: detalhes.dono?.emailConfirmado ?? false,
      usuariosAtivos: detalhes.usuariosAtivos,
      criadoEm: tenant.createdAt,
    })
  }
  return lista
}

/**
 * Suspende o estabelecimento: o cardápio sai do ar, ninguém entra, e **quem
 * já estava logado cai** — as sessões são encerradas, o token de acesso para de
 * valer na requisição seguinte (`loadAuthenticatedUser`) e as conexões ao vivo
 * fecham na hora, pelo aviso emitido na mesma transação.
 */
export async function suspenderEstabelecimento(
  slug: string,
  dados: Operador & { motivo: string },
): Promise<{ sessoesEncerradas: number }> {
  const { tenant, context } = await exigirEstabelecimento(slug)
  if (tenant.status === 'SUSPENDED') {
    throw new ConflictError(`"${slug}" já está suspenso.`, 'ALREADY_SUSPENDED')
  }

  return withTenant(context, async (tx) => {
    if (!(await mudarStatus(tx, tenant.id, tenant.status, 'SUSPENDED'))) {
      throw new ConflictError(`O status de "${slug}" mudou agora há pouco. Liste e tente de novo.`)
    }
    const sessoesEncerradas = await encerrarTodasAsSessoes(tx)
    await avisarPedido(tx, { tipo: 'ESTABELECIMENTO_SUSPENSO', tenantId: tenant.id })

    await recordAudit(tx, context, {
      action: 'tenant.suspended',
      entityType: 'tenant',
      entityId: tenant.id,
      metadata: {
        por: 'plataforma',
        operador: dados.operador,
        motivo: dados.motivo,
        statusAnterior: tenant.status,
        sessoesEncerradas,
      },
    })
    return { sessoesEncerradas }
  })
}

/**
 * Tira a suspensão. O estabelecimento volta para onde estaria sem ela:
 * publicado se já estava publicado antes, ou se o dono confirmou o e-mail
 * nesse meio-tempo; aguardando a confirmação se não. Reativar não publica um
 * cardápio que nunca foi confirmado.
 */
export async function reativarEstabelecimento(
  slug: string,
  dados: Operador,
): Promise<{ status: 'ACTIVE' | 'PENDING' }> {
  const { tenant, context } = await exigirEstabelecimento(slug)
  if (tenant.status !== 'SUSPENDED') {
    throw new ConflictError(`"${slug}" não está suspenso.`, 'NOT_SUSPENDED')
  }

  return withTenant(context, async (tx) => {
    const publicado =
      (await statusAntesDaSuspensao(tx)) === 'ACTIVE' || (await buscarDono(tx))?.emailConfirmado
    const status = publicado ? 'ACTIVE' : 'PENDING'

    if (!(await mudarStatus(tx, tenant.id, 'SUSPENDED', status))) {
      throw new ConflictError(`O status de "${slug}" mudou agora há pouco. Liste e tente de novo.`)
    }
    await recordAudit(tx, context, {
      action: 'tenant.reactivated',
      entityType: 'tenant',
      entityId: tenant.id,
      metadata: { por: 'plataforma', operador: dados.operador, status },
    })
    return { status }
  })
}

/** Troca o plano: encerra a assinatura vigente e abre outra, guardando o histórico. */
export async function trocarPlano(
  slug: string,
  codigoDoPlano: string,
  dados: Operador,
): Promise<{ de: string | null; para: string }> {
  const { tenant, context } = await exigirEstabelecimento(slug)

  const planos = await listarPlanosAtivos()
  const plano = planos.find((p) => p.code === codigoDoPlano.toUpperCase())
  if (!plano) {
    throw new NotFoundError(
      `Não há plano ativo com o código "${codigoDoPlano}". ` +
        `Planos: ${planos.map((p) => p.code).join(', ')}.`,
    )
  }

  return withTenant(context, async (tx) => {
    const atual = await buscarAssinaturaAtiva(tx)
    if (atual?.planoCodigo === plano.code) {
      throw new ConflictError(`"${slug}" já está no plano ${plano.code}.`, 'SAME_PLAN')
    }

    await trocarAssinatura(tx, {
      tenantId: tenant.id,
      assinaturaAtualId: atual?.id ?? null,
      planoId: plano.id,
    })
    await recordAudit(tx, context, {
      action: 'subscription.changed',
      entityType: 'tenant',
      entityId: tenant.id,
      metadata: {
        por: 'plataforma',
        operador: dados.operador,
        de: atual?.planoCodigo ?? null,
        para: plano.code,
      },
    })
    return { de: atual?.planoCodigo ?? null, para: plano.code }
  })
}

/** Manda um link novo de confirmação ao dono — para quem perdeu o e-mail e pediu ajuda. */
export async function reenviarConfirmacaoPelaPlataforma(
  slug: string,
  dados: Operador,
): Promise<{ email: string }> {
  const { context } = await exigirEstabelecimento(slug)
  return reenviarConfirmacao(context, { operador: dados.operador })
}
