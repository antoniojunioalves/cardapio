import { QuantityStepper } from '@/components/QuantityStepper'
import { Sheet } from '@/components/Sheet'
import { formatarPreco } from '@/utils/money'

import {
  MENSAGEM_DO_PROBLEMA,
  QUANTIDADE_MAXIMA,
  type LinhaDoCarrinho,
  type ResumoDoCarrinho,
} from '../cart'

interface CartSheetProps {
  linhas: readonly LinhaDoCarrinho[]
  resumo: ResumoDoCarrinho
  pedidoMinimoEmCentavos: number
  aberto: boolean
  aoMudarQuantidade: (itemId: string, quantidade: number) => void
  aoRemover: (itemId: string) => void
  aoEsvaziar: () => void
  aoFechar: () => void
}

/**
 * O carrinho aberto.
 *
 * Os valores são uma prévia: a taxa de entrega depende do endereço, que vem no
 * checkout, e o total que vale é o que o servidor calcular.
 */
export function CartSheet({
  linhas,
  resumo,
  pedidoMinimoEmCentavos,
  aberto,
  aoMudarQuantidade,
  aoRemover,
  aoEsvaziar,
  aoFechar,
}: CartSheetProps) {
  const rodape = (
    <div className="flex flex-col gap-2">
      <div className="text-body flex justify-between font-semibold text-content">
        <span>Subtotal</span>
        <span>{formatarPreco(resumo.subtotalEmCentavos)}</span>
      </div>
      {resumo.faltaParaMinimoEmCentavos > 0 && (
        <p className="text-caption text-warning">
          Faltam {formatarPreco(resumo.faltaParaMinimoEmCentavos)} para o pedido mínimo de{' '}
          {formatarPreco(pedidoMinimoEmCentavos)}.
        </p>
      )}
      <p className="text-caption text-content-muted">A taxa de entrega é calculada no checkout.</p>
    </div>
  )

  return (
    <Sheet
      titulo="Seu carrinho"
      aoFechar={aoFechar}
      rodape={linhas.length > 0 ? rodape : undefined}
    >
      {!aberto && (
        <p
          role="note"
          className="text-caption mb-stack rounded-control bg-accent-50 p-3 text-accent-800"
        >
          O estabelecimento está fechado agora. Você pode montar o pedido e enviá-lo quando abrir.
        </p>
      )}

      {linhas.length === 0 ? (
        <p className="text-body py-section-y text-center text-content-muted">
          Seu carrinho está vazio.
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border">
            {linhas.map((linha) => (
              <LinhaDoItem
                key={linha.item.id}
                linha={linha}
                aoMudarQuantidade={(quantidade) => {
                  aoMudarQuantidade(linha.item.id, quantidade)
                }}
                aoRemover={() => {
                  aoRemover(linha.item.id)
                }}
              />
            ))}
          </ul>

          <button
            type="button"
            onClick={aoEsvaziar}
            className="text-caption mt-stack font-semibold text-danger hover:underline"
          >
            Esvaziar carrinho
          </button>
        </>
      )}
    </Sheet>
  )
}

interface LinhaDoItemProps {
  linha: LinhaDoCarrinho
  aoMudarQuantidade: (quantidade: number) => void
  aoRemover: () => void
}

function LinhaDoItem({ linha, aoMudarQuantidade, aoRemover }: LinhaDoItemProps) {
  const { item, opcoes, problema } = linha

  return (
    <li aria-label={item.nome} className="flex flex-col gap-2 py-stack">
      <div className="flex items-start justify-between gap-stack">
        <div className="min-w-0">
          <p className="text-body font-semibold text-content">{item.nome}</p>
          {opcoes.length > 0 && (
            <p className="text-caption text-content-muted">{opcoes.join(', ')}</p>
          )}
          {item.observacao && (
            <p className="text-caption text-content-muted">Obs.: {item.observacao}</p>
          )}
        </div>
        {problema === null && (
          <span className="text-body shrink-0 text-content">
            {formatarPreco(linha.totalEmCentavos)}
          </span>
        )}
      </div>

      {problema === null ? (
        <QuantityStepper
          valor={item.quantidade}
          aoMudar={aoMudarQuantidade}
          maximo={QUANTIDADE_MAXIMA}
          rotulo={item.nome}
          permitirZero
        />
      ) : (
        <div className="flex items-center justify-between gap-stack rounded-control bg-neutral-100 p-2">
          <p className="text-caption text-content">{MENSAGEM_DO_PROBLEMA[problema]}</p>
          <button
            type="button"
            onClick={aoRemover}
            aria-label={`Remover ${item.nome}`}
            className="text-caption shrink-0 font-semibold text-danger hover:underline"
          >
            Remover
          </button>
        </div>
      )}
    </li>
  )
}
