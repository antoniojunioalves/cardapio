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
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { accounts } from './accounts.js'
import { profiles } from './profiles.js'
import {
  currentAccountId,
  currentTenantId,
  primaryId,
  semTenantNoContexto,
  timestamps,
} from './shared.js'
import { tenants } from './tenants.js'

/**
 * O vínculo de uma pessoa com um estabelecimento: o que ela é **ali** — a
 * proprietária ou não, o perfil, se está ativa, quando entrou pela última vez.
 *
 * A pessoa em si — o e-mail, a senha, o nome — é a conta (`accounts`), uma só
 * em todos os estabelecimentos em que trabalha. Cada estabelecimento tem um
 * vínculo dela, e só um (`users_conta_por_tenant`).
 *
 * O nome da tabela ficou de antes de existir a conta, e ficou de propósito: o
 * que aponta para `users.id` — as sessões, a auditoria, quem fez o quê — aponta
 * para a pessoa **neste** estabelecimento, que é o que o vínculo é.
 *
 * Duas policies. `tenant_isolation` é a de todas as tabelas. `vinculos_da_conta`
 * deixa **ler** os vínculos da conta de `app.account_id` em todos os
 * estabelecimentos — o login e a troca de estabelecimento precisam deles antes
 * de existir um estabelecimento no contexto —, e só vale **sem** tenant no
 * contexto: dentro de um estabelecimento, definir a conta (para confirmar o
 * e-mail dela, por exemplo) não mostra a equipe de outro.
 */
export const users = pgTable(
  'users',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),

    /**
     * O proprietário: quem criou o estabelecimento. Tem sempre todas as
     * permissões do catálogo, e por isso não tem perfil — um perfil se edita,
     * e o acesso do dono, não.
     */
    isOwner: boolean().notNull().default(false),
    /** O perfil de quem não é o proprietário. Sem perfil, a pessoa não tem permissão nenhuma. */
    profileId: uuid(),

    isActive: boolean().notNull().default(true),
    /** A última vez que a pessoa entrou **neste** estabelecimento — pelo login ou pela troca. */
    lastLoginAt: timestamp({ withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    // Alvo das chaves estrangeiras compostas: outras tabelas referenciam
    // (tenant_id, id), e não só id, para que o banco exija que a referência
    // fique dentro do mesmo estabelecimento. Ver `tests/rls-guard.test.ts`.
    unique('users_tenant_id_id').on(table.tenantId, table.id),
    // O perfil é do mesmo estabelecimento, e um perfil em uso não se apaga.
    foreignKey({
      name: 'users_perfil_mesmo_tenant',
      columns: [table.tenantId, table.profileId],
      foreignColumns: [profiles.tenantId, profiles.id],
    }).onDelete('restrict'),
    check('users_dono_sem_perfil', sql`NOT (${table.isOwner} AND ${table.profileId} IS NOT NULL)`),
    // Um proprietário por estabelecimento.
    uniqueIndex('users_um_dono_por_tenant')
      .on(table.tenantId)
      .where(sql`${table.isOwner}`),
    index('users_tenant_idx').on(table.tenantId),
    // A mesma pessoa não entra duas vezes na equipe do mesmo estabelecimento.
    unique('users_conta_por_tenant').on(table.tenantId, table.accountId),
    // Os vínculos de uma conta, em todos os estabelecimentos: o login e a troca.
    index('users_account_idx').on(table.accountId),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
    pgPolicy('vinculos_da_conta', {
      as: 'permissive',
      for: 'select',
      to: 'public',
      using: sql`${table.accountId} = ${currentAccountId} AND ${semTenantNoContexto}`,
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
