/**
 * O caminho do status de um pedido — a mesma regra na API, que recusa, e no
 * painel, que só oferece os próximos passos válidos.
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

export const STATUS_DO_PEDIDO = [
  'RECEIVED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
  'CANCELLED',
] as const

export type StatusDoPedido = (typeof STATUS_DO_PEDIDO)[number]
export type Modalidade = 'DELIVERY' | 'PICKUP'

const SEQUENCIA: readonly StatusDoPedido[] = STATUS_DO_PEDIDO.filter((s) => s !== 'CANCELLED')

export const STATUS_FINAIS: readonly StatusDoPedido[] = ['COMPLETED', 'CANCELLED']

export type MotivoDaRecusa = 'STATUS_FINAL' | 'NAO_AVANCA' | 'SO_PARA_ENTREGA' | 'MESMO_STATUS'

/** Por que a transição não vale, ou `null` se vale. */
export function problemaDaTransicao(
  de: StatusDoPedido,
  para: StatusDoPedido,
  modalidade: Modalidade,
): MotivoDaRecusa | null {
  if (de === para) return 'MESMO_STATUS'
  if (STATUS_FINAIS.includes(de)) return 'STATUS_FINAL'
  if (para === 'CANCELLED') return null
  if (para === 'OUT_FOR_DELIVERY' && modalidade !== 'DELIVERY') return 'SO_PARA_ENTREGA'
  return SEQUENCIA.indexOf(para) > SEQUENCIA.indexOf(de) ? null : 'NAO_AVANCA'
}

/** Os status para os quais o pedido pode ir agora, na ordem do caminho. */
export function proximosStatus(de: StatusDoPedido, modalidade: Modalidade): StatusDoPedido[] {
  return STATUS_DO_PEDIDO.filter((para) => problemaDaTransicao(de, para, modalidade) === null)
}
