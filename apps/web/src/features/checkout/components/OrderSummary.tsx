import type { LinhaDoCarrinho } from '@/features/cart/cart'
import { formatarPreco } from '@/utils/money'

interface OrderSummaryProps {
  linhas: readonly LinhaDoCarrinho[]
  subtotalEmCentavos: number
  /** `null`: ainda depende de uma escolha — modalidade ou região. */
  taxaEmCentavos: number | null
  retirada: boolean
}

/** Itens e valores do pedido. Prévia: o total que vale é o do servidor. */
export function OrderSummary({
  linhas,
  subtotalEmCentavos,
  taxaEmCentavos,
  retirada,
}: OrderSummaryProps) {
  const taxa = retirada
    ? 'Retirada'
    : taxaEmCentavos === null
      ? 'Escolha acima'
      : taxaEmCentavos === 0
        ? 'Grátis'
        : formatarPreco(taxaEmCentavos)

  return (
    <section aria-labelledby="resumo-do-pedido" className="flex flex-col gap-stack">
      <h2 id="resumo-do-pedido" className="text-heading text-content">
        Resumo
      </h2>

      <ul className="flex flex-col gap-2">
        {linhas.map(({ item, opcoes, totalEmCentavos }) => (
          <li key={item.id} className="text-body flex justify-between gap-stack">
            <span className="min-w-0">
              <span className="text-content">
                {item.quantidade}x {item.nome}
              </span>
              {opcoes.length > 0 && (
                <span className="text-caption block text-content-muted">{opcoes.join(', ')}</span>
              )}
              {item.observacao && (
                <span className="text-caption block text-content-muted">
                  Obs.: {item.observacao}
                </span>
              )}
            </span>
            <span className="shrink-0 text-content">{formatarPreco(totalEmCentavos)}</span>
          </li>
        ))}
      </ul>

      <dl className="text-body flex flex-col gap-1 border-t border-border pt-stack">
        <div className="flex justify-between">
          <dt className="text-content-muted">Subtotal</dt>
          <dd className="text-content">{formatarPreco(subtotalEmCentavos)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-content-muted">Entrega</dt>
          <dd className="text-content">{taxa}</dd>
        </div>
        <div className="flex justify-between font-semibold">
          <dt className="text-content">Total</dt>
          <dd className="text-content">
            {formatarPreco(subtotalEmCentavos + (taxaEmCentavos ?? 0))}
          </dd>
        </div>
      </dl>
    </section>
  )
}
