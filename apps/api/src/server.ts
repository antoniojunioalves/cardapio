import { buildApp } from './app.js'
import { env } from './config/env.js'

async function main(): Promise<void> {
  const app = await buildApp()

  // Encerramento gracioso: para de aceitar conexões novas e deixa as que já
  // estão em andamento terminarem antes de o processo sair.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      app.log.info({ signal }, 'encerrando a API')
      void app.close().then(
        () => {
          process.exit(0)
        },
        (error: unknown) => {
          app.log.error({ err: error }, 'falha ao encerrar')
          process.exit(1)
        },
      )
    })
  }

  await app.listen({ host: env.API_HOST, port: env.API_PORT })
}

main().catch((error: unknown) => {
  // Falha antes de existir aplicação — não há logger ainda, vai para stderr.
  console.error('Não foi possível iniciar a API:', error)
  process.exit(1)
})
