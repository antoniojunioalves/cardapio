import { tmpdir } from 'node:os'
import path from 'node:path'

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
    // Migra o banco de testes uma vez, antes de tudo.
    globalSetup: ['./tests/global-setup.ts'],
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://cardapio_app:cardapio_app@localhost:5432/cardapio_test',
      MIGRATION_DATABASE_URL:
        process.env.TEST_MIGRATION_DATABASE_URL ??
        'postgresql://cardapio_migrator:cardapio_migrator@localhost:5432/cardapio_test',
      // Segredo fixo e exclusivo dos testes: eles precisam de tokens
      // reproduzíveis, e o valor jamais sai daqui.
      JWT_SECRET: 'segredo-exclusivo-da-suite-de-testes-nao-usar-em-lugar-nenhum',
      // Uploads dos testes vão para o diretório temporário do sistema, nunca
      // para o storage de desenvolvimento.
      STORAGE_LOCAL_PATH: path.join(tmpdir(), 'cardapio-test-uploads'),
    },
    // O pool de conexões é um singleton do módulo; rodar arquivos de teste em
    // processos separados evita que fechar o pool num afete os outros.
    //
    // O Vitest sugere `isolate: false` para ganhar alguns centésimos. Não dá:
    // sem isolamento os módulos são compartilhados entre arquivos, e o
    // `closeDatabase()` do primeiro deixaria os seguintes sem pool.
    fileParallelism: false,
  },
})
