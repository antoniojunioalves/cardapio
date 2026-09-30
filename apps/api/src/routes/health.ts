import { app as product } from '@repo/config'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { env, isProduction } from '../config/env.js'
import type { DatabaseCheck } from '../db/index.js'

const databaseCheckSchema = z.object({
  status: z.enum(['ok', 'error']),
  latencyMs: z.number(),
  message: z.string().optional(),
})

const healthSchema = z.object({
  status: z.literal('ok'),
  name: z.string(),
  environment: z.string(),
  uptimeSeconds: z.number().int(),
  timestamp: z.string(),
})

const readySchema = z.object({
  status: z.enum(['ready', 'unavailable']),
  checks: z.object({ database: databaseCheckSchema }),
  timestamp: z.string(),
})

/**
 * O que a sonda pública pode dizer do banco. O motivo da falha
 * (`connect ECONNREFUSED 10.0.3.4:5432`) revela a rede interna: em produção
 * ele fica só no log.
 */
export function verificacaoPublica(database: DatabaseCheck, revelarMotivo: boolean): DatabaseCheck {
  if (revelarMotivo || database.message === undefined) return database
  return { status: database.status, latencyMs: database.latencyMs }
}

export interface HealthRoutesOptions {
  /**
   * Injetável para que o caminho de falha possa ser testado de verdade, sem
   * mock de módulo e sem derrubar o pool que os outros testes compartilham.
   */
  checkDatabase: () => Promise<DatabaseCheck>
}

/**
 * Sondas de infraestrutura. Ficam fora do prefixo `/api/v1` de propósito:
 * orquestradores esperam encontrá-las na raiz, e elas não fazem parte do
 * contrato público da API.
 *
 * A distinção entre as duas é o que importa:
 *
 * - `/health` (liveness) responde se o processo está vivo. **Não** consulta o
 *   banco. Se consultasse, uma oscilação do banco faria o orquestrador matar e
 *   reiniciar processos saudáveis — justamente quando o sistema está frágil.
 * - `/ready` (readiness) responde se dá para mandar tráfego, e para isso
 *   consulta o banco. Devolve **503** quando não dá, que é o sinal que tira a
 *   instância do balanceador sem reiniciá-la.
 */
export function healthRoutes(instance: FastifyInstance, options: HealthRoutesOptions): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()

  typed.get(
    '/health',
    {
      schema: {
        tags: ['Infraestrutura'],
        summary: 'Liveness — o processo está de pé',
        response: { 200: healthSchema },
      },
    },
    () => ({
      status: 'ok' as const,
      name: product.name,
      environment: env.NODE_ENV,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    }),
  )

  typed.get(
    '/ready',
    {
      schema: {
        tags: ['Infraestrutura'],
        summary: 'Readiness — dá para atender tráfego',
        response: { 200: readySchema, 503: readySchema },
      },
    },
    async (request, reply) => {
      const database = await options.checkDatabase()
      const ready = database.status === 'ok'
      if (!ready) request.log.error({ database }, 'banco indisponível na sonda de prontidão')

      return reply.status(ready ? 200 : 503).send({
        status: ready ? ('ready' as const) : ('unavailable' as const),
        checks: { database: verificacaoPublica(database, !isProduction) },
        timestamp: new Date().toISOString(),
      })
    },
  )
}
