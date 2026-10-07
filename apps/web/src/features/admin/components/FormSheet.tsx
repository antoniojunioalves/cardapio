import { useState, type ReactNode } from 'react'

import { Sheet } from '@/components/Sheet'

import { botaoPrincipal, botaoSecundario, RodapeDeSalvar } from './form-parts'

interface FormSheetProps {
  titulo: string
  /** O `id` do formulário dentro da janela: é ele que o botão do rodapé envia. */
  formulario: string
  /** Fecha de vez, sem perguntar. */
  aoFechar: () => void
  /** Há algo digitado e não salvo: fechar pergunta antes. */
  alterado: boolean
  /** Criando, o botão fica ligado — clicar mostra o que falta; editando, só com alteração. */
  criando: boolean
  /** O estado do envio: é o que `useMutation` devolve. */
  envio: { isPending: boolean; isError: boolean; isSuccess: boolean; error: unknown }
  /** O texto do botão: "Criar grupo", "Salvar alterações". */
  rotulo: string
  explicarFalha?: ((erro: unknown) => string | null) | undefined
  children: ReactNode
}

/**
 * Uma janela com um formulário dentro — o grupo de opcionais, a categoria —,
 * sobre a página em que a pessoa estava. O botão de gravar fica preso embaixo,
 * fora da rolagem. Fechar com algo digitado — no "Fechar", no Esc ou num toque
 * fora da janela — pergunta antes: no celular, o fundo escurecido está a um
 * dedo de distância.
 */
export function FormSheet({
  titulo,
  formulario,
  aoFechar,
  alterado,
  criando,
  envio,
  rotulo,
  explicarFalha,
  children,
}: FormSheetProps) {
  const [saindo, setSaindo] = useState(false)

  return (
    <Sheet
      titulo={titulo}
      aoFechar={() => {
        if (alterado && !saindo) setSaindo(true)
        else aoFechar()
      }}
      rodape={
        saindo ? (
          <div className="flex flex-col gap-2">
            <p role="alert" className="text-body text-content">
              O que você digitou não foi salvo.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={() => {
                  setSaindo(false)
                }}
                className={botaoPrincipal}
              >
                Continuar editando
              </button>
              <button type="button" onClick={aoFechar} className={botaoSecundario}>
                Descartar
              </button>
            </div>
          </div>
        ) : (
          <RodapeDeSalvar
            formulario={formulario}
            envio={envio}
            alterado={criando || alterado}
            // A janela fecha ao gravar: não há o que dizer depois.
            sucesso=""
            rotulo={rotulo}
            explicarFalha={explicarFalha}
          />
        )
      }
    >
      {children}
    </Sheet>
  )
}
