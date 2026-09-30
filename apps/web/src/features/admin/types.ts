import type { StatusDoPedido } from '@repo/shared'

/**
 * O pedido como `GET /api/v1/admin/orders` devolve.
 *
 * Espelha `pedidoSchema` em `apps/api/src/routes/admin-orders.ts`. Copiado,
 * como o contrato do cardápio — a mesma pendência de levá-los ao
 * `packages/shared`.
 */
export interface PedidoDoPainel {
  id: string
  number: number
  status: StatusDoPedido
  fulfillment: 'DELIVERY' | 'PICKUP'
  customer: { id: string; name: string; phone: string }
  address: {
    postalCode: string | null
    street: string
    number: string
    complement: string | null
    neighborhood: string
    city: string | null
    reference: string | null
  } | null
  deliveryRegionName: string | null
  payment: { code: string; name: string; kind: string; changeForInCents: number | null }
  notes: string | null
  subtotalInCents: number
  deliveryFeeInCents: number
  totalInCents: number
  cancellationReason: string | null
  items: {
    id: string
    productName: string
    productType: 'SIMPLE' | 'COMBO'
    unitPriceInCents: number
    quantity: number
    totalInCents: number
    notes: string | null
    comboComponents: { name: string; quantity: number }[] | null
    options: { groupName: string; optionName: string; priceDeltaInCents: number }[]
  }[]
  createdAt: string
  statusChangedAt: string
}
