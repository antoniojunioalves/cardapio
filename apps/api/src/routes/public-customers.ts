import { clienteIdentificadoSchema, identificarClienteSchema } from '@repo/shared'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { identificarCliente } from '../customers/service.js'

/**
 * Quantas identificações um IP pode fazer por minuto.
 *
 * Um cliente de verdade faz uma, talvez duas se errar um dígito. O limite
 * existe para a rota não virar ferramenta de varredura de endereços: com o
 * global (centenas por minuto), daria para testar um bairro inteiro de
 * telefones em pouco tempo.
 */
export const LIMITE_DE_IDENTIFICACOES = 10

export function publicCustomerRoutes(instance: FastifyInstance): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()

  // POST, e não GET com o telefone na URL: URL vai parar em log de acesso,
  // histórico do navegador e cabeçalho Referer.
  typed.post(
    '/:tenantSlug/customers/identify',
    {
      config: { rateLimit: { max: LIMITE_DE_IDENTIFICACOES, timeWindow: '1 minute' } },
      schema: {
        tags: ['Cardápio público'],
        summary: 'Identifica o cliente pelo telefone, no checkout',
        description:
          'Sem autenticação. Devolve o primeiro nome e os endereços salvos **mascarados**, ou ' +
          '`cliente: null`. O endereço completo nunca é devolvido: o pedido referencia o ' +
          'endereço pelo id. Limite próprio de requisições por IP.',
        params: z.object({ tenantSlug: z.string() }),
        body: identificarClienteSchema,
        response: { 200: clienteIdentificadoSchema },
      },
    },
    async (request, reply) => {
      const resposta = await identificarCliente(request.params.tenantSlug, request.body.phone, {
        ip: request.ip,
      })

      // Dado pessoal: nenhum cache, nem do navegador, pode guardar.
      void reply.header('cache-control', 'no-store')

      return resposta
    },
  )
}
