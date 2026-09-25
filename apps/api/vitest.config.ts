import { defineConfig } from 'vitest/config'

/**
 * Os testes rodam contra um PostgreSQL de verdade, num banco separado do de
 * desenvolvimento. Ver `docker/postgres/init/02-test-database.sh` para o
 * motivo — resumido: RLS não se prova com mock.
 *
 * Pré-requisito: `pnpm db:up`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://cardapio_app:cardapio_app@localhost:5432/cardapio_test',
      MIGRATION_DATABASE_URL:
        process.env.TEST_MIGRATION_DATABASE_URL ??
        'postgresql://cardapio_migrator:cardapio_migrator@localhost:5432/cardapio_test',
    },
    // O pool de conexões é um singleton do módulo; rodar arquivos de teste em
    // processos separados evita que fechar o pool num afete os outros.
    fileParallelism: false,
  },
})
