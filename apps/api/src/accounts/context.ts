import { sql } from 'drizzle-orm'

import { db } from '../db/index.js'
import type { TenantTransaction } from '../tenant/with-tenant.js'

/**
 * O contexto da conta no banco, o par de `tenant/with-tenant.ts`.
 *
 * `accounts` é global e não tem `tenant_id`: o que a protege são duas
 * variáveis da transação, lidas pelas policies (`db/schema/accounts.ts`).
 *
 * - `app.account_email` mostra a conta **daquele e-mail**, e nenhuma outra.
 *   É o que o login, o cadastro e o aceite de um convite usam para procurar.
 * - `app.account_id` mostra a **própria** conta, e — só sem estabelecimento no
 *   contexto — os vínculos dela em todos os estabelecimentos. Só se define
 *   depois de a pessoa provar quem é: a senha conferiu, a sessão é válida, ou
 *   o link de um convite ou de uma confirmação chegou ao e-mail dela.
 *
 * O `true` do `set_config` faz cada uma valer só na transação, como o tenant.
 */

/** Uma transação só com a conta, sem estabelecimento: os vínculos dela, em todos. */
export async function withAccount<T>(
  accountId: string,
  work: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await definirContaPropria(tx, accountId)
    return work(tx)
  })
}

/** Uma transação só com o e-mail: a conta dele, se existir. */
export async function withAccountEmail<T>(
  email: string,
  work: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await definirEmailDaConta(tx, email)
    return work(tx)
  })
}

/**
 * Mostra, na transação de quem chama, a conta deste e-mail. Dentro de um
 * estabelecimento, serve para o cadastro e o convite procurarem a conta sem
 * sair da transação deles.
 */
export async function definirEmailDaConta(tx: TenantTransaction, email: string): Promise<void> {
  await tx.execute(sql`select set_config('app.account_email', ${email}, true)`)
}

/**
 * Mostra e deixa alterar, na transação de quem chama, a conta deste id. Dentro
 * de um estabelecimento ela não mostra os vínculos da conta em outros: a
 * policy `vinculos_da_conta` só vale sem tenant no contexto.
 */
export async function definirContaPropria(tx: TenantTransaction, accountId: string): Promise<void> {
  await tx.execute(sql`select set_config('app.account_id', ${accountId}, true)`)
}
