import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  pgPolicy,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { profiles } from './profiles.js'
import { currentTenantId, primaryId, timestamps } from './shared.js'
import { tenants } from './tenants.js'
import { users } from './users.js'

/**
 * Convites para a equipe de um estabelecimento: o e-mail de quem vai entrar e o
 * perfil que a pessoa terá.
 *
 * Só existem os **pendentes**. Aceito, o convite vira um vínculo em `users` e a
 * linha é apagada; cancelado, também. O que aconteceu fica na auditoria. Um
 * convite vencido continua aqui até alguém reenviá-lo ou cancelá-lo — e
 * segura o perfil, que não se exclui enquanto houver convite para ele.
 *
 * O token segue o desenho do link de confirmação (`email_verification_tokens`):
 * só o hash SHA-256 fica no banco, e o tenant vai embutido no token, como dica
 * de roteamento para achar a linha sob RLS. Reenviar troca o hash: o link
 * anterior deixa de valer.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: varchar({ length: 254 }).notNull(),
    profileId: uuid().notNull(),
    invitedByUserId: uuid().notNull(),
    tokenHash: varchar({ length: 64 }).notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    unique('invitations_token_hash').on(table.tokenHash),
    // Um convite por e-mail em cada estabelecimento.
    unique('invitations_um_por_email').on(table.tenantId, table.email),
    check('invitations_email_minusculo', sql`${table.email} = lower(${table.email})`),
    foreignKey({
      name: 'invitations_perfil_mesmo_tenant',
      columns: [table.tenantId, table.profileId],
      foreignColumns: [profiles.tenantId, profiles.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'invitations_autor_mesmo_tenant',
      columns: [table.tenantId, table.invitedByUserId],
      foreignColumns: [users.tenantId, users.id],
    }).onDelete('cascade'),
    index('invitations_tenant_idx').on(table.tenantId),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
).enableRLS()

export type Invitation = typeof invitations.$inferSelect
