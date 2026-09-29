import { formatarPreco } from '@/utils/money'

interface CartBarProps {
  quantidadeDeItens: number
  subtotalEmCentavos: number
  aoAbrir: () => void
}

/** A barra fixa embaixo com o indicador do carrinho. Só aparece com itens. */
export function CartBar({ quantidadeDeItens, subtotalEmCentavos, aoAbrir }: CartBarProps) {
  const itens = quantidadeDeItens === 1 ? '1 item' : `${String(quantidadeDeItens)} itens`

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 px-page-x pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      <button
        type="button"
        onClick={aoAbrir}
        aria-label={`Ver carrinho, ${itens}, ${formatarPreco(subtotalEmCentavos)}`}
        className="text-body mx-auto flex w-full max-w-3xl items-center justify-between gap-stack rounded-control bg-primary px-4 py-3 font-semibold text-primary-content shadow-overlay hover:bg-primary-hover"
      >
        <span className="rounded-pill bg-primary-content/20 px-2 py-0.5 text-caption">{itens}</span>
        <span>Ver carrinho</span>
        <span>{formatarPreco(subtotalEmCentavos)}</span>
      </button>
    </div>
  )
}
