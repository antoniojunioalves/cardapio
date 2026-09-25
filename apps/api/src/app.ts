import { randomUUID } from 'node:crypto'

import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import Fastify, { type FastifyInstance } from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'

import { env } from './config/env.js'
import { checkDatabaseConnection, type DatabaseCheck } from './db/index.js'
import { loggerOptions } from './lib/logger.js'
import { registerErrorHandler } from './plugins/error-handler.js'
import { registerOpenApi } from './plugins/openapi.js'
import { registerRateLimit } from './plugins/rate-limit.js'
import { healthRoutes } from './routes/health.js'

export interface BuildAppOptions {
  /** Substituível nos testes para exercitar o caminho de banco indisponível. */
  checkDatabase?: () => Promise<DatabaseCheck>
  /** Desliga o limite de requisições em testes que fazem muitas chamadas. */
  rateLimit?: boolean
}

/**
 * Monta a aplicação sem subir servidor.
 *
 * A separação entre montar e escutar é o que permite os testes usarem
 * `app.inject()` — requisições reais pelo pipeline completo do Fastify,
 * sem abrir porta nem depender de rede.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const instance = Fastify({
    logger: loggerOptions,
    // Respeita um x-request-id que já venha do proxy; se não vier, gera um.
    // Nos logs o campo aparece como `reqId`, a convenção do Fastify. Renomear
    // exigiria a opção `logController`, que espera uma subclasse inteira —
    // complexidade que não se justifica por um rótulo.
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  })

  // Os schemas Zod das rotas passam a valer tanto para validar a entrada
  // quanto para serializar a saída e gerar o OpenAPI.
  instance.setValidatorCompiler(validatorCompiler)
  instance.setSerializerCompiler(serializerCompiler)

  await instance.register(helmet)
  await instance.register(cors, { origin: env.WEB_ORIGIN, credentials: true })

  if (options.rateLimit !== false) {
    await registerRateLimit(instance)
  }

  // Antes das rotas: o @fastify/swagger só enxerga o que for registrado depois dele.
  await registerOpenApi(instance)

  registerErrorHandler(instance)

  await instance.register(healthRoutes, {
    checkDatabase: options.checkDatabase ?? checkDatabaseConnection,
  })

  return instance
}
