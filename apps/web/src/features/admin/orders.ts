import { proximosStatus, STATUS_FINAIS, type StatusDoPedido } from '@repo/shared'

import type { PedidoDoPainel } from './types'

/** Regras de apresentação do painel de pedidos, sem React. */

export const ROTULO_DO_STATUS: Record<StatusDoPedido, string> = {
  RECEIVED: 'Novo',
  ACCEPTED: 'Aceito',
  PREPARING: 'Em preparo',
  READY: 'Pronto',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
}

/** O verbo do botão que leva o pedido a cada status. */
export const ACAO_PARA_O_STATUS: Record<StatusDoPedido, string> = {
  RECEIVED: 'Receber',
  ACCEPTED: 'Aceitar',
  PREPARING: 'Começar o preparo',
  READY: 'Marcar como pronto',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  COMPLETED: 'Concluir',
  CANCELLED: 'Cancelar pedido',
}

/**
 * Os botões de avanço de um pedido — a mesma regra que a API aplica
 * (`@repo/shared`). Cancelar fica à parte: pede motivo e confirmação.
 */
export function acoesDoPedido(
  pedido: Pick<PedidoDoPainel, 'status' | 'fulfillment'>,
): StatusDoPedido[] {
  return proximosStatus(pedido.status, pedido.fulfillment).filter((s) => s !== 'CANCELLED')
}

export function podeCancelar(pedido: Pick<PedidoDoPainel, 'status'>): boolean {
  return !STATUS_FINAIS.includes(pedido.status)
}

export function emAndamento(pedido: Pick<PedidoDoPainel, 'status'>): boolean {
  return !STATUS_FINAIS.includes(pedido.status)
}

/** `2026-09-29T15:04:00Z` → `12:04`, no fuso do navegador. */
export function horaDoPedido(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** Endereço completo numa linha, para a cozinha e o entregador. */
export function enderecoCompleto(endereco: NonNullable<PedidoDoPainel['address']>): string {
  const rua = [endereco.street, endereco.number, endereco.complement].filter(Boolean).join(', ')
  const lugar = [endereco.neighborhood, endereco.city].filter(Boolean).join(', ')
  const cep = endereco.postalCode
    ? ` — CEP ${endereco.postalCode.slice(0, 5)}-${endereco.postalCode.slice(5)}`
    : ''
  return `${rua} — ${lugar}${cep}`
}
