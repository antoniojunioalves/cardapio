import { zodResolver } from '@hookform/resolvers/zod'
import { useId } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'

import { IconeRemover } from '@/components/icons'

import {
  campoDoIntervalo,
  DIAS,
  fechaNoDiaSeguinte,
  formularioSchema,
  paraFormulario,
  repetirNosOutrosDias,
  useSalvarHorarios,
  type Horario,
  type ValoresDoFormulario,
} from '../hours'
import { reconferir } from '../form-fields'
import {
  AvisoDeAtencao,
  AvisoDeSomenteLeitura,
  botaoDeTexto,
  RodapeDeSalvar,
  Secao,
} from './form-parts'

// No celular os dois campos dividem a linha; a largura fixa de tela grande
// comporta também o "AM/PM" de um navegador em inglês.
const campoDeHora = (comErro: boolean) =>
  `text-body min-w-0 flex-1 rounded-control border bg-surface px-2 py-2 sm:w-36 sm:flex-none ${comErro ? 'border-danger' : 'border-border'}`

interface HoursFormProps {
  slug: string
  horarios: readonly Horario[]
  /** Sem `settings:update`, a pessoa vê tudo e não altera nada. */
  podeEditar: boolean
}

/**
 * A grade da semana. Cada dia tem os seus horários — nenhum é "fechado", dois é
 * almoço e jantar. O "Salvar" grava a semana inteira de uma vez, que é como a
 * API a recebe.
 */
export function HoursForm({ slug, horarios, podeEditar }: HoursFormProps) {
  const salvar = useSalvarHorarios(slug)
  const idDosErros = useId()
  const { register, control, formState, handleSubmit, reset, getValues, trigger } =
    useForm<ValoresDoFormulario>({
      resolver: zodResolver(formularioSchema),
      defaultValues: paraFormulario(horarios),
      mode: 'onTouched',
    })
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'intervalos' })
  // Os campos de hora não são controlados: é daqui que sai o que está digitado agora.
  const digitados = useWatch({ control, name: 'intervalos' })
  const erros = formState.errors.intervalos
  // O problema de um horário pode estar no outro campo dele, ou em outro horário
  // do mesmo dia: mexer em qualquer um confere a grade inteira de novo.
  const reconferirGrade = reconferir({ formState, trigger }, 'intervalos')

  function aoEnviar(dados: ValoresDoFormulario) {
    salvar.mutate(dados, {
      onSuccess: (salvos) => {
        reset(paraFormulario(salvos))
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

      <fieldset disabled={!podeEditar} className="min-w-0">
        <Secao titulo="Horário de funcionamento">
          <p className="text-caption text-content-muted">
            O cardápio abre e fecha sozinho por estes horários. Um dia sem horário fica fechado.
            Para fechar depois da meia-noite, ponha a hora de fechar menor que a de abrir, como
            18:00 às 02:00.
          </p>

          {fields.length === 0 && (
            <AvisoDeAtencao>Sem nenhum horário, o cardápio aparece sempre fechado.</AvisoDeAtencao>
          )}

          <ul className="flex flex-col gap-stack">
            {DIAS.map(({ dia, nome }) => {
              const doDia = fields
                .map((campo, indice) => ({ campo, indice }))
                .filter(({ campo }) => campo.dayOfWeek === dia)

              return (
                <li
                  key={dia}
                  className="flex flex-col gap-2 border-t border-border pt-stack first:border-t-0 first:pt-0 sm:grid sm:grid-cols-[9rem_1fr] sm:gap-4"
                >
                  <h3 className="text-body font-semibold text-content sm:pt-2">{nome}</h3>

                  <div className="flex min-w-0 flex-col gap-2">
                    {doDia.length === 0 && (
                      <p className="text-body text-content-muted sm:pt-2">Fechado</p>
                    )}

                    {doDia.map(({ campo, indice }, posicao) => {
                      const rotulo = `${nome}, ${String(posicao + 1)}º horário`
                      const erro = erros?.[indice]?.opensAt?.message
                      const idDoErro = `${idDosErros}-${String(indice)}`
                      const digitado = digitados[indice]

                      return (
                        <div key={campo.id} role="group" aria-label={rotulo}>
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              aria-label={`${rotulo}, abre às`}
                              aria-invalid={erro ? true : undefined}
                              aria-describedby={erro ? idDoErro : undefined}
                              className={campoDeHora(Boolean(erro))}
                              {...register(campoDoIntervalo(indice, 'opensAt'), {
                                onChange: reconferirGrade,
                              })}
                            />
                            <span className="text-body text-content-muted">às</span>
                            <input
                              type="time"
                              aria-label={`${rotulo}, fecha às`}
                              aria-invalid={erro ? true : undefined}
                              aria-describedby={erro ? idDoErro : undefined}
                              className={campoDeHora(Boolean(erro))}
                              {...register(campoDoIntervalo(indice, 'closesAt'), {
                                onChange: reconferirGrade,
                              })}
                            />
                            {podeEditar && (
                              <button
                                type="button"
                                aria-label={`Remover: ${rotulo}`}
                                onClick={() => {
                                  remove(indice)
                                  reconferirGrade()
                                }}
                                className="rounded-control p-2 text-content-muted hover:bg-danger/10 hover:text-danger"
                              >
                                <IconeRemover />
                              </button>
                            )}
                          </div>
                          {erro ? (
                            <p id={idDoErro} className="text-caption mt-1 text-danger">
                              {erro}
                            </p>
                          ) : (
                            digitado &&
                            fechaNoDiaSeguinte(digitado) && (
                              <p className="text-caption mt-1 text-content-muted">
                                Fecha no dia seguinte.
                              </p>
                            )
                          )}
                        </div>
                      )
                    })}

                    {podeEditar && (
                      <div className="-ml-2 flex flex-wrap gap-x-2">
                        <button
                          type="button"
                          aria-label={`Adicionar horário: ${nome}`}
                          onClick={() => {
                            append({ dayOfWeek: dia, opensAt: '', closesAt: '' })
                          }}
                          className={botaoDeTexto}
                        >
                          Adicionar horário
                        </button>
                        {doDia.length > 0 && (
                          <button
                            type="button"
                            aria-label={`Repetir nos outros dias: ${nome}`}
                            onClick={() => {
                              replace(repetirNosOutrosDias(getValues('intervalos'), dia))
                              reconferirGrade()
                            }}
                            className={botaoDeTexto}
                          >
                            Repetir nos outros dias
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          {(erros?.root?.message ?? erros?.message) && (
            <p role="alert" className="text-caption text-danger">
              {erros?.root?.message ?? erros?.message}
            </p>
          )}
        </Secao>
      </fieldset>

      {podeEditar && (
        <RodapeDeSalvar envio={salvar} alterado={formState.isDirty} sucesso="Horários salvos." />
      )}
    </form>
  )
}
