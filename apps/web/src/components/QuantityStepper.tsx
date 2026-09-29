interface QuantityStepperProps {
  valor: number
  aoMudar: (valor: number) => void
  maximo: number
  /** O que está sendo contado, para os rótulos dos botões: "X-Salada". */
  rotulo: string
  /** Deixa o "−" descer a zero — no carrinho, é como se remove a linha. */
  permitirZero?: boolean
}

/** Botões de menos e mais em volta de um número. */
export function QuantityStepper({
  valor,
  aoMudar,
  maximo,
  rotulo,
  permitirZero = false,
}: QuantityStepperProps) {
  const minimo = permitirZero ? 0 : 1
  const botao =
    'flex size-9 items-center justify-center rounded-pill border border-border-strong text-heading text-content disabled:opacity-40'

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={permitirZero && valor === 1 ? `Remover ${rotulo}` : `Diminuir ${rotulo}`}
        disabled={valor <= minimo}
        onClick={() => {
          aoMudar(valor - 1)
        }}
        className={botao}
      >
        −
      </button>
      <span aria-live="polite" className="text-body w-6 text-center font-semibold text-content">
        {valor}
      </span>
      <button
        type="button"
        aria-label={`Aumentar ${rotulo}`}
        disabled={valor >= maximo}
        onClick={() => {
          aoMudar(valor + 1)
        }}
        className={botao}
      >
        +
      </button>
    </div>
  )
}
