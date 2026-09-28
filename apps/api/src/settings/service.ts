import { recordAudit } from '../audit/record.js'
import type {
  BusinessHour,
  DeliveryRegion,
  DeliverySettings,
  TenantSettings,
} from '../db/schema/index.js'
import type { TenantContext } from '../tenant/context.js'
import { findTenantById } from '../tenant/repository.js'
import { withTenant } from '../tenant/with-tenant.js'
import { statusDoEstabelecimento, type StatusDoEstabelecimento } from './opening-hours.js'
import {
  ensureDeliverySettings,
  ensureSettings,
  listBusinessHours,
  listDeliveryRegions,
  listPaymentMethods,
  replaceBusinessHours,
  replaceDeliveryRegions,
  setPaymentMethods,
  updateDeliverySettings,
  updateSettings,
  type DeliveryPatch,
  type FormaDePagamentoDeEntrada,
  type FormaDePagamentoDoTenant,
  type IntervaloDeEntrada,
  type RegiaoDeEntrada,
  type SettingsPatch,
} from './repository.js'

/**
 * Regras de configuração do estabelecimento.
 *
 * Cada mutação abre uma transação e grava a auditoria **dentro dela**: ou a
 * alteração e o registro acontecem juntos, ou nenhum dos dois.
 */

export async function obterConfiguracoes(context: TenantContext): Promise<TenantSettings> {
  return withTenant(context, (tx) => ensureSettings(tx, context))
}

export async function atualizarConfiguracoes(
  context: TenantContext,
  actorUserId: string,
  patch: SettingsPatch,
): Promise<TenantSettings> {
  return withTenant(context, async (tx) => {
    const anterior = await ensureSettings(tx, context)
    const atualizado = await updateSettings(tx, context, patch)

    await recordAudit(tx, context, {
      action: 'settings.updated',
      entityType: 'tenant_settings',
      entityId: atualizado.id,
      actorUserId,
      // Só os campos que realmente mudaram, com o antes e o depois. Registrar
      // o objeto inteiro tornaria impossível ver o que foi alterado.
      metadata: { alteracoes: diferencas(anterior, atualizado) },
    })

    return atualizado
  })
}

export async function obterHorarios(context: TenantContext): Promise<BusinessHour[]> {
  return withTenant(context, (tx) => listBusinessHours(tx))
}

export async function substituirHorarios(
  context: TenantContext,
  actorUserId: string,
  intervalos: readonly IntervaloDeEntrada[],
): Promise<BusinessHour[]> {
  return withTenant(context, async (tx) => {
    const anteriores = await listBusinessHours(tx)
    const novos = await replaceBusinessHours(tx, context, intervalos)

    await recordAudit(tx, context, {
      action: 'business_hours.replaced',
      entityType: 'business_hours',
      actorUserId,
      metadata: { intervalosAntes: anteriores.length, intervalosDepois: novos.length },
    })

    return novos
  })
}

export interface ConfiguracaoDeEntregaCompleta {
  configuracao: DeliverySettings
  regioes: DeliveryRegion[]
}

export async function obterEntrega(context: TenantContext): Promise<ConfiguracaoDeEntregaCompleta> {
  return withTenant(context, async (tx) => ({
    configuracao: await ensureDeliverySettings(tx, context),
    regioes: await listDeliveryRegions(tx),
  }))
}

export type EntregaPatch = DeliveryPatch

/**
 * Salva configuração de entrega e regiões juntas, numa transação só.
 *
 * Separar em duas chamadas permitiria um estado intermediário incoerente —
 * modo já em `BY_REGION` sem nenhuma região cadastrada — visível para quem
 * consultasse o cardápio nesse instante.
 */
export async function substituirEntrega(
  context: TenantContext,
  actorUserId: string,
  entrada: { configuracao: EntregaPatch; regioes: readonly RegiaoDeEntrada[] },
): Promise<ConfiguracaoDeEntregaCompleta> {
  return withTenant(context, async (tx) => {
    const anterior = await ensureDeliverySettings(tx, context)

    const configuracao = await updateDeliverySettings(tx, entrada.configuracao)
    const regioes = await replaceDeliveryRegions(tx, context, entrada.regioes)

    await recordAudit(tx, context, {
      action: 'delivery.updated',
      entityType: 'delivery_settings',
      entityId: configuracao.id,
      actorUserId,
      metadata: {
        alteracoes: diferencas(anterior, configuracao),
        regioes: regioes.length,
      },
    })

    return { configuracao, regioes }
  })
}

export async function obterFormasDePagamento(
  context: TenantContext,
): Promise<FormaDePagamentoDoTenant[]> {
  return withTenant(context, (tx) => listPaymentMethods(tx))
}

export async function definirFormasDePagamento(
  context: TenantContext,
  actorUserId: string,
  formas: readonly FormaDePagamentoDeEntrada[],
): Promise<FormaDePagamentoDoTenant[]> {
  return withTenant(context, async (tx) => {
    const resultado = await setPaymentMethods(tx, context, formas)

    await recordAudit(tx, context, {
      action: 'payment_methods.updated',
      entityType: 'tenant_payment_methods',
      actorUserId,
      metadata: { habilitadas: resultado.filter((f) => f.isEnabled).map((f) => f.code) },
    })

    return resultado
  })
}

/**
 * Se o estabelecimento está aberto agora.
 *
 * O fuso vem do tenant e não do servidor: um estabelecimento em Rio Branco
 * fecha às 23:00 no horário dele, não no de quem hospeda a aplicação.
 */
export async function obterStatus(context: TenantContext): Promise<StatusDoEstabelecimento> {
  const tenant = await findTenantById(context.tenantId)
  if (!tenant) throw new Error('estabelecimento não encontrado')

  return withTenant(context, async (tx) => {
    const configuracoes = await ensureSettings(tx, context)
    const intervalos = await listBusinessHours(tx)

    return statusDoEstabelecimento({
      intervalos,
      timezone: tenant.timezone,
      aceitandoPedidos: configuracoes.isAcceptingOrders,
    })
  })
}

/** Só as chaves cujo valor mudou, com o antes e o depois. */
function diferencas<T extends Record<string, unknown>>(
  antes: T,
  depois: T,
): Record<string, { de: unknown; para: unknown }> {
  const resultado: Record<string, { de: unknown; para: unknown }> = {}

  for (const chave of Object.keys(depois)) {
    if (chave === 'updatedAt') continue

    const valorAntes = antes[chave]
    const valorDepois = depois[chave]
    const iguais =
      valorAntes instanceof Date && valorDepois instanceof Date
        ? valorAntes.getTime() === valorDepois.getTime()
        : valorAntes === valorDepois

    if (!iguais) resultado[chave] = { de: valorAntes ?? null, para: valorDepois ?? null }
  }

  return resultado
}
