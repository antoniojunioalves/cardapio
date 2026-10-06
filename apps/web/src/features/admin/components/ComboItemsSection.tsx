import { useId, useState, type FormEvent } from 'react'

import { QuantityStepper } from '@/components/QuantityStepper'
import { ApiError } from '@/services/api'
import { formatarPreco } from '@/utils/money'

import { useProdutos, type Produto } from '../catalog'
import {
  precoAvulso,
  produtosParaOCombo,
  useComposicao,
  useDefinirComposicao,
  type ComposicaoDoCombo,
} from '../option-groups'
import { AvisoDeAtencao, botaoDeTextoPerigo, RodapeDeSalvar, Secao } from './form-parts'

interface ComboItemsSectionProps {
  slug: string
  combo: Produto
  podeEditar: boolean
}

/**
 * Os itens do combo: quais produtos e quantos de cada. A lista se monta aqui e
 * vai inteira no "Salvar itens do combo". Ao lado, quanto os itens custariam
 * separados — o lojista vê a economia que está oferecendo.
 */
export function ComboItemsSection({ slug, combo, podeEditar }: ComboItemsSectionProps) {
  const composicao = useComposicao(slug, combo.id)
  const produtos = useProdutos(slug)

  return (
    <Secao titulo="Itens do combo">
      {composicao.isPending || produtos.isPending ? (
        <p className="text-body text-content-muted">Carregando os itens…</p>
      ) : composicao.isError || produtos.isError ? (
        <p role="alert" className="text-body text-content-muted">
          Não foi possível carregar os itens do combo. Recarregue a página para tentar de novo.
        </p>
      ) : (
        <ItensDoCombo
          slug={slug}
          combo={combo}
          salvos={composicao.data}
          produtos={produtos.data}
          podeEditar={podeEditar}
        />
      )}
    </Secao>
  )
}

interface ItensDoComboProps {
  slug: string
  combo: Produto
  salvos: ComposicaoDoCombo
  produtos: readonly Produto[]
  podeEditar: boolean
}

type Item = { productId: string; quantity: number }

const iguais = (a: readonly Item[], b: readonly Item[]) =>
  a.length === b.length &&
  a.every((item, i) => item.productId === b[i]?.productId && item.quantity === b[i].quantity)

function ItensDoCombo({ slug, combo, salvos, produtos, podeEditar }: ItensDoComboProps) {
  const definir = useDefinirComposicao(slug, combo.id)
  const daApi = salvos.items.map(({ productId, quantity }) => ({ productId, quantity }))
  const [itens, setItens] = useState<Item[]>(daApi)
  const [escolhido, setEscolhido] = useState('')
  const idDoSeletor = useId()

  const produto = (id: string) => produtos.find((p) => p.id === id)
  const nome = (id: string) =>
    produto(id)?.name ?? salvos.items.find((i) => i.productId === id)?.name ?? 'Produto'
  const alterado = !iguais(itens, daApi)
  const avulso = precoAvulso(itens, produtos)
  const esgotados = itens.filter((i) => produto(i.productId)?.isAvailable === false)
  const paraEscolher = produtosParaOCombo(
    produtos,
    itens.map((i) => i.productId),
  )

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (itens.length === 0) return
    definir.mutate(itens, {
      onSuccess: (salva) => {
        setItens(salva.items.map(({ productId, quantity }) => ({ productId, quantity })))
      },
    })
  }

  return (
    <form noValidate onSubmit={aoEnviar} className="flex flex-col gap-stack">
      {salvos.items.length === 0 && (
        <AvisoDeAtencao>
          Sem itens, o combo aparece esgotado no cardápio. Escolha os produtos que vêm nele.
        </AvisoDeAtencao>
      )}

      {itens.length === 0 ? (
        <p className="text-body text-content-muted">Nenhum item escolhido.</p>
      ) : (
        <ul className="flex flex-col">
          {itens.map((item) => (
            <li
              key={item.productId}
              role="group"
              aria-label={nome(item.productId)}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border py-3 first:border-t-0 first:pt-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold break-words text-content">
                  {nome(item.productId)}
                </p>
                <p className="text-caption text-content-muted">
                  {formatarPreco(produto(item.productId)?.priceInCents ?? 0)} cada
                  {produto(item.productId)?.isAvailable === false && ' · esgotado'}
                </p>
              </div>
              {podeEditar ? (
                <>
                  <QuantityStepper
                    valor={item.quantity}
                    maximo={20}
                    rotulo={nome(item.productId)}
                    aoMudar={(quantity) => {
                      setItens((atuais) =>
                        atuais.map((i) =>
                          i.productId === item.productId ? { ...i, quantity } : i,
                        ),
                      )
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Tirar ${nome(item.productId)} do combo`}
                    onClick={() => {
                      setItens((atuais) => atuais.filter((i) => i.productId !== item.productId))
                    }}
                    className={botaoDeTextoPerigo}
                  >
                    Tirar
                  </button>
                </>
              ) : (
                <p className="text-body font-semibold text-content">{item.quantity}x</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {itens.length > 0 && (
        <p className="text-caption text-content-muted">
          Separados, os itens custam{' '}
          <strong className="text-content">{formatarPreco(avulso)}</strong>. O combo sai por{' '}
          <strong className="text-content">{formatarPreco(combo.priceInCents)}</strong>
          {combo.priceInCents < avulso
            ? ` — o cliente economiza ${formatarPreco(avulso - combo.priceInCents)}.`
            : ': não sai mais barato que os itens separados.'}
        </p>
      )}

      {esgotados.length > 0 && (
        <AvisoDeAtencao>
          {esgotados.map((i) => nome(i.productId)).join(', ')}{' '}
          {esgotados.length === 1 ? 'está esgotado' : 'estão esgotados'}: enquanto{' '}
          {esgotados.length === 1 ? 'estiver' : 'estiverem'}, o combo aparece esgotado no cardápio.
        </AvisoDeAtencao>
      )}

      {podeEditar && paraEscolher.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-stack">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label htmlFor={idDoSeletor} className="text-body font-semibold text-content">
              Adicionar um produto
            </label>
            <select
              id={idDoSeletor}
              value={escolhido}
              onChange={(evento) => {
                setEscolhido(evento.target.value)
              }}
              className="text-body w-full rounded-control border border-border bg-surface px-3 py-2"
            >
              <option value="">Escolha um produto</option>
              {paraEscolher.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatarPreco(p.priceInCents)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={!escolhido}
            // Na mesma página há o "Adicionar" das opções: o nome diz qual é este.
            aria-label="Adicionar ao combo"
            onClick={() => {
              setItens((atuais) => [...atuais, { productId: escolhido, quantity: 1 }])
              setEscolhido('')
            }}
            className="text-body rounded-control border border-primary/40 px-4 py-2 font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>
      )}

      {podeEditar && (
        <>
          {itens.length === 0 && alterado && (
            <p className="text-caption text-content-muted">
              Escolha ao menos um produto para salvar.
            </p>
          )}
          <RodapeDeSalvar
            envio={definir}
            alterado={alterado && itens.length > 0}
            sucesso="Itens do combo salvos."
            rotulo="Salvar itens do combo"
            explicarFalha={(erro) =>
              // "Um combo não pode conter outro combo", "produto não encontrado".
              erro instanceof ApiError && (erro.status === 400 || erro.status === 404)
                ? erro.message
                : null
            }
          />
        </>
      )}
    </form>
  )
}
