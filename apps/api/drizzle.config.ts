import { defineConfig } from 'drizzle-kit'

/**
 * `drizzle-kit generate` compara o schema TypeScript com as migrations já
 * existentes e não toca no banco — por isso funciona sem conexão definida.
 *
 * Aplicar as migrations é feito por `src/db/migrate.ts`, com a role `migrator`,
 * que é a única com DDL. A `DATABASE_URL` da aplicação não serviria aqui: ela
 * usa a role sem DDL, exatamente para que a API em execução não consiga
 * alterar tabelas.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: { url: process.env.MIGRATION_DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
})
