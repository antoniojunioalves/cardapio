import { sql } from 'drizzle-orm'
import { timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Chave primária padrão de todas as tabelas.
 *
 * UUIDv7 gerado pelo banco, com a função nativa do PostgreSQL 18. Gerar aqui e
 * não na aplicação garante id válido também em seed, migration e INSERT
 * manual, sem custar dependência. A aplicação continua livre para informar um
 * id explícito quando precisar conhecê-lo antes da escrita.
 */
export const primaryId = () =>
  uuid()
    .primaryKey()
    .default(sql`uuidv7()`)

/**
 * Carimbos de tempo em `timestamptz`, sempre UTC. O fuso de exibição vem do
 * campo `timezone` do tenant — guardar hora local no banco torna impossível
 * responder "que horas eram isso em UTC" depois de uma mudança de horário.
 */
export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}

/**
 * Expressão do tenant corrente, lida do contexto da transação.
 *
 * O `nullif` é essencial: sem ele, um contexto definido como string vazia faz
 * `''::uuid` lançar `invalid input syntax for type uuid` em vez de simplesmente
 * não casar. Comprovado em teste.
 *
 * O segundo argumento `true` de `current_setting` devolve NULL quando a
 * variável nunca foi definida, em vez de lançar erro. Comparação com NULL é
 * NULL, que a policy trata como falso — nenhuma linha. Falha fechada.
 */
export const currentTenantId = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`

/**
 * A conta de quem já provou ser quem é — pela senha, pela sessão ou pelo link
 * de um convite —, lida do contexto da transação. Só `account/with-account.ts`
 * a define. O `nullif` e o `true` fazem o mesmo que em `currentTenantId`: sem
 * a variável, nenhuma linha.
 */
export const currentAccountId = sql`nullif(current_setting('app.account_id', true), '')::uuid`

/**
 * O e-mail da conta que se procura — no login, no cadastro e no aceite de um
 * convite —, lido do contexto da transação. Mostra a conta daquele e-mail e
 * nenhuma outra. Só `account/with-account.ts` o define.
 */
export const currentAccountEmail = sql`nullif(current_setting('app.account_email', true), '')`

/** Verdadeiro quando a transação não tem estabelecimento: só a conta. */
export const semTenantNoContexto = sql`nullif(current_setting('app.tenant_id', true), '') IS NULL`
