import { auditLogs } from '../db/schema/index.js'
import type { TenantContext } from '../tenant/context.js'
import type { TenantTransaction } from '../tenant/with-tenant.js'

export interface AuditEntry {
  /** Verbo no passado, no formato `recurso.acao`: `user.created`, `order.cancelled`. */
  action: string
  entityType: string
  entityId?: string | null
  /** Nulo quando a ação é do próprio sistema, sem usuário por trás. */
  actorUserId?: string | null
  /** Contexto específico do evento: preço antigo e novo, motivo, o que mudou. */
  metadata?: Record<string, unknown>
}

/**
 * Registra uma ação administrativa.
 *
 * Recebe a transação, e não abre a sua própria, de propósito: a auditoria
 * precisa estar na **mesma transação** da alteração que descreve. Se fosse
 * escrita em transação separada, um rollback da operação deixaria um registro
 * de algo que não aconteceu — ou, pior, a operação seria salva e a auditoria
 * perdida. Ou as duas acontecem, ou nenhuma.
 *
 * A tabela não aceita UPDATE nem DELETE: só existem policies de select e
 * insert, e o RLS nega o que não está autorizado. Nem esta função nem nenhuma
 * outra consegue reescrever o histórico.
 */
export async function recordAudit(
  tx: TenantTransaction,
  context: TenantContext,
  entry: AuditEntry,
): Promise<void> {
  await tx.insert(auditLogs).values({
    tenantId: context.tenantId,
    actorUserId: entry.actorUserId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? null,
  })
}
