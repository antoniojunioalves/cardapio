import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { requireAuth, tenantContextOf } from '../auth/middleware.js'
import { NotFoundError } from '../lib/errors.js'
import { usoDoPlano } from '../plans/service.js'
import { findTenantById } from '../tenant/repository.js'
import { withTenant } from '../tenant/with-tenant.js'

const usoSchema = z.object({
  plan: z.object({ code: z.string(), name: z.string() }).nullable(),
  orders: z.object({
    used: z.number(),
    limit: z.number().nullable(),
    /** Limite mais a tolerância de 10%: a partir daqui, o cardápio para de receber pedidos. */
    ceiling: z.number().nullable(),
    state: z.enum(['LIVRE', 'PERTO_DO_LIMITE', 'NA_TOLERANCIA', 'BLOQUEADO']),
  }),
  users: z.object({ active: z.number(), limit: z.number().nullable() }),
  /** Todo produto conta: combo, indisponível, sem foto. */
  products: z.object({ used: z.number(), limit: z.number().nullable() }),
  categories: z.object({ used: z.number(), limit: z.number().nullable() }),
})

export function adminPlanRoutes(instance: FastifyInstance): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()

  typed.get(
    '/plan',
    {
      schema: {
        tags: ['Plano'],
        summary: 'Uso do plano: pedidos do mês, usuários, produtos e categorias',
        description:
          'Qualquer usuário logado vê — é o que explica ao atendente por que o cardápio parou ' +
          'de receber pedidos. O mês é o do calendário, no fuso do estabelecimento.',
        response: { 200: usoSchema },
        security: [{ bearerAuth: [] }],
      },
      onRequest: requireAuth(),
    },
    async (request) => {
      const context = tenantContextOf(request)
      const tenant = await findTenantById(context.tenantId)
      if (!tenant) throw new NotFoundError('Estabelecimento não encontrado.')

      const uso = await withTenant(context, (tx) => usoDoPlano(tx, tenant.timezone, new Date()))
      return {
        plan: uso.plano && { code: uso.plano.codigo, name: uso.plano.nome },
        orders: {
          used: uso.pedidos.usados,
          limit: uso.pedidos.limite,
          ceiling: uso.pedidos.teto,
          state: uso.pedidos.situacao,
        },
        users: { active: uso.usuarios.ativos, limit: uso.usuarios.limite },
        products: { used: uso.produtos.usados, limit: uso.produtos.limite },
        categories: { used: uso.categorias.usados, limit: uso.categorias.limite },
      }
    },
  )
}
