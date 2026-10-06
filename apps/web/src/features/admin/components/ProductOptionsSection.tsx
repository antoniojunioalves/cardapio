import { useId, useState } from 'react'
import { Link } from 'react-router'

import { IconeMais } from '@/components/icons'

import { moverNaLista } from '../catalog'
import { caminhoDoPainel } from '../menu'
import {
  opcoesEmPalavras,
  regraEmPalavras,
  useGrupos,
  useGruposDoProduto,
  type GrupoDeOpcoes,
} from '../option-groups'
import { BotoesDeOrdem } from './catalog-parts'
import { botaoDeTexto, botaoDeTextoPerigo } from './form-parts'

interface ProductOptionsSectionProps {
  slug: string
  produtoId: string
  /** Os grupos escolhidos e ainda não salvos, na ordem; `null` enquanto valem os gravados. */
  escolhidos: readonly string[] | null
  aoMudar: (escolhidos: string[] | null) => void
  podeEditar: boolean
  /** O "Salvar" da página está gravando. */
  ocupado: boolean
  /** Há campos ou opções por salvar na página. */
  porSalvar: boolean
}

/** Um grupo obrigatório sem nenhuma opção disponível tira o produto de venda. */
const travaOProduto = (grupo: GrupoDeOpcoes) =>
  grupo.minSelections > grupo.options.filter((o) => o.isAvailable).length

const mesmaLista = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, indice) => id === b[indice])

/**
 * Os grupos de opção do produto, na ordem em que o cliente os vê, dentro do
 * quadro do produto. Acrescentar, tirar e mudar a ordem não gravam nada: como
 * os campos, valem quando a pessoa salva — é o "Salvar" da página que manda a
 * lista inteira.
 */
export function ProductOptionsSection({
  slug,
  produtoId,
  escolhidos,
  aoMudar,
  podeEditar,
  ocupado,
  porSalvar,
}: ProductOptionsSectionProps) {
  const doProduto = useGruposDoProduto(slug, produtoId)
  const todos = useGrupos(slug)
  const [paraAdicionar, setParaAdicionar] = useState('')
  const idDoTitulo = useId()
  const idDoSeletor = useId()

  const gravados = doProduto.data ?? []
  const idsGravados = gravados.map((g) => g.id)
  const ids = escolhidos ?? idsGravados
  // Cada grupo com as opções dele: os do produto e, para os acrescentados agora, os do estabelecimento.
  const porId = new Map([...gravados, ...(todos.data ?? [])].map((g) => [g.id, g]))
  const grupos = ids.flatMap((id) => porId.get(id) ?? [])
  const disponiveis = (todos.data ?? []).filter((g) => !ids.includes(g.id))
  // De volta ao que está gravado, não há o que salvar.
  const mudar = (novos: string[]) => {
    aoMudar(mesmaLista(novos, idsGravados) ? null : novos)
  }

  return (
    <section
      aria-labelledby={idDoTitulo}
      className="flex flex-col gap-stack border-t border-border pt-stack"
    >
      <h3 id={idDoTitulo} className="text-body font-semibold text-content">
        Opções
      </h3>
      <p className="text-caption text-content-muted">
        O que o cliente escolhe ao pedir — tamanho, adicionais, o que tirar —, nesta ordem. Um grupo
        vale para vários produtos: mudar o grupo muda todos eles.
      </p>

      {doProduto.isPending ? (
        <p className="text-body text-content-muted">Carregando as opções…</p>
      ) : doProduto.isError ? (
        <p role="alert" className="text-body text-content-muted">
          Não foi possível carregar as opções do produto. Recarregue a página para tentar de novo.
        </p>
      ) : grupos.length === 0 ? (
        <p className="text-body text-content-muted">
          Este produto não tem opções: o cliente pede como ele está.
        </p>
      ) : (
        <ul className="flex flex-col">
          {grupos.map((grupo, indice) => (
            <li
              key={grupo.id}
              className="flex items-start gap-2 border-t border-border py-3 first:border-t-0 first:pt-0"
            >
              <div className="min-w-0 flex-1">
                <Link
                  to={caminhoDoPainel(slug, `cardapio/opcoes/${grupo.id}`)}
                  className="text-body font-semibold break-words text-content hover:text-primary hover:underline"
                >
                  {grupo.name}
                </Link>
                <p className="text-caption font-semibold text-content">{regraEmPalavras(grupo)}</p>
                <p className="text-caption text-content-muted">{opcoesEmPalavras(grupo.options)}</p>
                {travaOProduto(grupo) && (
                  <p className="text-caption mt-1 font-semibold text-accent-800">
                    Faltam opções disponíveis neste grupo obrigatório: o produto aparece esgotado no
                    cardápio.
                  </p>
                )}
                {podeEditar && (
                  <button
                    type="button"
                    disabled={ocupado}
                    aria-label={`Tirar ${grupo.name} deste produto`}
                    onClick={() => {
                      mudar(ids.filter((id) => id !== grupo.id))
                    }}
                    className={`${botaoDeTextoPerigo} -ml-2`}
                  >
                    Tirar deste produto
                  </button>
                )}
              </div>
              {podeEditar && (
                <BotoesDeOrdem
                  quem={`o grupo ${grupo.name}`}
                  primeiro={indice === 0}
                  ultimo={indice === grupos.length - 1}
                  ocupado={ocupado}
                  aoMover={(direcao) => {
                    mudar(moverNaLista(ids, indice, direcao))
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {podeEditar && doProduto.isSuccess && (
        <div className="flex flex-col gap-2 border-t border-border pt-stack">
          {disponiveis.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label htmlFor={idDoSeletor} className="text-body font-semibold text-content">
                  Adicionar um grupo
                </label>
                <select
                  id={idDoSeletor}
                  value={paraAdicionar}
                  onChange={(evento) => {
                    setParaAdicionar(evento.target.value)
                  }}
                  className="text-body w-full rounded-control border border-border bg-surface px-3 py-2"
                >
                  <option value="">Escolha um grupo</option>
                  {disponiveis.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} — {regraEmPalavras(g)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={!paraAdicionar || ocupado}
                // Num combo, a página tem também o "Adicionar" dos itens.
                aria-label="Adicionar o grupo"
                onClick={() => {
                  mudar([...ids, paraAdicionar])
                  setParaAdicionar('')
                }}
                className="text-body rounded-control border border-primary/40 px-4 py-2 font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                Adicionar
              </button>
            </div>
          )}
          {porSalvar ? (
            // Criar um grupo leva a outra página: o que não foi salvo aqui se perderia.
            <p className="text-caption text-content-muted">
              Para criar um grupo novo para este produto, salve antes as alterações.
            </p>
          ) : (
            <Link
              to={`${caminhoDoPainel(slug, 'cardapio/opcoes/novo')}?produto=${produtoId}`}
              className={`${botaoDeTexto} -ml-2 inline-flex w-fit items-center gap-1`}
            >
              <IconeMais className="size-4" />
              Criar um grupo novo para este produto
            </Link>
          )}
        </div>
      )}
    </section>
  )
}
