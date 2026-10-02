import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'

import {
  campoDaForma,
  formularioSchema,
  paraFormulario,
  useSalvarFormasDePagamento,
  type FormaDePagamento,
  type ValoresDoFormulario,
} from '../payment'
import {
  AvisoDeAtencao,
  AvisoDeSomenteLeitura,
  Marcavel,
  RodapeDeSalvar,
  Secao,
} from './form-parts'

interface PaymentFormProps {
  slug: string
  formas: readonly FormaDePagamento[]
  /** Sem `settings:update`, a pessoa vê tudo e não altera nada. */
  podeEditar: boolean
}

/**
 * As formas de pagamento que o estabelecimento aceita. A lista é o catálogo da
 * plataforma; aqui só se liga e desliga cada uma.
 */
export function PaymentForm({ slug, formas, podeEditar }: PaymentFormProps) {
  const salvar = useSalvarFormasDePagamento(slug)
  const { register, control, formState, handleSubmit, reset } = useForm<ValoresDoFormulario>({
    resolver: zodResolver(formularioSchema),
    defaultValues: paraFormulario(formas),
  })
  const escolhidas = useWatch({ control, name: 'formas' })

  function aoEnviar(dados: ValoresDoFormulario) {
    salvar.mutate(dados, {
      onSuccess: (salvas) => {
        reset(paraFormulario(salvas))
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
        <Secao titulo="Formas de pagamento">
          <p className="text-caption text-content-muted">
            O cliente escolhe uma delas ao fechar o pedido, e paga ao receber.
          </p>

          {formas.map((forma, indice) => (
            <Marcavel
              key={forma.id}
              type="checkbox"
              titulo={forma.name}
              {...register(campoDaForma(indice))}
            />
          ))}

          {!escolhidas.some((forma) => forma.isEnabled) && (
            <AvisoDeAtencao>
              Sem nenhuma forma de pagamento, o cardápio não recebe pedidos. Marque ao menos uma.
            </AvisoDeAtencao>
          )}
        </Secao>
      </fieldset>

      {podeEditar && (
        <RodapeDeSalvar
          envio={salvar}
          alterado={formState.isDirty}
          sucesso="Formas de pagamento salvas."
        />
      )}
    </form>
  )
}
