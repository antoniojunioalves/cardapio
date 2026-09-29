import { sql } from 'drizzle-orm'
import {
  boolean,
  foreignKey,
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
    // Alvo das chaves estrangeiras compostas: outras tabelas referenciam
    // (tenant_id, id), e não só id, para que o banco exija que a referência
    // fique dentro do mesmo estabelecimento. Ver `tests/rls-guard.test.ts`.
    unique('users_tenant_id_id').on(table.tenantId, table.id),
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
    userId: uuid().notNull(),

    tokenHash: varchar({ length: 64 }).notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    index('refresh_tokens_user_idx').on(table.userId),
    // Composta, e não `userId → users.id`: a checagem de FK roda por fora do
    // RLS, então uma FK simples aceitaria um token apontando para usuário de
    // outro estabelecimento.
    foreignKey({
      name: 'refresh_tokens_user_mesmo_tenant',
      columns: [table.tenantId, table.userId],
      foreignColumns: [users.tenantId, users.id],
    }).onDelete('cascade'),
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
