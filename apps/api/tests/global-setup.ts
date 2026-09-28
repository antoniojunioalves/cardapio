import path from 'node:path'

import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

import { FORMAS_DE_PAGAMENTO } from '../src/db/catalogs.js'
import { DRIZZLE_CONFIG } from '../src/db/drizzle-config.js'
import { paymentMethods } from '../src/db/schema/index.js'

/**
 * Aplica as migrations no banco de testes antes de qualquer teste rodar.
 *
 * Usa a role `migrator`, a única com DDL — a mesma que aplica em produção.
 * Assim o schema contra o qual os testes rodam é construído exatamente pelo
 * caminho que será usado de verdade, e não por um atalho só deles.
 */
const MIGRATION_URL =
  process.env.TEST_MIGRATION_DATABASE_URL ??
  'postgresql://cardapio_migrator:cardapio_migrator@localhost:5432/cardapio_test'

export default async function setup(): Promise<void> {
  const pool = new Pool({ connectionString: MIGRATION_URL, max: 1, connectionTimeoutMillis: 5000 })

  try {
    const db = drizzle(pool, DRIZZLE_CONFIG)

    await migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, '../drizzle') })

    // Catálogos da plataforma. Em produção são semeados no deploy; aqui, para
    // que os testes rodem contra um banco parecido com o real em vez de um
    // vazio que só eles conhecem.
    for (const forma of FORMAS_DE_PAGAMENTO) {
      await db.insert(paymentMethods).values(forma).onConflictDoNothing({
        target: paymentMethods.code,
      })
    }
  } catch (error) {
    const motivo = error instanceof Error ? (error.cause ?? error) : error
    throw new Error(
      `Não foi possível preparar o banco de testes.\n\n` +
        `Os testes da API rodam contra um PostgreSQL de verdade — as policies de\n` +
        `Row-Level Security não podem ser comprovadas com mock. Suba o banco com:\n\n` +
        `    pnpm db:up\n\n` +
        `Motivo: ${String(motivo)}`,
      { cause: error },
    )
  } finally {
    await pool.end()
  }
}
