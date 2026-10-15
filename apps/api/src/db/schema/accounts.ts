import { sql } from 'drizzle-orm'
import { check, pgPolicy, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core'

import { currentAccountEmail, currentAccountId, primaryId, timestamps } from './shared.js'

/**
 * A conta de uma pessoa da equipe: o dono e os funcionários. Um e-mail, uma
 * senha e o nome — os mesmos em todo estabelecimento em que ela trabalha.
 *
 * O que a pessoa é **em cada estabelecimento** — proprietária ou não, o
 * perfil, se está ativa — é o vínculo, em `users`. Uma conta tem um vínculo
 * por estabelecimento, e pode ter vários.
 *
 * O cliente do cardápio não tem conta aqui, e não vai ter: quando a conta de
 * cliente existir, ela é outra tabela, do estabelecimento. O mesmo e-mail pode
 * ser das duas coisas, e as duas nunca dividem unicidade.
 *
 * **É global, e por isso não tem `tenant_id` nem `tenant_isolation`.** O RLS
 * dela é outro, e nenhuma das policies deixa listar contas:
 *
 * - `conta_por_email`: lê a conta do e-mail em `app.account_email` — o login,
 *   o cadastro e o aceite de um convite procuram por ele.
 * - `conta_nova`: cria uma conta só com o e-mail de `app.account_email`.
 * - `conta_propria`: a conta de `app.account_id`, que só é definida depois de
 *   a pessoa provar quem é (`account/with-account.ts`).
 * - `contas_da_equipe`: as contas que têm vínculo no estabelecimento do
 *   contexto. A subconsulta em `users` já passa pelo RLS dele, então ela só
 *   enxerga a equipe do estabelecimento — e, sem estabelecimento, só os
 *   vínculos da própria conta.
 *
 * `passwordHash` guarda o resultado completo do argon2id, que já carrega o
 * algoritmo, os parâmetros e o salt na própria string.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: primaryId(),
    email: varchar({ length: 254 }).notNull(),
    name: varchar({ length: 120 }).notNull(),
    passwordHash: varchar({ length: 255 }).notNull(),
    /** Quando a pessoa provou ser dona do e-mail: pelo link de confirmação ou pelo de um convite. */
    emailVerifiedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    // O e-mail é o login: um por pessoa na plataforma.
    unique('accounts_email').on(table.email),
    // Sem isto, `Ze@exemplo.com` e `ze@exemplo.com` seriam duas contas.
    check('accounts_email_minusculo', sql`${table.email} = lower(${table.email})`),
    pgPolicy('conta_por_email', {
      as: 'permissive',
      for: 'select',
      to: 'public',
      using: sql`${table.email} = ${currentAccountEmail}`,
    }),
    pgPolicy('conta_nova', {
      as: 'permissive',
      for: 'insert',
      to: 'public',
      withCheck: sql`${table.email} = ${currentAccountEmail}`,
    }),
    pgPolicy('conta_propria', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${table.id} = ${currentAccountId}`,
      withCheck: sql`${table.id} = ${currentAccountId}`,
    }),
    pgPolicy('contas_da_equipe', {
      as: 'permissive',
      for: 'select',
      to: 'public',
      // `users` pelo nome, e não pelo objeto do Drizzle: `users` aponta para
      // `accounts`, e o import de volta seria circular.
      using: sql`exists (select 1 from users where users.account_id = ${table.id})`,
    }),
  ],
).enableRLS()

export type Account = typeof accounts.$inferSelect
