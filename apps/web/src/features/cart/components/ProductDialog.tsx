import { useState } from 'react'

import { QuantityStepper } from '@/components/QuantityStepper'
import { Sheet } from '@/components/Sheet'
import { descreverItensDoCombo } from '@/features/menu/presentation'
import type { GrupoPublico, ProdutoPublico } from '@/features/menu/types'
import { formatarPreco } from '@/utils/money'

import { OBSERVACAO_MAXIMA, QUANTIDADE_MAXIMA } from '../cart'
import {
  SELECAO_VAZIA,
  alternarOpcao,
  descreverRegraDoGrupo,
  escolhidas,
  grupoCompleto,
  gruposPendentes,
  precoUnitario,
  type Selecao,
} from '../selection'
import type { NovoItem } from '../store'

interface ProductDialogProps {
  produto: ProdutoPublico
  aoAdicionar: (item: NovoItem) => void
  aoFechar: () => void
}

/** O produto aberto: escolher opções, quantidade e observação, e pôr no carrinho. */
export function ProductDialog({ produto, aoAdicionar, aoFechar }: ProductDialogProps) {
  const [selecao, setSelecao] = useState<Selecao>(SELECAO_VAZIA)
  const [quantidade, setQuantidade] = useState(1)
  const [observacao, setObservacao] = useState('')

  const pendentes = gruposPendentes(produto, selecao)
  const total = precoUnitario(produto, selecao) * quantidade
  const podeAdicionar = produto.isAvailable && pendentes.length === 0
  const itensDoCombo = descreverItensDoCombo(produto)

  const rodape = (
    <div className="flex flex-col gap-2">
      {produto.isAvailable && pendentes.length > 0 && (
        <p className="text-caption text-content-muted">
          Falta escolher: {pendentes.map((g) => g.name).join(', ')}
        </p>
      )}
      <div className="flex items-center gap-stack">
        <QuantityStepper
          valor={quantidade}
          aoMudar={setQuantidade}
          maximo={QUANTIDADE_MAXIMA}
          rotulo="quantidade"
        />
        <button
          type="button"
          disabled={!podeAdicionar}
          aria-label={produto.isAvailable ? `Adicionar ${formatarPreco(total)}` : 'Esgotado'}
          onClick={() => {
            aoAdicionar({
              productId: produto.id,
              nome: produto.name,
              selecao,
              quantidade,
              observacao,
            })
          }}
          className="text-body flex flex-1 items-center justify-between gap-2 rounded-control bg-primary px-4 py-3 font-semibold text-primary-content hover:bg-primary-hover disabled:bg-neutral-300 disabled:text-neutral-600"
        >
          {produto.isAvailable ? (
            <>
              <span>Adicionar</span>
              <span>{formatarPreco(total)}</span>
            </>
          ) : (
            <span className="w-full">Esgotado</span>
          )}
        </button>
      </div>
    </div>
  )

  return (
    <Sheet titulo={produto.name} aoFechar={aoFechar} rodape={rodape}>
      <div className="flex flex-col gap-section-y">
        <div className="flex flex-col gap-2">
          {produto.imageUrl && (
            <img
              src={produto.imageUrl}
              alt=""
              className="aspect-video w-full rounded-control object-cover"
            />
          )}
          {itensDoCombo && <p className="text-body text-content">{itensDoCombo}</p>}
          {produto.description && (
            <p className="text-body text-content-muted">{produto.description}</p>
          )}
          <p className="text-body font-semibold text-content">
            {formatarPreco(produto.priceInCents)}
          </p>
        </div>

        {produto.optionGroups.map((grupo) => (
          <GrupoDeOpcoes
            key={grupo.id}
            grupo={grupo}
            selecao={selecao}
            aoTocar={(opcaoId) => {
              setSelecao((atual) => alternarOpcao(grupo, atual, opcaoId))
            }}
          />
        ))}

        <div className="flex flex-col gap-2">
          <label htmlFor="observacao" className="text-body font-semibold text-content">
            Alguma observação?
          </label>
          <textarea
            id="observacao"
            value={observacao}
            maxLength={OBSERVACAO_MAXIMA}
            rows={2}
            placeholder="Ex.: tirar a cebola, ponto da carne"
            onChange={(e) => {
              setObservacao(e.target.value)
            }}
            className="text-body w-full rounded-control border border-border bg-surface px-3 py-2"
          />
          <p className="text-caption self-end text-content-muted">
            {observacao.length}/{OBSERVACAO_MAXIMA}
          </p>
        </div>
      </div>
    </Sheet>
  )
}

interface GrupoDeOpcoesProps {
  grupo: GrupoPublico
  selecao: Selecao
  aoTocar: (opcaoId: string) => void
}

/**
 * Um grupo de opções.
 *
 * Obrigatório de uma escolha vira rádio; o resto vira caixa de marcar — num
 * grupo opcional de uma escolha, o cliente precisa poder desmarcar. Com o
 * máximo atingido, as opções não marcadas ficam desabilitadas.
 */
function GrupoDeOpcoes({ grupo, selecao, aoTocar }: GrupoDeOpcoesProps) {
  const radio = grupo.maxSelections === 1 && grupo.minSelections >= 1
  const marcadas = escolhidas(selecao, grupo.id)
  const completo = grupoCompleto(grupo, selecao)
  const atendido = marcadas.length >= grupo.minSelections

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="flex w-full items-start justify-between gap-2">
        <span>
          <span className="text-body block font-semibold text-content">{grupo.name}</span>
          <span className="text-caption block text-content-muted">
            {grupo.description ? `${grupo.description} · ` : ''}
            {descreverRegraDoGrupo(grupo)}
          </span>
        </span>
        {grupo.isRequired && (
          <span
            className={`text-caption shrink-0 rounded-pill px-2 py-0.5 font-semibold ${
              atendido ? 'bg-brand-100 text-brand-800' : 'bg-neutral-800 text-content-inverted'
            }`}
          >
            {atendido ? 'Pronto' : 'Obrigatório'}
          </span>
        )}
      </legend>

      {grupo.options.map((opcao) => {
        const marcada = marcadas.includes(opcao.id)
        const bloqueada = !opcao.isAvailable || (!marcada && completo && grupo.maxSelections > 1)

        return (
          <label
            key={opcao.id}
            className={`flex items-center gap-stack rounded-control border border-border px-3 py-2 ${
              bloqueada ? 'opacity-50' : 'cursor-pointer'
            }`}
          >
            <input
              type={radio ? 'radio' : 'checkbox'}
              name={`grupo-${grupo.id}`}
              checked={marcada}
              disabled={bloqueada && !marcada}
              onChange={() => {
                aoTocar(opcao.id)
              }}
              className="size-5 accent-primary"
            />
            <span className="text-body flex-1 text-content">{opcao.name}</span>
            <span className="text-caption text-content-muted">
              {!opcao.isAvailable
                ? 'Esgotado'
                : opcao.priceDeltaInCents > 0
                  ? `+ ${formatarPreco(opcao.priceDeltaInCents)}`
                  : ''}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}
