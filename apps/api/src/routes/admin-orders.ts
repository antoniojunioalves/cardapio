import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { currentUser, requireAnyOf, requireAuth, tenantContextOf } from '../auth/middleware.js'
import { exigirPermissao } from '../auth/permissions.js'
import { orderStatus } from '../db/schema/index.js'
import {
  listarPedidos,
  mudarStatusDoPedido,
  obterPedido,
  resumoDosPedidos,
  type PedidoDoPainel,
} from '../orders/service.js'

/**
 * Pedidos no painel do estabelecimento.
 *
 * A lista, o resumo que o painel mostra em toda tela, o detalhe e a mudança de
 * status — que tem o seu caminho e a sua auditoria.
 */

const seguranca = [{ bearerAuth: [] }]
const tag = ['Pedidos']
const status = z.enum(orderStatus.enumValues)

const opcaoSchema = z.object({
  groupName: z.string(),
  optionName: z.string(),
  priceDeltaInCents: z.number(),
})

const itemSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  productName: z.string(),
  productType: z.enum(['SIMPLE', 'COMBO']),
  unitPriceInCents: z.number(),
  quantity: z.number(),
  totalInCents: z.number(),
  notes: z.string().nullable(),
  comboComponents: z.array(z.object({ name: z.string(), quantity: z.number() })).nullable(),
  options: z.array(opcaoSchema),
})

const pedidoSchema = z.object({
  id: z.uuid(),
  number: z.number(),
  status,
  fulfillment: z.enum(['DELIVERY', 'PICKUP']),
  customer: z.object({ id: z.uuid(), name: z.string(), phone: z.string() }),
  address: z
    .object({
      postalCode: z.string().nullable(),
      street: z.string(),
      number: z.string(),
      complement: z.string().nullable(),
      neighborhood: z.string(),
      city: z.string().nullable(),
      reference: z.string().nullable(),
    })
    .nullable(),
  deliveryRegionName: z.string().nullable(),
  payment: z.object({
    code: z.string(),
    name: z.string(),
    kind: z.string(),
    changeForInCents: z.number().nullable(),
  }),
  notes: z.string().nullable(),
  subtotalInCents: z.number(),
  deliveryFeeInCents: z.number(),
  totalInCents: z.number(),
  cancellationReason: z.string().nullable(),
  items: z.array(itemSchema),
  createdAt: z.date(),
  statusChangedAt: z.date(),
})

/** Montado campo a campo, como o resto da API: coluna nova não sai sozinha. */
function apresentar(p: PedidoDoPainel): z.infer<typeof pedidoSchema> {
  return {
    id: p.id,
    number: p.number,
    status: p.status,
    fulfillment: p.fulfillment,
    customer: { id: p.customerId, name: p.customerName, phone: p.customerPhone },
    address:
      p.fulfillment === 'DELIVERY' && p.addressStreet && p.addressNumber && p.addressNeighborhood
        ? {
            postalCode: p.addressPostalCode,
            street: p.addressStreet,
            number: p.addressNumber,
            complement: p.addressComplement,
            neighborhood: p.addressNeighborhood,
            city: p.addressCity,
            reference: p.addressReference,
          }
        : null,
    deliveryRegionName: p.deliveryRegionName,
    payment: {
      code: p.paymentMethodCode,
      name: p.paymentMethodName,
      kind: p.paymentMethodKind,
      changeForInCents: p.changeForInCents,
    },
    notes: p.notes,
    subtotalInCents: p.subtotalInCents,
    deliveryFeeInCents: p.deliveryFeeInCents,
    totalInCents: p.totalInCents,
    cancellationReason: p.cancellationReason,
    items: p.itens.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      productType: i.productType,
      unitPriceInCents: i.unitPriceInCents,
      quantity: i.quantity,
      totalInCents: i.totalInCents,
      notes: i.notes,
      comboComponents: i.comboComponents,
      options: i.opcoes.map((o) => ({
        groupName: o.groupName,
        optionName: o.optionName,
        priceDeltaInCents: o.priceDeltaInCents,
      })),
    })),
    createdAt: p.createdAt,
    statusChangedAt: p.statusChangedAt,
  }
}

export function adminOrderRoutes(instance: FastifyInstance): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()

  typed.get(
    '/orders',
    {
      schema: {
        tags: tag,
        summary: 'Pedidos, do mais recente para o mais antigo',
        description:
          'Paginação por número: para a página seguinte, envie `before` com o menor número ' +
          'recebido.',
        querystring: z.object({
          status: status.optional(),
          before: z.coerce.number().int().min(1).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        }),
        response: { 200: z.array(pedidoSchema) },
        security: seguranca,
      },
      onRequest: requireAuth('orders:read'),
    },
    async (request) =>
      (
        await listarPedidos(tenantContextOf(request), {
          status: request.query.status,
          antesDoNumero: request.query.before,
          limite: request.query.limit,
        })
      ).map(apresentar),
  )

  typed.get(
    '/orders/summary',
    {
      schema: {
        tags: tag,
        summary: 'Resumo dos pedidos: novos, em andamento e concluídos hoje',
        description:
          'Os números do início do painel e do menu. `new` são os pedidos esperando ser aceitos; ' +
          '`inProgress`, os aceitos e ainda não entregues; `completedToday`, os concluídos desde ' +
          'a meia-noite no fuso do estabelecimento.',
        response: {
          200: z.object({
            new: z.number(),
            inProgress: z.number(),
            completedToday: z.number(),
          }),
        },
        security: seguranca,
      },
      onRequest: requireAuth('orders:read'),
    },
    async (request) => {
      const resumo = await resumoDosPedidos(tenantContextOf(request), new Date())
      return {
        new: resumo.novos,
        inProgress: resumo.emAndamento,
        completedToday: resumo.concluidosHoje,
      }
    },
  )

  typed.get(
    '/orders/:id',
    {
      schema: {
        tags: tag,
        summary: 'Um pedido, com itens, endereço e pagamento',
        params: z.object({ id: z.uuid() }),
        response: { 200: pedidoSchema },
        security: seguranca,
      },
      onRequest: requireAuth('orders:read'),
    },
    async (request) => apresentar(await obterPedido(tenantContextOf(request), request.params.id)),
  )

  typed.patch(
    '/orders/:id/status',
    {
      schema: {
        tags: tag,
        summary: 'Muda o status do pedido',
        description:
          'O status só avança — pode pular etapas, nunca voltar. `OUT_FOR_DELIVERY` só para ' +
          'entrega. Cancelar exige `reason`. Uma mudança feita por outra pessoa no meio ' +
          'responde 409 (`ORDER_CHANGED`).\n\n' +
          'Cancelar (`CANCELLED`) exige `orders:cancel`; os demais status, `orders:update`. ' +
          'Uma permissão não inclui a outra.',
        params: z.object({ id: z.uuid() }),
        body: z.object({
          status,
          reason: z.string().trim().min(3).max(280).optional(),
        }),
        response: { 200: pedidoSchema },
        security: seguranca,
      },
      onRequest: requireAnyOf('orders:update', 'orders:cancel'),
    },
    async (request) => {
      // Cancelar é uma permissão à parte: quem toca os pedidos não os cancela por isso.
      exigirPermissao(
        currentUser(request),
        request.body.status === 'CANCELLED' ? 'orders:cancel' : 'orders:update',
      )
      return apresentar(
        await mudarStatusDoPedido(
          tenantContextOf(request),
          currentUser(request).id,
          request.params.id,
          request.body.status,
          request.body.reason ?? null,
        ),
      )
    },
  )
}
