import type { StatusDoPedido } from '@repo/shared'
import { useState } from 'react'

import { formatarPreco } from '@/utils/money'

import {
  ACAO_PARA_O_STATUS,
  ROTULO_DO_STATUS,
  acoesDoPedido,
  enderecoCompleto,
  horaDoPedido,
  podeCancelar,
} from '../orders'
import type { PedidoDoPainel } from '../types'

interface OrderCardProps {
  pedido: PedidoDoPainel
  podeAtualizar: boolean
  atualizando: boolean
  aoMudarStatus: (status: StatusDoPedido) => void
  aoCancelar: () => void
}

const CORES: Record<StatusDoPedido, string> = {
  RECEIVED: 'bg-accent-100 text-accent-800',
  ACCEPTED: 'bg-brand-100 text-brand-800',
  PREPARING: 'bg-brand-100 text-brand-800',
  READY: 'bg-brand-100 text-brand-800',
  OUT_FOR_DELIVERY: 'bg-brand-100 text-brand-800',
  COMPLETED: 'bg-neutral-100 text-neutral-700',
  CANCELLED: 'bg-neutral-100 text-neutral-700',
}

/**
 * Um pedido no painel. O resumo fica sempre à vista; o detalhe — itens,
 * endereço completo, pagamento — abre ao tocar. Pedido novo já abre aberto.
 */
export function OrderCard({
  pedido,
  podeAtualizar,
  atualizando,
  aoMudarStatus,
  aoCancelar,
}: OrderCardProps) {
  const [aberto, setAberto] = useState(pedido.status === 'RECEIVED')
  const acoes = podeAtualizar ? acoesDoPedido(pedido) : []
  const idDoDetalhe = `detalhe-${pedido.id}`

  return (
    <article
      aria-label={`Pedido #${String(pedido.number)}`}
      className={`rounded-card bg-surface shadow-card ${
        pedido.status === 'RECEIVED' ? 'ring-2 ring-accent-500' : ''
      }`}
    >
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={idDoDetalhe}
        onClick={() => {
          setAberto((a) => !a)
        }}
        className="flex w-full items-start justify-between gap-stack p-card text-left"
      >
        <span className="min-w-0">
          <span className="text-heading block text-content">
            #{pedido.number} · {pedido.customer.name}
          </span>
          <span className="text-caption block text-content-muted">
            {horaDoPedido(pedido.createdAt)} ·{' '}
            {pedido.fulfillment === 'DELIVERY' ? 'Entrega' : 'Retirada'} ·{' '}
            {formatarPreco(pedido.totalInCents)}
          </span>
        </span>
        <span
          className={`text-caption shrink-0 rounded-pill px-2 py-0.5 font-semibold ${CORES[pedido.status]}`}
        >
          {ROTULO_DO_STATUS[pedido.status]}
        </span>
      </button>

      {aberto && (
        <div id={idDoDetalhe} className="flex flex-col gap-stack border-t border-border p-card">
          <ul className="flex flex-col gap-2">
            {pedido.items.map((item) => (
              <li key={item.id} className="text-body">
                <div className="flex justify-between gap-stack">
                  <span className="font-semibold text-content">
                    {item.quantity}x {item.productName}
                  </span>
                  <span className="text-content">{formatarPreco(item.totalInCents)}</span>
                </div>
                {item.comboComponents && (
                  <p className="text-caption text-content-muted">
                    {item.comboComponents
                      .map((c) => (c.quantity > 1 ? `${String(c.quantity)}x ${c.name}` : c.name))
                      .join(' + ')}
                  </p>
                )}
                {item.options.length > 0 && (
                  <p className="text-caption text-content-muted">
                    {item.options.map((o) => o.optionName).join(', ')}
                  </p>
                )}
                {item.notes && (
                  <p className="text-caption font-semibold text-accent-800">Obs.: {item.notes}</p>
                )}
              </li>
            ))}
          </ul>

          <dl className="text-caption grid grid-cols-[auto_1fr] gap-x-stack gap-y-1">
            <dt className="text-content-muted">Cliente</dt>
            <dd className="text-content">
              {pedido.customer.name} · {pedido.customer.phone}
            </dd>
            {pedido.address ? (
              <>
                <dt className="text-content-muted">Endereço</dt>
                <dd className="text-content">
                  {enderecoCompleto(pedido.address)}
                  {pedido.address.reference && ` (${pedido.address.reference})`}
                  {pedido.deliveryRegionName && ` · Região: ${pedido.deliveryRegionName}`}
                </dd>
              </>
            ) : (
              <>
                <dt className="text-content-muted">Entrega</dt>
                <dd className="text-content">Retirada no local</dd>
              </>
            )}
            <dt className="text-content-muted">Pagamento</dt>
            <dd className="text-content">
              {pedido.payment.name}
              {pedido.payment.changeForInCents !== null &&
                ` — troco para ${formatarPreco(pedido.payment.changeForInCents)}`}
            </dd>
            <dt className="text-content-muted">Total</dt>
            <dd className="text-content">
              {formatarPreco(pedido.subtotalInCents)} + entrega{' '}
              {formatarPreco(pedido.deliveryFeeInCents)} = {formatarPreco(pedido.totalInCents)}
            </dd>
            {pedido.notes && (
              <>
                <dt className="text-content-muted">Observações</dt>
                <dd className="font-semibold text-accent-800">{pedido.notes}</dd>
              </>
            )}
            {pedido.cancellationReason && (
              <>
                <dt className="text-content-muted">Cancelado</dt>
                <dd className="text-content">{pedido.cancellationReason}</dd>
              </>
            )}
          </dl>

          {(acoes.length > 0 || (podeAtualizar && podeCancelar(pedido))) && (
            <div className="flex flex-wrap gap-2">
              {acoes.map((status, i) => (
                <button
                  key={status}
                  type="button"
                  disabled={atualizando}
                  onClick={() => {
                    aoMudarStatus(status)
                  }}
                  className={`text-body rounded-control px-4 py-2 font-semibold disabled:opacity-50 ${
                    i === 0
                      ? 'bg-primary text-primary-content hover:bg-primary-hover'
                      : 'border border-border-strong text-content'
                  }`}
                >
                  {ACAO_PARA_O_STATUS[status]}
                </button>
              ))}
              {podeAtualizar && podeCancelar(pedido) && (
                <button
                  type="button"
                  disabled={atualizando}
                  onClick={aoCancelar}
                  className="text-body ml-auto rounded-control px-4 py-2 font-semibold text-danger hover:underline disabled:opacity-50"
                >
                  Cancelar
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  )
}
