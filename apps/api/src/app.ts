import { randomUUID } from 'node:crypto'

import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import Fastify, { type FastifyInstance } from 'fastify'

import { env } from './config/env.js'
import { loggerOptions } from './lib/logger.js'
import { registerErrorHandler } from './plugins/error-handler.js'
import { healthRoutes } from './routes/health.js'

/**
 * Monta a aplicação sem subir servidor.
 *
 * A separação entre montar e escutar é o que permite os testes usarem
 * `app.inject()` — requisições reais pelo pipeline completo do Fastify,
 * sem abrir porta nem depender de rede.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const instance = Fastify({
    logger: loggerOptions,
    // Respeita um x-request-id que já venha do proxy; se não vier, gera um.
    // Nos logs o campo aparece como `reqId`, a convenção do Fastify. Renomear
    // exigiria a opção `logController`, que espera uma subclasse inteira —
    // complexidade que não se justifica por um rótulo.
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  })

  await instance.register(helmet)
  await instance.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
  })

  registerErrorHandler(instance)

  await instance.register(healthRoutes)

  return instance
}
