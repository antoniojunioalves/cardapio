import { novoPedidoSchema, pedidoCriadoSchema } from '@repo/shared'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { criarPedido } from '../orders/service.js'
import { storage } from '../storage/index.js'

/**
 * Quantos pedidos um IP pode enviar por minuto. Uma família pede uma vez;
 * repetir o envio com a mesma chave não cria pedido novo, mas conta aqui.
 */
export const LIMITE_DE_PEDIDOS = 10

export function publicOrderRoutes(instance: FastifyInstance): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()

  typed.post(
    '/:tenantSlug/orders',
    {
      config: { rateLimit: { max: LIMITE_DE_PEDIDOS, timeWindow: '1 minute' } },
      schema: {
        tags: ['Cardápio público'],
        summary: 'Envia um pedido',
        description:
          'Sem autenticação. O corpo traz só ids, quantidades e escolhas: preços, taxa e total ' +
          'são recalculados no servidor. Responde **422** (`ORDER_REJECTED`) com todos os ' +
          'problemas encontrados, e **409** (`PRICE_CHANGED`) quando o total daqui difere de ' +
          '`expectedTotalInCents`. Repetir o envio com a mesma `idempotencyKey` devolve o ' +
          'pedido já criado.',
        params: z.object({ tenantSlug: z.string() }),
        body: novoPedidoSchema,
        response: { 201: pedidoCriadoSchema },
      },
    },
    async (request, reply) => {
      const pedido = await criarPedido(request.params.tenantSlug, request.body, storage)
      void reply.header('cache-control', 'no-store')
      return reply.status(201).send(pedido)
    },
  )
}
