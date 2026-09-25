import { buildApp } from './app.js'
import { env } from './config/env.js'
import { closeDatabase } from './db/index.js'

async function main(): Promise<void> {
  const app = await buildApp()

  // Encerramento gracioso: para de aceitar conexões novas, deixa as que já
  // estão em andamento terminarem e só então devolve o pool ao banco. Fechar
  // o pool antes disso abortaria transações em curso.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      app.log.info({ signal }, 'encerrando a API')

      void (async () => {
        try {
          await app.close()
          await closeDatabase()
          process.exit(0)
        } catch (error) {
          app.log.error({ err: error }, 'falha ao encerrar')
          process.exit(1)
        }
      })()
    })
  }

  await app.listen({ host: env.API_HOST, port: env.API_PORT })
}

main().catch((error: unknown) => {
  // Falha antes de existir aplicação — não há logger de requisição ainda.
  console.error('Não foi possível iniciar a API:', error)
  process.exit(1)
})
