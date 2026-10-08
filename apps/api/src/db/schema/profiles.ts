import { sql } from 'drizzle-orm'
import {
  foreignKey,
  index,
  pgPolicy,
  pgTable,
  primaryKey,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { currentTenantId, primaryId, timestamps } from './shared.js'
import { tenants } from './tenants.js'

/**
 * Perfil: um conjunto de permissões, com nome, que o dono do estabelecimento
 * monta e dá a cada pessoa — "Atendente", "Cozinha", "Caixa".
 *
 * É do estabelecimento, e não da plataforma: cada um nasce com os perfis
 * prontos (`PERFIS_PRONTOS`, em `@repo/shared`) e os muda como quiser. O que é
 * igual para todos é o catálogo das permissões, que mora no código.
 *
 * O proprietário não tem perfil: ver `users.is_owner`.
 */
export const profiles = pgTable(
  'profiles',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar({ length: 60 }).notNull(),
    description: varchar({ length: 200 }),
    ...timestamps,
  },
  (table) => [
    // "atendente" e "Atendente" seriam o mesmo perfil para quem escolhe numa lista.
    uniqueIndex('profiles_nome_unico').on(table.tenantId, sql`lower(${table.name})`),
    // Alvo das chaves compostas: quem aponta para um perfil aponta para um do
    // mesmo estabelecimento, e é o banco que garante.
    unique('profiles_tenant_id_id').on(table.tenantId, table.id),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
).enableRLS()

/**
 * As permissões de um perfil. O código é o do catálogo (`products:price`), e
 * não a chave de uma tabela: o catálogo é do produto e mora no código. Um
 * código que deixe de existir fica sem efeito — quem lê as permissões de
 * alguém só considera as do catálogo.
 */
export const profilePermissions = pgTable(
  'profile_permissions',
  {
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    profileId: uuid().notNull(),
    permission: varchar({ length: 64 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.profileId, table.permission] }),
    foreignKey({
      name: 'profile_permissions_perfil_mesmo_tenant',
      columns: [table.tenantId, table.profileId],
      foreignColumns: [profiles.tenantId, profiles.id],
    }).onDelete('cascade'),
    index('profile_permissions_tenant_idx').on(table.tenantId),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
).enableRLS()

export type Profile = typeof profiles.$inferSelect
