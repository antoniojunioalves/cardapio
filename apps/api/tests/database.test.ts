import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

import { env } from '../src/config/env.js'
import { checkDatabaseConnection, closeDatabase, db } from '../src/db/index.js'

/**
 * Testes contra o PostgreSQL de verdade, no banco `cardapio_test`.
 * Pré-requisito: `pnpm db:up`.
 */

// O pool é um singleton do módulo, compartilhado por todos os describes deste
// arquivo. Fechar dentro de um describe o derrubaria para os seguintes.
afterAll(async () => {
  await closeDatabase()
})

describe('conexão com o banco', () => {
  it('a verificação de prontidão alcança o banco', async () => {
    const resultado = await checkDatabaseConnection()

    expect(resultado.status).toBe('ok')
    expect(resultado.latencyMs).toBeGreaterThanOrEqual(0)
    expect(resultado.message).toBeUndefined()
  })

  it('conecta no banco de testes, e não no de desenvolvimento', async () => {
    const resultado = await db.execute<{ current_database: string }>(sql`select current_database()`)

    expect(resultado.rows[0]?.current_database).toBe('cardapio_test')
  })

  it('conecta com a role restrita, sem poder de contornar o RLS', async () => {
    const resultado = await db.execute<{
      usuario: string
      super: boolean
      bypassrls: boolean
    }>(
      sql`select current_user as usuario, rolsuper as super, rolbypassrls as bypassrls
          from pg_roles where rolname = current_user`,
    )

    const role = resultado.rows[0]

    expect(role?.usuario).toBe('cardapio_app')
    // Se qualquer um destes virar true, todas as policies de isolamento entre
    // tenants passam a ser ignoradas em silêncio.
    expect(role?.super).toBe(false)
    expect(role?.bypassrls).toBe(false)
  })

  it('o PostgreSQL oferece uuidv7() nativo, usado como padrão das chaves primárias', async () => {
    const resultado = await db.execute<{ id: string }>(sql`select uuidv7() as id`)
    const id = resultado.rows[0]?.id ?? ''

    // O dígito de versão do UUID é o primeiro caractere do terceiro grupo.
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})

/**
 * O Drizzle embrulha o erro do PostgreSQL num DrizzleQueryError cuja mensagem
 * é só "Failed query: …". O motivo real — que é o que interessa afirmar — fica
 * na causa. Sem desembrulhar, o teste passaria com qualquer falha de query.
 */
async function motivoDaRecusa(operacao: Promise<unknown>): Promise<string> {
  try {
    await operacao
    return 'NENHUM ERRO: a operação foi permitida'
  } catch (error) {
    const causa = error instanceof Error && error.cause instanceof Error ? error.cause : error
    return causa instanceof Error ? causa.message : String(causa)
  }
}

/**
 * Esta é a barreira que sustenta todo o isolamento entre tenants.
 *
 * O dono de uma tabela no PostgreSQL pode desligar o Row-Level Security dela
 * com `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`. Se a role da aplicação
 * tivesse DDL, uma injeção de SQL derrubaria as policies de todos os tenants
 * de uma vez. A role da aplicação não tem — e este teste é o que garante que
 * continue assim, mesmo que alguém "resolva um erro de permissão" no futuro
 * concedendo privilégio demais.
 */
describe('separação de privilégios entre as roles', () => {
  it('a role da aplicação NÃO consegue criar tabela', async () => {
    const erro = await motivoDaRecusa(db.execute(sql`create table proibida (id int)`))
    expect(erro).toMatch(/permission denied/i)
  })

  it('a role da aplicação NÃO consegue criar schema', async () => {
    const erro = await motivoDaRecusa(db.execute(sql`create schema proibido`))
    expect(erro).toMatch(/permission denied/i)
  })

  it('a role de migration consegue criar e remover tabela', async () => {
    const pool = new Pool({ connectionString: env.MIGRATION_DATABASE_URL, max: 1 })
    const migrationDb = drizzle(pool)

    try {
      await migrationDb.execute(sql`create table permitida (id int)`)

      const dono = await migrationDb.execute<{ dono: string }>(
        sql`select tableowner as dono from pg_tables where tablename = 'permitida'`,
      )
      expect(dono.rows[0]?.dono).toBe('cardapio_migrator')

      await migrationDb.execute(sql`drop table permitida`)
    } finally {
      await pool.end()
    }
  })
})
