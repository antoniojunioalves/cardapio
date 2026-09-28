import { sql } from 'drizzle-orm'
import {
  foreignKey,
  index,
  integer,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { currentTenantId, primaryId, timestamps } from './shared.js'
import { tenants } from './tenants.js'
import { users } from './users.js'

/**
 * Catálogo de papéis — global, não por tenant.
 *
 * OWNER, ADMIN e STAFF significam a mesma coisa em todo estabelecimento, então
 * duplicá-los por tenant só criaria oportunidade de divergirem. Papéis
 * personalizados por estabelecimento estão no ROADMAP; quando chegarem, entram
 * como uma tabela tenant-scoped ao lado desta, sem alterar o que já existe.
 */
export const roles = pgTable('roles', {
  id: primaryId(),
  code: varchar({ length: 32 }).notNull().unique(),
  name: varchar({ length: 80 }).notNull(),
  description: text(),
  sortOrder: integer().notNull().default(0),
  ...timestamps,
})

/**
 * Catálogo de permissões — global.
 *
 * O código segue `recurso:acao` (`products:create`, `orders:update`). Formato
 * previsível importa: é o que permite conferir permissão por string sem uma
 * tabela de tradução no meio.
 */
export const permissions = pgTable('permissions', {
  id: primaryId(),
  code: varchar({ length: 64 }).notNull().unique(),
  description: text(),
  ...timestamps,
})

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid()
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
)

/**
 * Vínculo entre usuário e papel — tenant-scoped.
 *
 * Tem `tenantId` próprio, e não apenas o do usuário, de propósito: sem ele a
 * tabela ficaria fora do alcance do RLS e dependeria de um JOIN correto para
 * não vazar. Com a coluna, a policy protege a linha diretamente.
 */
export const userRoles = pgTable(
  'user_roles',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid().notNull(),
    roleId: uuid()
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    unique('user_roles_user_role').on(table.userId, table.roleId),
    // Composta: sem o tenant_id na FK, o dono do Tenant A conseguiria atribuir
    // um papel a um usuário do Tenant B — a checagem de FK não passa pelo RLS.
    foreignKey({
      name: 'user_roles_user_mesmo_tenant',
      columns: [table.tenantId, table.userId],
      foreignColumns: [users.tenantId, users.id],
    }).onDelete('cascade'),
    index('user_roles_tenant_idx').on(table.tenantId),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
).enableRLS()

export type Role = typeof roles.$inferSelect
export type Permission = typeof permissions.$inferSelect
export type UserRole = typeof userRoles.$inferSelect
