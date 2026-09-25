import { existsSync } from 'node:fs'
import path from 'node:path'

import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

import { env } from '../config/env.js'
import { infraLogger } from '../lib/logger.js'

/**
 * Aplica as migrations com a role `migrator`, e não com a da aplicação.
 *
 * O pool aqui é próprio e efêmero, separado do pool da API de propósito: a
 * conexão com poder de DDL existe só durante este comando e nunca fica
 * disponível ao processo que atende requisições. É o que impede que uma
 * injeção de SQL alcance `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`.
 */

// Resolve a partir deste arquivo, e não do diretório de trabalho, para que o
// comando funcione igual rodando de `src/` via tsx ou de `dist/` já compilado.
const migrationsFolder = path.resolve(import.meta.dirname, '../../drizzle')

async function main(): Promise<void> {
  if (!env.MIGRATION_DATABASE_URL) {
    throw new Error(
      'MIGRATION_DATABASE_URL não definida. Ela usa a role com DDL (cardapio_migrator) ' +
        'e é separada da DATABASE_URL da aplicação de propósito. Veja o .env.example.',
    )
  }

  if (!existsSync(path.join(migrationsFolder, 'meta', '_journal.json'))) {
    infraLogger.info(
      { migrationsFolder },
      'nenhuma migration gerada ainda — rode `pnpm db:generate` depois de criar a primeira tabela',
    )
    return
  }

  const pool = new Pool({ connectionString: env.MIGRATION_DATABASE_URL, max: 1 })

  try {
    infraLogger.info({ migrationsFolder }, 'aplicando migrations')
    await migrate(drizzle(pool), { migrationsFolder })
    infraLogger.info('migrations aplicadas')
  } finally {
    await pool.end()
  }
}

try {
  await main()
} catch (error) {
  infraLogger.fatal({ err: error }, 'falha ao aplicar migrations')
  process.exit(1)
}
