import { sql } from 'drizzle-orm'
import { index, jsonb, pgPolicy, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

import { currentTenantId, primaryId } from './shared.js'
import { tenants } from './tenants.js'

/**
 * Registro de ações administrativas.
 *
 * Duas escolhas que tornam este log confiável:
 *
 * **Não tem `updatedAt`, e as policies não permitem UPDATE nem DELETE.** Só
 * existem policies para `select` e `insert`; como o RLS nega o que nenhuma
 * policy autoriza, alterar ou apagar uma linha de auditoria pela aplicação
 * afeta zero linhas. Um log que a própria aplicação pode reescrever não serve
 * para auditar a aplicação.
 *
 * **`actorUserId` é anulável e usa `ON DELETE SET NULL`.** Remover um usuário
 * não pode apagar o rastro do que ele fez — some o vínculo, fica o registro.
 *
 * `metadata` guarda o contexto específico de cada ação (o preço antigo e o
 * novo, o motivo do cancelamento) sem exigir uma coluna por tipo de evento.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    /**
     * Nulo quando o ator foi removido, ou quando a ação foi do próprio sistema.
     *
     * A chave estrangeira é composta — `(tenant_id, actor_user_id)` — e está na
     * migration `0009`, escrita à mão: ela precisa de `ON DELETE SET NULL
     * (actor_user_id)`, anulando só o ator. O `SET NULL` comum anularia também
     * o `tenant_id`, que é obrigatório, e a remoção do usuário falharia. O
     * Drizzle não expressa essa forma.
     */
    actorUserId: uuid(),

    /** `product.price_changed`, `order.cancelled`, `user.created`. */
    action: varchar({ length: 64 }).notNull(),
    entityType: varchar({ length: 64 }).notNull(),
    entityId: uuid(),

    metadata: jsonb().$type<Record<string, unknown>>(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_tenant_created_idx').on(table.tenantId, table.createdAt),
    index('audit_logs_entity_idx').on(table.entityType, table.entityId),

    pgPolicy('tenant_isolation_select', {
      as: 'permissive',
      for: 'select',
      to: 'public',
      using: sql`${table.tenantId} = ${currentTenantId}`,
    }),
    pgPolicy('tenant_isolation_insert', {
      as: 'permissive',
      for: 'insert',
      to: 'public',
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
    // Nenhuma policy para update ou delete: o RLS nega o que não é autorizado.
  ],
).enableRLS()

export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert
