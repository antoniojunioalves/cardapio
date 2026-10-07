import { zodResolver } from '@hookform/resolvers/zod'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'

import { TextField } from '@/components/TextField'

import {
  campoDaRegiao,
  formularioSchema,
  paraFormulario,
  REGIAO_NOVA,
  useSalvarEntrega,
  type DadosDoFormulario,
  type Entrega,
  type ValoresDoFormulario,
} from '../delivery'
import { reconferir } from '../form-fields'
import {
  AvisoDeAtencao,
  AvisoDeSomenteLeitura,
  botaoDeTexto,
  botaoDeTextoPerigo,
  Marcavel,
  RodapeDeSalvar,
  Secao,
} from './form-parts'

interface DeliveryFormProps {
  slug: string
  entrega: Entrega
  /** Sem `settings:update`, a pessoa vê tudo e não altera nada. */
  podeEditar: boolean
}

/**
 * Entrega e retirada: como o pedido chega ao cliente, quanto custa a entrega e
 * quanto ela demora. Um "Salvar" só — a API grava a configuração e as regiões
 * na mesma transação.
 */
export function DeliveryForm({ slug, entrega, podeEditar }: DeliveryFormProps) {
  const salvar = useSalvarEntrega(slug)
  const { register, control, formState, handleSubmit, reset, trigger } = useForm<
    ValoresDoFormulario,
    unknown,
    DadosDoFormulario
  >({
    resolver: zodResolver(formularioSchema),
    defaultValues: paraFormulario(entrega),
    mode: 'onTouched',
  })
  const regioes = useFieldArray({ control, name: 'regioes' })
  const form = { formState, trigger }
  // O nome repetido marca a outra região, e "nenhuma ativa" marca a lista:
  // mexer numa região confere a lista inteira de novo.
  const reconferirRegioes = reconferir(form, 'regioes')
  const [comEntrega, comRetirada, modo] = useWatch({
    control,
    name: ['deliveryEnabled', 'pickupEnabled', 'feeMode'],
  })
  const erros = formState.errors
  const erroDasRegioes = erros.regioes?.root?.message ?? erros.regioes?.message

  // Uma parte escondida com erro apareceria como um "Salvar" que não faz nada:
  // com erro, ela fica à vista até a pessoa corrigir.
  const mostrarTaxas = Boolean(
    comEntrega ||
    erros.fixedFeeInCents ||
    erros.regioes ||
    erros.estimatedMinMinutes ||
    erros.estimatedMaxMinutes,
  )
  const mostrarTaxaFixa = modo === 'FIXED' || Boolean(erros.fixedFeeInCents)
  const mostrarRegioes = modo === 'BY_REGION' || Boolean(erros.regioes)

  function aoEnviar(dados: DadosDoFormulario) {
    salvar.mutate(dados, {
      onSuccess: (salva) => {
        reset(paraFormulario(salva))
      },
    })
  }

  return (
    <form
      noValidate
      onSubmit={(evento) => void handleSubmit(aoEnviar)(evento)}
      className="flex flex-col gap-section-y"
    >
      {!podeEditar && <AvisoDeSomenteLeitura />}

      {/* `disabled` no fieldset desliga todos os campos de uma vez para quem só pode ver. */}
      <fieldset disabled={!podeEditar} className="flex min-w-0 flex-col gap-section-y">
        <Secao titulo="Como o cliente recebe o pedido">
          <Marcavel
            type="checkbox"
            titulo="Entrega"
            descricao="Você leva o pedido até o endereço do cliente."
            {...register('deliveryEnabled', {
              onChange: reconferir(form, 'pickupEnabled', 'regioes'),
            })}
          />
          <Marcavel
            type="checkbox"
            titulo="Retirada no local"
            descricao="O cliente busca o pedido no estabelecimento. Não tem taxa."
            {...register('pickupEnabled')}
          />
          {erros.pickupEnabled?.message ? (
            <p role="alert" className="text-caption text-danger">
              {erros.pickupEnabled.message}
            </p>
          ) : (
            !comEntrega &&
            !comRetirada && (
              <AvisoDeAtencao>
                Com a entrega e a retirada desligadas, o cardápio não recebe pedidos. Ligue ao menos
                uma.
              </AvisoDeAtencao>
            )
          )}
        </Secao>

        {mostrarTaxas && (
          <Secao titulo="Taxa de entrega">
            <div role="radiogroup" aria-label="Taxa de entrega" className="flex flex-col gap-stack">
              <Marcavel
                type="radio"
                value="FIXED"
                titulo="Taxa fixa"
                descricao="O mesmo valor para qualquer endereço."
                {...register('feeMode', { onChange: reconferirRegioes })}
              />
              <Marcavel
                type="radio"
                value="BY_REGION"
                titulo="Taxa por região"
                descricao="Um valor para cada bairro ou região que você atende. O cliente escolhe a dele ao fechar o pedido."
                {...register('feeMode', { onChange: reconferirRegioes })}
              />
            </div>

            {mostrarTaxaFixa && (
              <TextField
                rotulo="Taxa fixa (R$)"
                inputMode="decimal"
                placeholder="0,00"
                dica="Em branco ou zero: entrega grátis."
                erro={erros.fixedFeeInCents?.message}
                className="sm:max-w-48"
                {...register('fixedFeeInCents')}
              />
            )}

            {mostrarRegioes && (
              <div className="flex flex-col gap-stack">
                <ul className="flex flex-col gap-stack">
                  {regioes.fields.map((campo, indice) => {
                    const numero = String(indice + 1)
                    return (
                      <li
                        key={campo.id}
                        role="group"
                        aria-label={`Região ${numero}`}
                        className="grid grid-cols-[1fr_7rem] items-start gap-x-3 gap-y-2 border-t border-border pt-stack sm:grid-cols-[1fr_8rem_auto_auto] sm:gap-x-4"
                      >
                        <TextField
                          rotulo="Nome"
                          placeholder="Centro"
                          erro={erros.regioes?.[indice]?.name?.message}
                          {...register(campoDaRegiao(indice, 'name'), {
                            onChange: reconferirRegioes,
                          })}
                        />
                        <TextField
                          rotulo="Taxa (R$)"
                          inputMode="decimal"
                          placeholder="0,00"
                          erro={erros.regioes?.[indice]?.feeInCents?.message}
                          {...register(campoDaRegiao(indice, 'feeInCents'))}
                        />
                        <label className="text-body flex items-center gap-2 text-content sm:pt-9">
                          <input
                            type="checkbox"
                            className="size-5"
                            {...register(campoDaRegiao(indice, 'isActive'), {
                              onChange: reconferirRegioes,
                            })}
                          />
                          Ativa
                        </label>
                        {podeEditar && (
                          <button
                            type="button"
                            aria-label={`Remover a região ${numero}`}
                            onClick={() => {
                              regioes.remove(indice)
                            }}
                            className={`${botaoDeTextoPerigo} justify-self-end sm:mt-9`}
                          >
                            Remover
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>

                {regioes.fields.length === 0 && (
                  <p className="text-body text-content-muted">Nenhuma região cadastrada.</p>
                )}
                {erroDasRegioes && (
                  <p role="alert" className="text-caption text-danger">
                    {erroDasRegioes}
                  </p>
                )}
                {podeEditar && (
                  <div className="-ml-2">
                    <button
                      type="button"
                      onClick={() => {
                        regioes.append(REGIAO_NOVA)
                      }}
                      className={botaoDeTexto}
                    >
                      Adicionar região
                    </button>
                  </div>
                )}
                <p className="text-caption text-content-muted">
                  Uma região que não está ativa continua guardada, mas o cliente não a vê.
                </p>
              </div>
            )}
          </Secao>
        )}

        {mostrarTaxas && (
          <Secao titulo="Tempo de entrega">
            <div className="grid grid-cols-1 gap-stack sm:grid-cols-2">
              <TextField
                rotulo="Tempo mínimo (min)"
                inputMode="numeric"
                erro={erros.estimatedMinMinutes?.message}
                {...register('estimatedMinMinutes', {
                  onChange: reconferir(form, 'estimatedMaxMinutes'),
                })}
              />
              <TextField
                rotulo="Tempo máximo (min)"
                inputMode="numeric"
                erro={erros.estimatedMaxMinutes?.message}
                {...register('estimatedMaxMinutes')}
              />
            </div>
            <p className="text-caption text-content-muted">
              Opcional. É o tempo que aparece para o cliente nas informações do cardápio.
            </p>
          </Secao>
        )}
      </fieldset>

      {podeEditar && (
        <RodapeDeSalvar envio={salvar} alterado={formState.isDirty} sucesso="Entrega salva." />
      )}
    </form>
  )
}
