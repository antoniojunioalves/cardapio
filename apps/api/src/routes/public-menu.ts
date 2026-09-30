import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { obterCardapioPublico } from '../public-menu/service.js'
import { storage } from '../storage/index.js'

/**
 * Cardápio público — a única área da API sem login.
 *
 * O tenant vem do slug da URL, traduzido para id pelo servidor. Nenhum
 * parâmetro, cabeçalho ou corpo escolhe o estabelecimento de outra forma.
 */

const statusSchema = z.union([
  z.object({ aberto: z.literal(true), fechaAs: z.string() }),
  z.object({
    aberto: z.literal(false),
    motivo: z.enum(['PAUSADO', 'FORA_DO_HORARIO', 'SEM_HORARIO_CADASTRADO', 'NAO_RECEBENDO']),
    proximaAbertura: z
      .object({ dayOfWeek: z.number(), opensAt: z.string(), emDias: z.number() })
      .optional(),
  }),
])

const opcaoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  priceDeltaInCents: z.number(),
  isAvailable: z.boolean(),
})

const grupoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  minSelections: z.number(),
  maxSelections: z.number(),
  isRequired: z.boolean(),
  options: z.array(opcaoSchema),
})

const produtoSchema = z.object({
  id: z.uuid(),
  type: z.enum(['SIMPLE', 'COMBO']),
  name: z.string(),
  description: z.string().nullable(),
  priceInCents: z.number(),
  imageUrl: z.string().nullable(),
  isAvailable: z.boolean(),
  optionGroups: z.array(grupoSchema),
  combo: z
    .object({
      items: z.array(z.object({ name: z.string(), quantity: z.number() })),
      precoAvulsoEmCentavos: z.number(),
    })
    .nullable(),
})

const cardapioSchema = z.object({
  establishment: z.object({
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    logoUrl: z.string().nullable(),
    coverUrl: z.string().nullable(),
    timezone: z.string(),
    whatsappPhone: z.string().nullable(),
    contactPhone: z.string().nullable(),
    address: z
      .object({
        street: z.string(),
        number: z.string().nullable(),
        complement: z.string().nullable(),
        neighborhood: z.string().nullable(),
        city: z.string().nullable(),
        state: z.string().nullable(),
        postalCode: z.string().nullable(),
      })
      .nullable(),
    prepTimeMinMinutes: z.number().nullable(),
    prepTimeMaxMinutes: z.number().nullable(),
    minimumOrderInCents: z.number(),
  }),
  status: statusSchema,
  hours: z.array(z.object({ dayOfWeek: z.number(), opensAt: z.string(), closesAt: z.string() })),
  delivery: z.object({
    deliveryEnabled: z.boolean(),
    pickupEnabled: z.boolean(),
    feeMode: z.enum(['FIXED', 'BY_REGION']),
    fixedFeeInCents: z.number().nullable(),
    regions: z.array(z.object({ id: z.uuid(), name: z.string(), feeInCents: z.number() })),
    estimatedMinMinutes: z.number().nullable(),
    estimatedMaxMinutes: z.number().nullable(),
  }),
  paymentMethods: z.array(
    z.object({ id: z.uuid(), code: z.string(), name: z.string(), kind: z.string() }),
  ),
  categories: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      description: z.string().nullable(),
      imageUrl: z.string().nullable(),
      products: z.array(produtoSchema),
    }),
  ),
})

export function publicMenuRoutes(instance: FastifyInstance): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()

  typed.get(
    '/:tenantSlug/menu',
    {
      schema: {
        tags: ['Cardápio público'],
        summary: 'Cardápio, status e condições de entrega de um estabelecimento',
        description:
          'Sem autenticação. Estabelecimento inexistente ou suspenso responde 404, igualmente. ' +
          'O status e a disponibilidade são informativos: o pedido é validado de novo no servidor.',
        params: z.object({ tenantSlug: z.string() }),
        response: { 200: cardapioSchema },
      },
    },
    async (request, reply) => {
      const cardapio = await obterCardapioPublico(request.params.tenantSlug, storage)

      // "Aberto" e "esgotado" mudam de um minuto para o outro. Guardar a
      // resposta em cache mostraria a lanchonete aberta depois de fechar.
      void reply.header('cache-control', 'no-cache')

      return cardapio
    },
  )
}
