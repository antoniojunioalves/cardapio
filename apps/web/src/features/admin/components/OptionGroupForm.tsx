import { zodResolver } from '@hookform/resolvers/zod'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'

import { IconeMais } from '@/components/icons'
import { TextAreaField } from '@/components/TextAreaField'
import { TextField } from '@/components/TextField'
import { ApiError } from '@/services/api'

import { reconferir } from '../form-fields'
import { caminhoDoPainel } from '../menu'
import {
  campoDaOpcao,
  formularioDoGrupoSchema,
  GRUPO_NOVO,
  grupoParaFormulario,
  listaEmPalavras,
  OPCAO_NOVA,
  porQueNaoExcluirGrupo,
  regraDigitada,
  useExcluirGrupo,
  useSalvarGrupo,
  type DadosDoGrupo,
  type GrupoDeOpcoes,
  type ValoresDoGrupo,
} from '../option-groups'
import { BotoesDeOrdem, Excluir } from './catalog-parts'
import {
  AvisoDeAtencao,
  AvisoDeSomenteLeitura,
  botaoDeTexto,
  botaoDeTextoPerigo,
  RodapeDeSalvar,
  Secao,
} from './form-parts'

interface OptionGroupFormProps {
  slug: string
  /** Sem ele, o formulário cria um grupo novo. */
  grupo?: GrupoDeOpcoes | undefined
  /** Criando a partir de um produto: o grupo já entra nele, e a página volta para lá. */
  produtoDeOrigem?: string | undefined
  podeEditar: boolean
}

const SOMENTE_LEITURA =
  'Você pode ver o cardápio, mas só quem administra o estabelecimento o altera.'

/**
 * Criar ou editar um grupo de opções: o nome, como o cliente escolhe (o mínimo
 * e o máximo de escolhas) e as opções, cada uma com o acréscimo de preço. As
 * regras entre os limites e as opções são as mesmas da API (`@repo/shared`).
 */
export function OptionGroupForm({
  slug,
  grupo,
  produtoDeOrigem,
  podeEditar,
}: OptionGroupFormProps) {
  const navigate = useNavigate()
  const salvar = useSalvarGrupo(slug)
  const excluir = useExcluirGrupo(slug)
  const { register, control, formState, handleSubmit, reset, trigger } = useForm<
    ValoresDoGrupo,
    unknown,
    DadosDoGrupo
  >({
    resolver: zodResolver(formularioDoGrupoSchema),
    defaultValues: grupo ? grupoParaFormulario(grupo) : GRUPO_NOVO,
    mode: 'onTouched',
  })
  const opcoes = useFieldArray({ control, name: 'options' })
  const [minimo, maximo] = useWatch({ control, name: ['minSelections', 'maxSelections'] })
  const erros = formState.errors
  const form = { formState, trigger }
  // O mínimo e o máximo dependem um do outro e do número de opções.
  const reconferirLimites = reconferir(form, 'minSelections', 'maxSelections', 'options')
  const regra = regraDigitada(minimo, maximo)
  const erroDasOpcoes = erros.options?.root?.message ?? erros.options?.message

  function aoEnviar(dados: DadosDoGrupo) {
    salvar.mutate(
      { id: grupo?.id, dados, ligarAoProduto: produtoDeOrigem },
      {
        onSuccess: (salvo) => {
          if (grupo) {
            reset(grupoParaFormulario(salvo))
          } else if (produtoDeOrigem) {
            void navigate(caminhoDoPainel(slug, `cardapio/produtos/${produtoDeOrigem}`), {
              replace: true,
              state: { aviso: `Grupo “${salvo.name}” criado e adicionado ao produto.` },
            })
          } else {
            void navigate(caminhoDoPainel(slug, 'cardapio/opcoes'), {
              state: { aviso: `Grupo “${salvo.name}” criado.` },
            })
          }
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-section-y">
      <form
        noValidate
        onSubmit={(evento) => void handleSubmit(aoEnviar)(evento)}
        className="flex flex-col gap-section-y"
      >
        {!podeEditar && <AvisoDeSomenteLeitura texto={SOMENTE_LEITURA} />}
        {grupo && grupo.products.length > 1 && podeEditar && (
          <AvisoDeAtencao>
            Este grupo está em {listaEmPalavras(grupo.products.map((p) => p.name))}. O que você
            mudar aqui vale para todos eles.
          </AvisoDeAtencao>
        )}

        <fieldset disabled={!podeEditar} className="flex min-w-0 flex-col gap-section-y">
          <Secao titulo="Grupo">
            <TextField
              rotulo="Nome"
              placeholder="Adicionais"
              dica="É o que o cliente lê em cima das opções."
              erro={erros.name?.message}
              {...register('name')}
            />
            <TextAreaField
              rotulo="Descrição"
              dica="Opcional. Aparece para o cliente ao lado da regra, como “Capriche no seu lanche”."
              erro={erros.description?.message}
              {...register('description')}
            />
          </Secao>

          <Secao titulo="Como o cliente escolhe">
            <div className="grid grid-cols-2 gap-stack sm:max-w-sm">
              <TextField
                rotulo="Mínimo"
                inputMode="numeric"
                dica="0: se quiser."
                erro={erros.minSelections?.message}
                {...register('minSelections', { onChange: reconferirLimites })}
              />
              <TextField
                rotulo="Máximo"
                inputMode="numeric"
                erro={erros.maxSelections?.message}
                {...register('maxSelections', { onChange: reconferirLimites })}
              />
            </div>
            <p className="text-caption text-content-muted">
              {regra ? (
                <>
                  O cliente vê: <strong className="text-content">{regra}</strong>.
                </>
              ) : (
                'Exemplos: tamanho é mínimo 1 e máximo 1; adicionais é mínimo 0 e máximo 3.'
              )}
            </p>
          </Secao>

          <Secao titulo="Opções">
            <p className="text-caption text-content-muted">
              O preço do produto já vale com a opção mais barata. Nas outras, informe quanto a mais
              custa — em branco ou zero, não muda o preço.
            </p>
            <ul className="flex flex-col">
              {opcoes.fields.map((campo, indice) => {
                const numero = String(indice + 1)
                return (
                  <li
                    key={campo.id}
                    role="group"
                    aria-label={`Opção ${numero}`}
                    className="flex items-start gap-2 border-t border-border py-3"
                  >
                    <div className="grid min-w-0 flex-1 grid-cols-[1fr_7rem] gap-x-3 gap-y-2">
                      <TextField
                        rotulo="Nome"
                        placeholder="Bacon"
                        erro={erros.options?.[indice]?.name?.message}
                        {...register(campoDaOpcao(indice, 'name'), {
                          onChange: reconferir(form, 'options'),
                        })}
                      />
                      <TextField
                        rotulo="A mais (R$)"
                        inputMode="decimal"
                        placeholder="0,00"
                        erro={erros.options?.[indice]?.priceDeltaInCents?.message}
                        {...register(campoDaOpcao(indice, 'priceDeltaInCents'))}
                      />
                      <div className="col-span-2 -ml-2 flex flex-wrap items-center gap-x-2">
                        <label className="text-caption flex items-center gap-2 px-2 text-content">
                          <input
                            type="checkbox"
                            className="size-5"
                            {...register(campoDaOpcao(indice, 'isAvailable'))}
                          />
                          Disponível
                        </label>
                        {podeEditar && (
                          <button
                            type="button"
                            aria-label={`Remover a opção ${numero}`}
                            onClick={() => {
                              opcoes.remove(indice)
                              reconferirLimites()
                            }}
                            className={botaoDeTextoPerigo}
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    </div>
                    {podeEditar && (
                      <BotoesDeOrdem
                        quem={`a opção ${numero}`}
                        primeiro={indice === 0}
                        ultimo={indice === opcoes.fields.length - 1}
                        ocupado={false}
                        aoMover={(direcao) => {
                          opcoes.move(indice, direcao === 'subir' ? indice - 1 : indice + 1)
                        }}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
            {erroDasOpcoes && (
              <p role="alert" className="text-caption text-danger">
                {erroDasOpcoes}
              </p>
            )}
            {podeEditar && (
              <div className="-ml-2">
                <button
                  type="button"
                  onClick={() => {
                    opcoes.append(OPCAO_NOVA)
                    reconferirLimites()
                  }}
                  className={`${botaoDeTexto} inline-flex items-center gap-1`}
                >
                  <IconeMais className="size-4" />
                  Adicionar opção
                </button>
              </div>
            )}
          </Secao>
        </fieldset>

        {podeEditar && (
          <RodapeDeSalvar
            envio={salvar}
            // Criando, o botão fica ligado: clicar mostra o que falta preencher.
            alterado={grupo ? formState.isDirty : true}
            sucesso="Grupo salvo."
            rotulo={grupo ? 'Salvar alterações' : 'Criar grupo'}
            explicarFalha={(erro) => {
              if (!(erro instanceof ApiError)) return null
              if (erro.status === 404) return 'Este grupo foi excluído. Volte às opções.'
              // As regras da tela são as da API; se divergirem, a API diz o problema.
              if (erro.status === 400 && Array.isArray(erro.details))
                return erro.details.filter((d) => typeof d === 'string').join(' ') || erro.message
              return null
            }}
          />
        )}
      </form>

      {grupo && podeEditar && (
        <Excluir
          oQue="o grupo"
          nome={grupo.name}
          consequencia="Ele e as opções dele deixam de existir, e isso não pode ser desfeito."
          impedimento={porQueNaoExcluirGrupo(grupo)}
          excluir={excluir}
          aoConfirmar={() => {
            excluir.mutate(grupo.id, {
              onSuccess: () => {
                void navigate(caminhoDoPainel(slug, 'cardapio/opcoes'), {
                  state: { aviso: `Grupo “${grupo.name}” excluído.` },
                })
              },
            })
          }}
        />
      )}
    </div>
  )
}
