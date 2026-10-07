import { useId, useState, type FormEvent } from 'react'

import { IconeMais } from '@/components/icons'

import { moverNaLista, type Produto } from '../catalog'
import {
  opcoesEmPalavras,
  regraEmPalavras,
  useDefinirGruposDoProduto,
  useGrupos,
  useGruposDoProduto,
  type GrupoDeOpcoes,
} from '../option-groups'
import { useAlteracaoDoPasso } from '../product-steps'
import { BotoesDeOrdem, EditarEExcluir } from './catalog-parts'
import { botaoDeTexto, botaoDeTextoPerigo, Secao } from './form-parts'
import { OptionGroupSheet } from './OptionGroupSheet'
import { RodapeDoPasso } from './Passos'

interface StepOptionsProps {
  slug: string
  produto: Produto
  podeEditar: boolean
  aoAlterar: (alterado: boolean) => void
  /** O passo foi gravado, ou não tinha o que gravar: é o último, e encerra. */
  aoAvancar: () => void
  aoVoltar?: (() => void) | undefined
}

/** Um grupo obrigatório sem nenhuma opção disponível tira o produto de venda. */
const travaOProduto = (grupo: GrupoDeOpcoes) =>
  grupo.minSelections > grupo.options.filter((o) => o.isAvailable).length

const mesmaLista = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, indice) => id === b[indice])

/**
 * O passo dos opcionais: os grupos do produto — tamanho, adicionais, o que
 * tirar —, na ordem em que o cliente os vê. Acrescentar um grupo que já
 * existe, tirar e mudar a ordem só mexem na tela: é o botão do passo que grava
 * a lista inteira. Criar um grupo novo, ou editar um, abre a janela do grupo
 * por cima — o grupo é gravado ali, e o novo entra no fim da lista.
 */
export function StepOptions({
  slug,
  produto,
  podeEditar,
  aoAlterar,
  aoAvancar,
  aoVoltar,
}: StepOptionsProps) {
  const doProduto = useGruposDoProduto(slug, produto.id)
  const todos = useGrupos(slug)
  const definir = useDefinirGruposDoProduto(slug, produto.id)
  // Os grupos escolhidos e ainda não salvos, na ordem; `null` enquanto valem os gravados.
  const [escolhidos, setEscolhidos] = useState<string[] | null>(null)
  const [paraAdicionar, setParaAdicionar] = useState('')
  // A janela do grupo: `{}` cria um novo; com `grupo`, edita.
  const [janela, setJanela] = useState<{ grupo?: GrupoDeOpcoes } | null>(null)
  const idDoSeletor = useId()

  const gravados = doProduto.data ?? []
  const idsGravados = gravados.map((g) => g.id)
  const ids = escolhidos ?? idsGravados
  // Cada grupo com as opções dele: os do produto e, mais novos, os do estabelecimento.
  const porId = new Map([...gravados, ...(todos.data ?? [])].map((g) => [g.id, g]))
  const grupos = ids.flatMap((id) => porId.get(id) ?? [])
  const disponiveis = (todos.data ?? []).filter((g) => !ids.includes(g.id))
  const alterado = escolhidos !== null
  // De volta ao que está gravado, não há o que salvar.
  const mudar = (novos: string[]) => {
    setEscolhidos(mesmaLista(novos, idsGravados) ? null : novos)
  }

  useAlteracaoDoPasso(alterado, aoAlterar)

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    // Nada mudou: é só encerrar — um produto pode não ter opcionais.
    if (!escolhidos) {
      aoAvancar()
      return
    }
    definir.mutate(escolhidos, {
      onSuccess: () => {
        setEscolhidos(null)
        aoAvancar()
      },
    })
  }

  return (
    <>
      <form noValidate onSubmit={aoEnviar} className="flex flex-col gap-section-y">
        <Secao titulo="Opcionais">
          <p className="text-caption text-content-muted">
            O que o cliente escolhe ao pedir — tamanho, adicionais, o que tirar —, nesta ordem. Um
            grupo vale para vários produtos: mudar o grupo muda todos eles.
          </p>

          {doProduto.isPending ? (
            <p className="text-body text-content-muted">Carregando os opcionais…</p>
          ) : doProduto.isError ? (
            <p role="alert" className="text-body text-content-muted">
              Não foi possível carregar os opcionais do produto. Recarregue a página para tentar de
              novo.
            </p>
          ) : grupos.length === 0 ? (
            <p className="text-body text-content-muted">
              Este produto não tem opcionais: o cliente pede como ele está.
            </p>
          ) : (
            <ul className="flex flex-col">
              {grupos.map((grupo, indice) => (
                <li
                  key={grupo.id}
                  className="flex items-start gap-2 border-t border-border py-3 first:border-t-0 first:pt-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1">
                      <p className="text-body min-w-0 font-semibold break-words text-content">
                        {grupo.name}
                      </p>
                      <EditarEExcluir
                        quem={`o grupo ${grupo.name}`}
                        editar={
                          podeEditar
                            ? () => {
                                setJanela({ grupo })
                              }
                            : undefined
                        }
                      />
                    </div>
                    <p className="text-caption font-semibold text-content">
                      {regraEmPalavras(grupo)}
                    </p>
                    <p className="text-caption text-content-muted">
                      {opcoesEmPalavras(grupo.options)}
                    </p>
                    {travaOProduto(grupo) && (
                      <p className="text-caption mt-1 font-semibold text-accent-800">
                        Faltam opções disponíveis neste grupo obrigatório: o produto aparece
                        esgotado no cardápio.
                      </p>
                    )}
                    {podeEditar && (
                      <button
                        type="button"
                        disabled={definir.isPending}
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
                      ocupado={definir.isPending}
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
                      Adicionar um grupo que já existe
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
                    disabled={!paraAdicionar || definir.isPending}
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
              <button
                type="button"
                onClick={() => {
                  setJanela({})
                }}
                className={`${botaoDeTexto} -ml-2 inline-flex w-fit items-center gap-1`}
              >
                <IconeMais className="size-4" />
                Criar um grupo novo
              </button>
            </div>
          )}
        </Secao>

        {podeEditar && <RodapeDoPasso envio={definir} ultimo aoVoltar={aoVoltar} />}
      </form>

      {/*
        Fora do formulário do passo: a janela é desenhada em outro lugar da
        página, mas para o React continua aqui dentro — o "enviar" do formulário
        dela subiria até o do passo e o gravaria junto.
      */}
      {janela && (
        <OptionGroupSheet
          slug={slug}
          grupo={janela.grupo}
          aoFechar={() => {
            setJanela(null)
          }}
          aoSalvar={(salvo) => {
            // O grupo novo entra no fim da lista do produto — e vai ao salvar o passo.
            if (!janela.grupo) mudar([...ids, salvo.id])
            setJanela(null)
          }}
        />
      )}
    </>
  )
}
