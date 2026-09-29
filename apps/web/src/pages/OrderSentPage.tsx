import type { PedidoCriado } from '@repo/shared'
import { useEffect } from 'react'
import { Link, useLocation, useParams } from 'react-router'

import { formatarPreco } from '@/utils/money'

/** O que o checkout passa para esta página ao navegar. */
export interface EstadoDoPedidoEnviado {
  pedido: PedidoCriado
  estabelecimento: string
}

function lerEstado(estado: unknown): EstadoDoPedidoEnviado | null {
  if (!estado || typeof estado !== 'object' || !('pedido' in estado)) return null
  return estado as EstadoDoPedidoEnviado
}

/**
 * A confirmação em `/{tenantSlug}/pedido-enviado`.
 *
 * O pedido chega pelo estado da navegação, não pela URL: o número do pedido
 * não vai para endereço público (ARCHITECTURE.md, 4.2). Recarregar a página
 * perde o estado, e ela diz isso em vez de inventar um pedido.
 */
export function OrderSentPage() {
  const { tenantSlug = '' } = useParams()
  const estado = lerEstado(useLocation().state)

  useEffect(() => {
    document.title = estado ? `Pedido #${String(estado.pedido.number)} recebido` : 'Pedido'
  }, [estado])

  const voltar = (
    <Link
      to={`/${tenantSlug}`}
      className="text-body self-center rounded-control bg-primary px-4 py-2 font-semibold text-primary-content hover:bg-primary-hover"
    >
      Voltar ao cardápio
    </Link>
  )

  if (!estado) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-stack px-page-x text-center">
        <h1 className="text-heading text-content">Pedido</h1>
        <p className="text-body text-content-muted">
          Os detalhes do pedido não ficam guardados nesta página. Se você acabou de fazer um pedido,
          ele já foi recebido pelo estabelecimento.
        </p>
        {voltar}
      </main>
    )
  }

  const { pedido, estabelecimento } = estado

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-section-y px-page-x py-section-y">
      <div role="status" className="flex flex-col gap-1 text-center">
        <h1 className="text-display text-content">Pedido #{pedido.number} recebido</h1>
        <p className="text-body text-content-muted">
          {estabelecimento} já recebeu o seu pedido.
          {pedido.fulfillment === 'DELIVERY'
            ? ' Ele vai ser preparado e enviado ao seu endereço.'
            : ' Avisaremos quando estiver pronto para retirar.'}
        </p>
      </div>

      <section
        aria-labelledby="itens-do-pedido"
        className="flex flex-col gap-stack rounded-card bg-surface p-card shadow-card"
      >
        <h2 id="itens-do-pedido" className="text-heading text-content">
          Itens
        </h2>
        <ul className="flex flex-col gap-2">
          {pedido.items.map((item, i) => (
            <li key={i} className="text-body flex justify-between gap-stack">
              <span className="min-w-0">
                <span className="text-content">
                  {item.quantity}x {item.name}
                </span>
                {item.options.length > 0 && (
                  <span className="text-caption block text-content-muted">
                    {item.options.join(', ')}
                  </span>
                )}
                {item.notes && (
                  <span className="text-caption block text-content-muted">Obs.: {item.notes}</span>
                )}
              </span>
              <span className="shrink-0 text-content">{formatarPreco(item.totalInCents)}</span>
            </li>
          ))}
        </ul>

        <dl className="text-body flex flex-col gap-1 border-t border-border pt-stack">
          <div className="flex justify-between">
            <dt className="text-content-muted">Subtotal</dt>
            <dd className="text-content">{formatarPreco(pedido.subtotalInCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-content-muted">Entrega</dt>
            <dd className="text-content">
              {pedido.fulfillment === 'PICKUP'
                ? 'Retirada'
                : pedido.deliveryFeeInCents === 0
                  ? 'Grátis'
                  : formatarPreco(pedido.deliveryFeeInCents)}
            </dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt className="text-content">Total</dt>
            <dd className="text-content">{formatarPreco(pedido.totalInCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-content-muted">Pagamento na entrega</dt>
            <dd className="text-content">
              {pedido.paymentMethodName}
              {pedido.changeForInCents !== null &&
                ` — troco para ${formatarPreco(pedido.changeForInCents)}`}
            </dd>
          </div>
        </dl>
      </section>

      {voltar}
    </main>
  )
}
