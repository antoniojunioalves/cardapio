import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  pgPolicy,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { currentTenantId, primaryId, timestamps } from './shared.js'
import { tenants } from './tenants.js'

/**
 * Usuário administrativo de um estabelecimento.
 *
 * O e-mail é único **por tenant**, e não globalmente: a mesma pessoa pode
 * administrar dois estabelecimentos com o mesmo endereço de e-mail. É por isso
 * que o login pede o `tenantSlug` — sem ele, um e-mail repetido seria ambíguo.
 *
 * `passwordHash` guarda o resultado completo do argon2id, que já carrega o
 * algoritmo, os parâmetros e o salt na própria string. Não há coluna de salt
 * separada, e não deve haver: o formato é autodescritivo justamente para que
 * os parâmetros possam mudar sem migração de dados.
 */
export const users = pgTable(
  'users',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    name: varchar({ length: 120 }).notNull(),
    email: varchar({ length: 254 }).notNull(),
    passwordHash: varchar({ length: 255 }).notNull(),

    isActive: boolean().notNull().default(true),
    lastLoginAt: timestamp({ withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    unique('users_tenant_email').on(table.tenantId, table.email),
    index('users_tenant_idx').on(table.tenantId),
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
 * Refresh tokens emitidos, para poder revogá-los.
 *
 * Guarda o **hash** do token, nunca o token. Um vazamento desta tabela não dá
 * a ninguém uma sessão válida. O hash é SHA-256 e não argon2: o token é um
 * valor aleatório de 256 bits gerado por nós, não uma senha escolhida por
 * humano — não há dicionário para atacar, e um hash lento aqui só encareceria
 * cada renovação de sessão sem comprar segurança.
 *
 * `revokedAt` em vez de apagar a linha: é o que permite detectar o reuso de um
 * token já rotacionado, que é sinal de token roubado.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    tokenHash: varchar({ length: 64 }).notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    index('refresh_tokens_user_idx').on(table.userId),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
).enableRLS()

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type RefreshToken = typeof refreshTokens.$inferSelect
