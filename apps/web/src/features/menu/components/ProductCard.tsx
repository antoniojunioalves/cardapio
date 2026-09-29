import { formatarPreco } from '@/utils/money'

import { descreverItensDoCombo, economiaDoCombo, precoDoCartao } from '../presentation'
import type { ProdutoPublico } from '../types'

/**
 * Cartão de produto.
 *
 * Produto esgotado continua na lista, apagado e com o selo: se sumisse, o
 * cliente que voltou pelo X-Bacon de ontem acharia que o cardápio mudou.
 * A seleção de opções e o carrinho entram na Fase 9.
 */
export function ProductCard({ produto }: { produto: ProdutoPublico }) {
  const economia = economiaDoCombo(produto)
  const itens = descreverItensDoCombo(produto)

  return (
    <article
      aria-label={produto.name}
      className={`flex gap-stack rounded-card bg-surface p-card shadow-card ${
        produto.isAvailable ? '' : 'opacity-60'
      }`}
    >
      <div className="min-w-0 flex-1">
        <h3 className="text-body font-semibold text-content">{produto.name}</h3>

        {itens && <p className="text-caption mt-1 text-content">{itens}</p>}

        {produto.description && (
          <p className="text-caption mt-1 line-clamp-2 text-content-muted">{produto.description}</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-body font-semibold text-content">{precoDoCartao(produto)}</span>

          {!produto.isAvailable && (
            <span className="text-caption rounded-pill bg-neutral-200 px-2 py-0.5 font-semibold text-neutral-700">
              Esgotado
            </span>
          )}

          {produto.isAvailable && economia !== null && (
            <span className="text-caption rounded-pill bg-accent-100 px-2 py-0.5 font-semibold text-accent-800">
              Economize {formatarPreco(economia)}
            </span>
          )}
        </div>
      </div>

      {produto.imageUrl && (
        <img
          src={produto.imageUrl}
          alt=""
          loading="lazy"
          className="size-24 shrink-0 rounded-control object-cover"
        />
      )}
    </article>
  )
}
