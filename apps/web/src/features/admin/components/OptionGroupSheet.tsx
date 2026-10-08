import { zodResolver } from '@hookform/resolvers/zod'
import { useId } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'

import { IconeMais } from '@/components/icons'
import { TextAreaField } from '@/components/TextAreaField'
import { TextField } from '@/components/TextField'
import { ApiError } from '@/services/api'

import { reconferir } from '../form-fields'
import {
  campoDaOpcao,
  formularioDoGrupoSchema,
  GRUPO_NOVO,
  grupoParaFormulario,
  listaEmPalavras,
  OPCAO_NOVA,
  regraDigitada,
  useSalvarGrupo,
  type DadosDoGrupo,
  type GrupoDeOpcoes,
  type ValoresDoGrupo,
} from '../option-groups'
import { limiteNoProduto, type PodeNoProduto } from '../permissions'
import { BotoesDeOrdem } from './catalog-parts'
import {
  AvisoDeAtencao,
  AvisoDeSomenteLeitura,
  botaoDeTexto,
  botaoDeTextoPerigo,
} from './form-parts'
import { FormSheet } from './FormSheet'

interface OptionGroupSheetProps {
  slug: string
  /** Sem ele, a janela cria um grupo novo. */
  grupo?: GrupoDeOpcoes | undefined
  /**
   * O que o perfil da pessoa alcança, como no produto: o acréscimo de uma opção
   * é preço, o "disponível" dela é o que esgotou, e o resto é alterar os
   * opcionais. O que ela não alcança fica desligado.
   */
  pode: PodeNoProduto
  aoFechar: () => void
  /** O grupo foi gravado: quem abriu a janela a fecha e faz o resto — liga ao produto, avisa. */
  aoSalvar: (grupo: GrupoDeOpcoes) => void
}

const subtitulo = 'text-body font-semibold text-content'
const parte = 'flex flex-col gap-stack border-t border-border pt-stack'

/**
 * A janela de criar ou editar um grupo de opcionais: o nome, como o cliente
 * escolhe (o mínimo e o máximo de escolhas) e as opções, cada uma com o
 * acréscimo de preço. Abre sobre a aba dos opcionais e sobre o passo
 * Opcionais do produto — a pessoa não sai de onde estava. As regras entre os
 * limites e as opções são as mesmas da API (`@repo/shared`).
 */
export function OptionGroupSheet({ slug, grupo, pode, aoFechar, aoSalvar }: OptionGroupSheetProps) {
  const id = useId()
  const salvar = useSalvarGrupo(slug)
  const { register, control, formState, handleSubmit, trigger, getValues } = useForm<
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
  const limite = limiteNoProduto(pode)

  function aoEnviar(dados: DadosDoGrupo) {
    salvar.mutate({ id: grupo?.id, dados }, { onSuccess: aoSalvar })
  }

  return (
    <FormSheet
      titulo={grupo ? 'Editar grupo de opcionais' : 'Novo grupo de opcionais'}
      formulario={id}
      aoFechar={aoFechar}
      alterado={formState.isDirty}
      criando={!grupo}
      envio={salvar}
      rotulo={grupo ? 'Salvar alterações' : 'Criar grupo'}
      explicarFalha={(erro) => {
        if (!(erro instanceof ApiError)) return null
        if (erro.status === 404) return 'Este grupo foi excluído. Feche a janela.'
        // As regras da tela são as da API; se divergirem, a API diz o problema.
        if (erro.status === 400 && Array.isArray(erro.details))
          return erro.details.filter((d) => typeof d === 'string').join(' ') || erro.message
        return null
      }}
    >
      <form
        id={id}
        noValidate
        onSubmit={(evento) => void handleSubmit(aoEnviar)(evento)}
        className="flex flex-col gap-stack"
      >
        {grupo && grupo.products.length > 1 && (
          <AvisoDeAtencao>
            Este grupo está em {listaEmPalavras(grupo.products.map((p) => p.name))}. O que você
            mudar aqui vale para todos eles.
          </AvisoDeAtencao>
        )}

        {limite && <AvisoDeSomenteLeitura texto={limite} />}

        <TextField
          rotulo="Nome do grupo"
          placeholder="Adicionais"
          dica="É o que o cliente lê em cima das opções."
          erro={erros.name?.message}
          disabled={!pode.resto}
          {...register('name')}
        />
        <TextAreaField
          rotulo="Descrição"
          dica="Opcional. Aparece para o cliente ao lado da regra, como “Capriche no seu lanche”."
          erro={erros.description?.message}
          disabled={!pode.resto}
          {...register('description')}
        />

        <section className={parte}>
          <h3 className={subtitulo}>Como o cliente escolhe</h3>
          <div className="grid grid-cols-2 gap-stack sm:max-w-sm">
            <TextField
              rotulo="Mínimo"
              inputMode="numeric"
              dica="0: se quiser."
              erro={erros.minSelections?.message}
              disabled={!pode.resto}
              {...register('minSelections', { onChange: reconferirLimites })}
            />
            <TextField
              rotulo="Máximo"
              inputMode="numeric"
              erro={erros.maxSelections?.message}
              disabled={!pode.resto}
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
        </section>

        <section className={parte}>
          <h3 className={subtitulo}>Opções</h3>
          <p className="text-caption text-content-muted">
            O preço do produto já vale com a opção mais barata. Nas outras, informe quanto a mais
            custa — em branco ou zero, não muda o preço.
          </p>
          <ul className="flex flex-col">
            {opcoes.fields.map((campo, indice) => {
              const numero = String(indice + 1)
              // Uma opção que ainda não existe é de quem a cria: o "disponível"
              // dela não é marcar o que esgotou. O acréscimo é sempre preço.
              const nova = !getValues(`options.${indice}.id`)
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
                      disabled={!pode.resto}
                      {...register(campoDaOpcao(indice, 'name'), {
                        onChange: reconferir(form, 'options'),
                      })}
                    />
                    <TextField
                      rotulo="A mais (R$)"
                      inputMode="decimal"
                      placeholder="0,00"
                      erro={erros.options?.[indice]?.priceDeltaInCents?.message}
                      disabled={!pode.preco}
                      {...register(campoDaOpcao(indice, 'priceDeltaInCents'))}
                    />
                    <div className="col-span-2 -ml-2 flex flex-wrap items-center gap-x-2">
                      <label className="text-caption flex items-center gap-2 px-2 text-content">
                        <input
                          type="checkbox"
                          className="size-5"
                          disabled={nova ? !pode.resto : !pode.disponibilidade}
                          {...register(campoDaOpcao(indice, 'isAvailable'))}
                        />
                        Disponível
                      </label>
                      {pode.resto && (
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
                  {pode.resto && (
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
          {pode.resto && (
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
        </section>
      </form>
    </FormSheet>
  )
}
