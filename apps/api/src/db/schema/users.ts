import { sql } from 'drizzle-orm'
import {
  boolean,
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

import { currentTenantId, primaryId, timestamps } from './shared.js'
import { tenants } from './tenants.js'

/**
 * O e-mail de quem está entrando, lido do contexto da transação. Só o login o
 * define (`auth/login-lookup.ts`). O `nullif` faz a variável vazia — o que
 * sobra numa conexão do pool depois que a transação termina — não casar com
 * linha nenhuma.
 */
const emailEmLogin = sql`nullif(current_setting('app.login_email', true), '')`

/**
 * Usuário administrativo de um estabelecimento: o dono e os funcionários, cada
 * um com o seu e-mail e a sua senha.
 *
 * O e-mail é único **na plataforma inteira**, e sempre em minúsculas: o login
 * pede só e-mail e senha, e é o e-mail que diz de qual estabelecimento a
 * pessoa é. Quem tem dois estabelecimentos usa um e-mail em cada.
 *
 * Por isso a tabela tem duas policies. `tenant_isolation` é a de todas as
 * tabelas. `login_por_email` deixa **ler** a linha do e-mail que está entrando,
 * e nenhuma outra — é o que permite achar o estabelecimento antes de existir
 * contexto de tenant. Ela não deixa alterar nem listar nada.
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
    /** Quando a pessoa provou ser dona do e-mail, pelo link de confirmação. */
    emailVerifiedAt: timestamp({ withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    unique('users_email').on(table.email),
    // Sem isto, `Ze@exemplo.com` e `ze@exemplo.com` seriam duas contas.
    check('users_email_minusculo', sql`${table.email} = lower(${table.email})`),
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
    pgPolicy('login_por_email', {
      as: 'permissive',
      for: 'select',
      to: 'public',
      using: sql`${table.email} = ${emailEmLogin}`,
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
 *
 * `revokedAt` é marcado pela **rotação**, pelo **logout** e pela própria
 * detecção de reuso. Quando somos nós que
 * encerramos a sessão — usuário desativado, estabelecimento suspenso —, a linha
 * é apagada: o token que reaparecer depois recebe "sessão inválida", sem alerta
 * de roubo e sem derrubar as sessões novas da pessoa.
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

/**
 * Links de confirmação de e-mail enviados a quem cadastrou o estabelecimento.
 *
 * Mesmo desenho do refresh token: só o hash SHA-256 fica no banco, e o tenant
 * vai embutido no token, como dica de roteamento para achar a linha sob RLS.
 * `usedAt` em vez de apagar a linha: um segundo clique no mesmo link responde
 * "já confirmado", e não "link inválido".
 *
 * `email` é o endereço que o link confirma. Se o e-mail da pessoa mudar
 * depois do envio, o link antigo não confirma o endereço novo.
 */
export const emailVerificationTokens = pgTable(
  'email_verification_tokens',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid().notNull(),
    email: varchar({ length: 254 }).notNull(),
    tokenHash: varchar({ length: 64 }).notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('email_verification_tokens_user_idx').on(table.userId),
    foreignKey({
      name: 'email_verification_tokens_user_mesmo_tenant',
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
