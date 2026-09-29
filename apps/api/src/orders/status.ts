import type { OrderStatus } from '../db/schema/index.js'

/**
 * O caminho do status de um pedido, sem banco nem framework.
 *
 * **Só avança.** O painel pode pular etapas — a lanchonete pequena não precisa
 * marcar "aceito" e "em preparo" separadamente —, mas nunca voltar: um pedido
 * "saiu para entrega" que volta a "em preparo" deixaria o cliente sem saber em
 * que acreditar.
 *
 * - `OUT_FOR_DELIVERY` só existe para entrega.
 * - `CANCELLED` vale de qualquer status não final, e exige motivo.
 * - `COMPLETED` e `CANCELLED` são finais.
 */

const SEQUENCIA: readonly OrderStatus[] = [
  'RECEIVED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
]

export const STATUS_FINAIS: readonly OrderStatus[] = ['COMPLETED', 'CANCELLED']

export type MotivoDaRecusa = 'STATUS_FINAL' | 'NAO_AVANCA' | 'SO_PARA_ENTREGA' | 'MESMO_STATUS'

/** Por que a transição não vale, ou `null` se vale. */
export function problemaDaTransicao(
  de: OrderStatus,
  para: OrderStatus,
  modalidade: 'DELIVERY' | 'PICKUP',
): MotivoDaRecusa | null {
  if (de === para) return 'MESMO_STATUS'
  if (STATUS_FINAIS.includes(de)) return 'STATUS_FINAL'
  if (para === 'CANCELLED') return null
  if (para === 'OUT_FOR_DELIVERY' && modalidade !== 'DELIVERY') return 'SO_PARA_ENTREGA'
  return SEQUENCIA.indexOf(para) > SEQUENCIA.indexOf(de) ? null : 'NAO_AVANCA'
}

export const MENSAGEM_DA_RECUSA: Record<MotivoDaRecusa, string> = {
  MESMO_STATUS: 'O pedido já está neste status.',
  STATUS_FINAL: 'O pedido já foi concluído ou cancelado, e não muda mais.',
  NAO_AVANCA: 'O status de um pedido só avança; ele não volta para uma etapa anterior.',
  SO_PARA_ENTREGA: '"Saiu para entrega" vale só para pedidos de entrega.',
}
