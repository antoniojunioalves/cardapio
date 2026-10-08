import { randomUUID } from 'node:crypto'

import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'

import { env } from './config/env.js'
import { checkDatabaseConnection, type DatabaseCheck } from './db/index.js'
import { loggerOptions } from './lib/logger.js'
import { registerErrorHandler } from './plugins/error-handler.js'
import { registerOpenApi } from './plugins/openapi.js'
import { registerRateLimit } from './plugins/rate-limit.js'
import { registerUploads } from './plugins/uploads.js'
import { adminCatalogRoutes } from './routes/admin-catalog.js'
import { adminCustomizationRoutes } from './routes/admin-customization.js'
import { adminEmailConfirmationRoutes } from './routes/admin-email-confirmation.js'
import { adminImageRoutes } from './routes/admin-images.js'
import { adminOrderRoutes } from './routes/admin-orders.js'
import { adminPlanRoutes } from './routes/admin-plan.js'
import { adminSettingsRoutes } from './routes/admin-settings.js'
import { adminProfileRoutes } from './routes/admin-profiles.js'
import { adminUserRoutes } from './routes/admin-users.js'
import { authRoutes } from './routes/auth.js'
import { healthRoutes } from './routes/health.js'
import { publicCustomerRoutes } from './routes/public-customers.js'
import { publicMenuRoutes } from './routes/public-menu.js'
import { publicOrderRoutes } from './routes/public-orders.js'
import { publicSignupRoutes } from './routes/public-signup.js'
import { registerRealtime } from './realtime/plugin.js'

export interface BuildAppOptions {
  /** Substituível nos testes para exercitar o caminho de banco indisponível. */
  checkDatabase?: () => Promise<DatabaseCheck>
  /** Desliga o limite de requisições em testes que fazem muitas chamadas. */
  rateLimit?: boolean
  /** Recebe cada rota registrada — é o inventário que o teste-guarda de rotas confere. */
  aoRegistrarRota?: (rota: RouteOptions) => void
  /**
   * Desligado, a aplicação sobe sem o canal ao vivo — que conecta ao banco no
   * `ready`. É o que deixa `pnpm postman` gerar a coleção sem o banco de pé.
   */
  tempoReal?: boolean
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
    // Ver `TRUST_PROXY` em config/env.ts: define de onde vem o IP dos limites.
    trustProxy: env.TRUST_PROXY,
    bodyLimit: env.JSON_BODY_LIMIT_BYTES,
  })

  // Os schemas Zod das rotas passam a valer tanto para validar a entrada
  // quanto para serializar a saída e gerar o OpenAPI.
  if (options.aoRegistrarRota) {
    const registrar = options.aoRegistrarRota
    instance.addHook('onRoute', (rota) => {
      registrar(rota)
    })
  }

  instance.setValidatorCompiler(validatorCompiler)
  instance.setSerializerCompiler(serializerCompiler)

  await instance.register(helmet)
  await instance.register(cookie)
  await instance.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
    // O padrão do @fastify/cors 11 é só GET, HEAD e POST; o painel altera
    // status (PATCH), substitui horários (PUT) e exclui produtos (DELETE).
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })

  if (options.rateLimit !== false) {
    await registerRateLimit(instance)
  }

  // Antes das rotas: o @fastify/swagger só enxerga o que for registrado depois dele.
  await registerOpenApi(instance)

  registerErrorHandler(instance)

  await registerUploads(instance)

  await instance.register(healthRoutes, {
    checkDatabase: options.checkDatabase ?? checkDatabaseConnection,
  })

  // Rotas de domínio ficam sob o prefixo versionado. As sondas acima não: são
  // infraestrutura, não contrato público.
  await instance.register(authRoutes, { prefix: '/api/v1/auth' })
  await instance.register(adminSettingsRoutes, { prefix: '/api/v1/admin' })
  await instance.register(adminImageRoutes, { prefix: '/api/v1/admin' })
  await instance.register(adminCatalogRoutes, { prefix: '/api/v1/admin' })
  await instance.register(adminCustomizationRoutes, { prefix: '/api/v1/admin' })
  await instance.register(adminOrderRoutes, { prefix: '/api/v1/admin' })
  await instance.register(adminUserRoutes, { prefix: '/api/v1/admin' })
  await instance.register(adminProfileRoutes, { prefix: '/api/v1/admin' })
  await instance.register(adminPlanRoutes, { prefix: '/api/v1/admin' })
  await instance.register(adminEmailConfirmationRoutes, { prefix: '/api/v1/admin' })
  await instance.register(publicMenuRoutes, { prefix: '/api/v1/public' })
  await instance.register(publicCustomerRoutes, { prefix: '/api/v1/public' })
  await instance.register(publicOrderRoutes, { prefix: '/api/v1/public' })
  await instance.register(publicSignupRoutes, { prefix: '/api/v1/public' })

  if (options.tempoReal !== false) await registerRealtime(instance)

  return instance
}
