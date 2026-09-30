import type { MotivoDaRecusa } from '@repo/shared'

/**
 * A regra do caminho do status mora em `@repo/shared` (`order-status.ts`): o
 * painel usa a mesma para só oferecer os próximos passos válidos. Aqui ficam
 * as mensagens de recusa da API.
 */
export { problemaDaTransicao, STATUS_FINAIS, type MotivoDaRecusa } from '@repo/shared'

export const MENSAGEM_DA_RECUSA: Record<MotivoDaRecusa, string> = {
  MESMO_STATUS: 'O pedido já está neste status.',
  STATUS_FINAL: 'O pedido já foi concluído ou cancelado, e não muda mais.',
  NAO_AVANCA: 'O status de um pedido só avança; ele não volta para uma etapa anterior.',
  SO_PARA_ENTREGA: '"Saiu para entrega" vale só para pedidos de entrega.',
}
