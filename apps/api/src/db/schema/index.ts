/**
 * Schema do banco.
 *
 * Convenções que valem para toda tabela nova:
 *
 * - Chave primária por `primaryId()` — UUIDv7 gerado pelo banco.
 * - Carimbos por `...timestamps` — `timestamptz`, sempre UTC.
 * - Valores monetários em `integer` de centavos, com a unidade no nome
 *   (`price_in_cents`).
 * - Nomes em camelCase no TypeScript; o Drizzle converte para snake_case.
 *
 * **Toda tabela com coluna `tenant_id` precisa de `.enableRLS()` e de uma
 * policy de isolamento.** Não é lembrete: existe um teste que varre o catálogo
 * do PostgreSQL e falha se alguma escapar. Ele também exige que toda tabela
 * SEM `tenant_id` esteja declarada como global — então criar tabela nova
 * obriga a escolher entre "é da plataforma" e "é de estabelecimento".
 *
 * Ver `tests/rls-guard.test.ts`.
 */
export * from './audit.js'
export * from './plans.js'
export * from './platform.js'
export * from './rbac.js'
export * from './shared.js'
export * from './tenants.js'
export * from './users.js'
