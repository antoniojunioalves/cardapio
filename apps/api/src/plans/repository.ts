import { count, eq, gte } from 'drizzle-orm'

import { orders, planFeatures, plans, subscriptions, users } from '../db/schema/index.js'
import type { TenantTransaction } from '../tenant/with-tenant.js'

/**
 * Consultas do plano. `subscriptions` é tenant-scoped (RLS); `plans` e
 * `plan_features` são catálogo global da plataforma.
 */

export interface PlanoDoTenant {
  codigo: string
  nome: string
  /** `recurso → limite`; `null` é ilimitado. */
  limites: Map<string, number | null>
}

/** O plano da assinatura ativa, ou `null` sem assinatura ativa. */
export async function carregarPlano(tx: TenantTransaction): Promise<PlanoDoTenant | null> {
  const [assinatura] = await tx
    .select({ planId: plans.id, codigo: plans.code, nome: plans.name })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.status, 'ACTIVE'))
    .limit(1)
  if (!assinatura) return null

  const recursos = await tx
    .select({
      chave: planFeatures.key,
      ligado: planFeatures.isEnabled,
      limite: planFeatures.limitValue,
    })
    .from(planFeatures)
    .where(eq(planFeatures.planId, assinatura.planId))

  return {
    codigo: assinatura.codigo,
    nome: assinatura.nome,
    // Desligado no plano vale como zero; ligado sem valor, ilimitado.
    limites: new Map(recursos.map((r) => [r.chave, r.ligado ? r.limite : 0])),
  }
}

export async function contarPedidosDesde(tx: TenantTransaction, inicio: Date): Promise<number> {
  const [linha] = await tx
    .select({ total: count() })
    .from(orders)
    .where(gte(orders.createdAt, inicio))
  return linha?.total ?? 0
}

export async function contarUsuariosAtivos(tx: TenantTransaction): Promise<number> {
  const [linha] = await tx.select({ total: count() }).from(users).where(eq(users.isActive, true))
  return linha?.total ?? 0
}
