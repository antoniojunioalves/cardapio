/**
 * "O que falta para receber pedidos": a lista que o Início do painel mostra a
 * quem acabou de cadastrar o estabelecimento. Sem banco nem framework.
 *
 * Cada passo é uma condição sem a qual o cliente não consegue pedir — ou, no
 * caso do WhatsApp, o pedido não chega com o link de envio. A lista só diz o
 * que está feito; quem decide se um pedido é aceito continua sendo a criação
 * do pedido (`orders/service.ts`), com as mesmas informações.
 */

export const PASSOS = [
  'emailConfirmed',
  'whatsapp',
  'businessHours',
  'fulfillment',
  'paymentMethods',
  'products',
] as const

export type Passo = (typeof PASSOS)[number]

export interface SituacaoDoEstabelecimento {
  /** `PENDING` até o dono confirmar o e-mail: o cardápio ainda não está no ar. */
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING'
  whatsapp: string | null
  horarios: number
  entrega: {
    deliveryEnabled: boolean
    pickupEnabled: boolean
    feeMode: 'FIXED' | 'BY_REGION'
    regioesAtivas: number
  }
  formasDePagamento: number
  produtosAVenda: number
}

export interface Checklist {
  /** Todos os passos feitos. */
  ready: boolean
  steps: { key: Passo; done: boolean }[]
}

export function montarChecklist(situacao: SituacaoDoEstabelecimento): Checklist {
  const { entrega } = situacao
  // Entrega por região sem nenhuma região ativa não entrega em lugar nenhum.
  const entregaFunciona =
    entrega.deliveryEnabled && (entrega.feeMode === 'FIXED' || entrega.regioesAtivas > 0)

  const feito: Record<Passo, boolean> = {
    emailConfirmed: situacao.status !== 'PENDING',
    whatsapp: situacao.whatsapp !== null,
    businessHours: situacao.horarios > 0,
    fulfillment: entregaFunciona || entrega.pickupEnabled,
    paymentMethods: situacao.formasDePagamento > 0,
    products: situacao.produtosAVenda > 0,
  }

  const steps = PASSOS.map((key) => ({ key, done: feito[key] }))
  return { ready: steps.every((passo) => passo.done), steps }
}
