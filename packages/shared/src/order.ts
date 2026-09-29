import { z } from 'zod'

import { enderecoSchema, nomeDoClienteSchema, telefoneSchema, textoOpcional } from './customer.js'

/**
 * O contrato do pedido: o que o navegador envia e o que a API devolve.
 *
 * **O corpo não traz preço de nada.** Traz ids, quantidades e escolhas; o
 * servidor busca o cardápio e calcula tudo do zero. O único valor enviado é
 * `expectedTotalInCents`, e ele não é usado para cobrar: é o total que o
 * cliente viu na tela, e o servidor recusa o pedido se o dele for diferente —
 * ninguém é cobrado por um preço que não viu.
 */

export const QUANTIDADE_MAXIMA_POR_ITEM = 50
export const ITENS_POR_PEDIDO = 50

export const itemDoPedidoSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(1).max(QUANTIDADE_MAXIMA_POR_ITEM),
  notes: textoOpcional(140),
  /** Opções escolhidas por grupo: `groupId → optionIds`. */
  options: z.record(z.uuid(), z.array(z.uuid()).max(50)).default({}),
})

export const novoPedidoSchema = z.object({
  /** Gerada pelo navegador a cada tentativa; repetir o envio não duplica o pedido. */
  idempotencyKey: z.uuid(),
  customer: z.object({ phone: telefoneSchema, name: nomeDoClienteSchema }),
  fulfillment: z.enum(['DELIVERY', 'PICKUP']),
  /** Endereço salvo (pelo id que a identificação devolveu) ou novo; nulo na retirada. */
  address: z
    .union([z.object({ savedAddressId: z.uuid() }), z.object({ newAddress: enderecoSchema })])
    .nullable(),
  deliveryRegionId: z.uuid().nullable(),
  paymentMethodId: z.uuid(),
  changeForInCents: z.number().int().positive().max(10_000_000).nullable(),
  notes: textoOpcional(280),
  items: z.array(itemDoPedidoSchema).min(1).max(ITENS_POR_PEDIDO),
  expectedTotalInCents: z.number().int().min(0),
})

export type NovoPedido = z.output<typeof novoPedidoSchema>
export type NovoPedidoEnviado = z.input<typeof novoPedidoSchema>

/**
 * Por que o pedido foi recusado. `itemIndex` aponta o item do corpo, quando o
 * problema é de um item.
 */
export const problemaDoPedidoSchema = z.object({
  tipo: z.enum([
    'ESTABELECIMENTO_FECHADO',
    'MODALIDADE_INDISPONIVEL',
    'PRODUTO_INDISPONIVEL',
    'OPCOES_INVALIDAS',
    'PEDIDO_MINIMO',
    'REGIAO_INVALIDA',
    'ENDERECO_INVALIDO',
    'PAGAMENTO_INVALIDO',
    'TROCO_INVALIDO',
  ]),
  itemIndex: z.number().int().optional(),
  /** Frase pronta para o cliente. */
  mensagem: z.string(),
})

export type ProblemaDoPedido = z.output<typeof problemaDoPedidoSchema>

/**
 * O pedido criado, como a API devolve ao cliente.
 *
 * Não traz o endereço: se ele veio de um endereço salvo, devolvê-lo inteiro
 * revelaria a quem digitou o telefone de outra pessoa o que a identificação
 * mascarou.
 */
export const pedidoCriadoSchema = z.object({
  number: z.number(),
  status: z.string(),
  fulfillment: z.enum(['DELIVERY', 'PICKUP']),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      options: z.array(z.string()),
      notes: z.string().nullable(),
      totalInCents: z.number(),
    }),
  ),
  subtotalInCents: z.number(),
  deliveryFeeInCents: z.number(),
  totalInCents: z.number(),
  paymentMethodName: z.string(),
  changeForInCents: z.number().nullable(),
  createdAt: z.string(),
  /**
   * A mensagem do pedido para o WhatsApp do estabelecimento, e o link que
   * abre a conversa com ela pronta. `url` nulo: o estabelecimento não
   * cadastrou WhatsApp.
   */
  whatsapp: z.object({ url: z.string().nullable(), message: z.string() }),
})

export type PedidoCriado = z.output<typeof pedidoCriadoSchema>
