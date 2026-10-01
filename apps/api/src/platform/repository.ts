import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm'

import { db } from '../db/index.js'
import {
  auditLogs,
  plans,
  refreshTokens,
  roles,
  subscriptions,
  tenants,
  userRoles,
  users,
} from '../db/schema/index.js'
import type { TenantTransaction } from '../tenant/with-tenant.js'

/**
 * Acesso a dados dos comandos da plataforma.
 *
 * O registro de estabelecimentos (`tenants`) e o catálogo de planos não têm
 * RLS; todo o resto roda na transação do contexto do estabelecimento, sob RLS,
 * como em qualquer outro lugar.
 */

export type StatusDoEstabelecimento = 'ACTIVE' | 'SUSPENDED' | 'PENDING'

export interface EstabelecimentoDoRegistro {
  id: string
  slug: string
  name: string
  status: StatusDoEstabelecimento
  createdAt: Date
}

/**
 * Todos os estabelecimentos, do mais antigo para o mais novo.
 *
 * **A única listagem do registro no sistema**, e só o comando da plataforma a
 * usa — nenhuma rota HTTP. O repositório do tenant (`tenant/repository.ts`)
 * continua sem listagem de propósito: lá, uma consulta genérica seria o buraco
 * que o RLS fecha nas outras tabelas.
 */
export async function listarRegistro(
  status?: StatusDoEstabelecimento,
): Promise<EstabelecimentoDoRegistro[]> {
  return db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      status: tenants.status,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .where(status ? eq(tenants.status, status) : undefined)
    .orderBy(asc(tenants.createdAt))
}

export interface DonoDoEstabelecimento {
  id: string
  email: string
  emailConfirmado: boolean
}

/** O dono é quem tem o papel OWNER — quem cadastrou o estabelecimento. */
export async function buscarDono(tx: TenantTransaction): Promise<DonoDoEstabelecimento | null> {
  const [dono] = await tx
    .select({ id: users.id, email: users.email, confirmadoEm: users.emailVerifiedAt })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(roles.code, 'OWNER'))
    .orderBy(users.createdAt)
    .limit(1)
  return dono
    ? { id: dono.id, email: dono.email, emailConfirmado: dono.confirmadoEm !== null }
    : null
}

export async function contarUsuariosAtivos(tx: TenantTransaction): Promise<number> {
  const [linha] = await tx.select({ total: count() }).from(users).where(eq(users.isActive, true))
  return linha?.total ?? 0
}

export async function buscarAssinaturaAtiva(
  tx: TenantTransaction,
): Promise<{ id: string; planoCodigo: string } | null> {
  const [assinatura] = await tx
    .select({ id: subscriptions.id, planoCodigo: plans.code })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.status, 'ACTIVE'))
    .limit(1)
  return assinatura ?? null
}

/**
 * Muda o status **só se ele ainda for o esperado** — dois comandos ao mesmo
 * tempo não se atropelam: o segundo afeta zero linhas.
 */
export async function mudarStatus(
  tx: TenantTransaction,
  tenantId: string,
  de: StatusDoEstabelecimento,
  para: StatusDoEstabelecimento,
): Promise<boolean> {
  const mudados = await tx
    .update(tenants)
    .set({ status: para, updatedAt: new Date() })
    .where(and(eq(tenants.id, tenantId), eq(tenants.status, de)))
    .returning({ id: tenants.id })
  return mudados.length > 0
}

/**
 * O status que o estabelecimento tinha quando foi suspenso pela última vez,
 * como a suspensão registrou na auditoria. `null` se ela não passou pelo
 * comando (um ajuste direto no banco, por exemplo).
 */
export async function statusAntesDaSuspensao(
  tx: TenantTransaction,
): Promise<'ACTIVE' | 'PENDING' | null> {
  const [suspensao] = await tx
    .select({ metadata: auditLogs.metadata })
    .from(auditLogs)
    .where(eq(auditLogs.action, 'tenant.suspended'))
    .orderBy(desc(auditLogs.createdAt))
    .limit(1)
  const anterior = suspensao?.metadata?.statusAnterior
  return anterior === 'ACTIVE' || anterior === 'PENDING' ? anterior : null
}

/**
 * Encerra todas as sessões abertas do estabelecimento do contexto. Devolve
 * quantas eram.
 *
 * Apaga, em vez de marcar como revogada — pelo mesmo motivo de
 * `encerrarSessoes` (`users/repository.ts`): sessão encerrada por nós que
 * reaparece não é token roubado.
 */
export async function encerrarTodasAsSessoes(tx: TenantTransaction): Promise<number> {
  const encerradas = await tx
    .delete(refreshTokens)
    .where(isNull(refreshTokens.revokedAt))
    .returning({ id: refreshTokens.id })
  return encerradas.length
}

/**
 * Encerra a assinatura vigente e abre outra, no plano novo. A encerrada fica
 * como histórico — o índice único só admite uma `ACTIVE` por estabelecimento.
 */
export async function trocarAssinatura(
  tx: TenantTransaction,
  dados: { tenantId: string; assinaturaAtualId: string | null; planoId: string },
): Promise<void> {
  if (dados.assinaturaAtualId) {
    await tx
      .update(subscriptions)
      .set({ status: 'CANCELLED', cancelledAt: sql`now()`, updatedAt: new Date() })
      .where(eq(subscriptions.id, dados.assinaturaAtualId))
  }
  await tx.insert(subscriptions).values({ tenantId: dados.tenantId, planId: dados.planoId })
}

export async function listarPlanosAtivos(): Promise<{ id: string; code: string; name: string }[]> {
  return db
    .select({ id: plans.id, code: plans.code, name: plans.name })
    .from(plans)
    .where(eq(plans.isActive, true))
    .orderBy(asc(plans.sortOrder))
}
