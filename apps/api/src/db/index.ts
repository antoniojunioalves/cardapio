import { sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { env } from '../config/env.js'
import { infraLogger } from '../lib/logger.js'
import { DRIZZLE_CONFIG } from './drizzle-config.js'
import * as schema from './schema/index.js'

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  connectionTimeoutMillis: env.DATABASE_CONNECT_TIMEOUT_MS,
})

// Sem este handler, um erro numa conexão ociosa — o banco reiniciando, a rede
// caindo — emite um 'error' sem ouvinte no pool e derruba o processo inteiro.
pool.on('error', (error: Error) => {
  infraLogger.error({ err: error }, 'erro em conexão ociosa do pool')
})

/**
 * O `casing` de `DRIZZLE_CONFIG` traduz automaticamente `priceInCents` no
 * TypeScript para `price_in_cents` no banco, mantendo as duas convenções sem
 * precisar declarar o nome da coluna em cada campo. Toda instância do Drizzle
 * no projeto usa a mesma configuração — ver `drizzle-config.ts`.
 */
export const db: NodePgDatabase<typeof schema> = drizzle(pool, {
  schema,
  ...DRIZZLE_CONFIG,
})

export interface DatabaseCheck {
  status: 'ok' | 'error'
  latencyMs: number
  message?: string
}

/**
 * O Drizzle embrulha o erro do driver num DrizzleQueryError cuja mensagem é só
 * "Failed query: select 1". O motivo real — `ECONNREFUSED`, timeout,
 * autenticação recusada — fica na causa, e é justamente ele que quem está
 * depurando uma indisponibilidade precisa ver.
 */
function causaRaiz(error: unknown): string {
  if (error instanceof Error && error.cause instanceof Error) return error.cause.message
  if (error instanceof Error) return error.message
  return 'falha desconhecida'
}

/**
 * Verificação de prontidão. Devolve o resultado em vez de lançar: quem chama é
 * a sonda `/ready`, para quem "o banco está fora" é uma resposta válida a
 * reportar, e não uma exceção a tratar.
 */
export async function checkDatabaseConnection(): Promise<DatabaseCheck> {
  const startedAt = performance.now()

  try {
    await db.execute(sql`select 1`)
    return { status: 'ok', latencyMs: Math.round(performance.now() - startedAt) }
  } catch (error) {
    return {
      status: 'error',
      latencyMs: Math.round(performance.now() - startedAt),
      message: causaRaiz(error),
    }
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end()
}
