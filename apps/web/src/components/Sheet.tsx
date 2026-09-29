import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface SheetProps {
  titulo: string
  aoFechar: () => void
  children: ReactNode
  /** Fica fixo embaixo, fora da rolagem — onde vai o botão principal. */
  rodape?: ReactNode
}

/**
 * Janela sobre a página: gaveta que sobe de baixo no celular, caixa centrada
 * a partir de telas médias.
 *
 * Fecha com Esc, no fundo escurecido e no botão "Fechar". Enquanto aberta, o
 * foco fica preso dentro dela e a página de trás não rola; ao fechar, o foco
 * volta para onde estava.
 */
export function Sheet({ titulo, aoFechar, children, rodape }: SheetProps) {
  const idDoTitulo = useId()
  const painel = useRef<HTMLDivElement>(null)

  // A função muda a cada render de quem usa; o efeito não deve rodar de novo
  // por isso, só ao abrir e fechar.
  const fechar = useRef(aoFechar)
  useEffect(() => {
    fechar.current = aoFechar
  })

  useEffect(() => {
    const antes = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    painel.current?.focus()

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        fechar.current()
        return
      }
      if (evento.key !== 'Tab' || !painel.current) return

      const focaveis = [...painel.current.querySelectorAll<HTMLElement>(FOCAVEIS)]
      const primeiro = focaveis[0]
      const ultimo = focaveis.at(-1)
      if (!primeiro || !ultimo) return
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault()
        primeiro.focus()
      }
    }
    document.addEventListener('keydown', aoTeclar)

    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflow
      if (antes instanceof HTMLElement) antes.focus()
    }
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-page-x">
      <div
        aria-hidden="true"
        onClick={aoFechar}
        className="absolute inset-0 bg-surface-inverted/60"
      />

      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idDoTitulo}
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full flex-col rounded-t-card bg-surface shadow-overlay outline-none sm:max-w-lg sm:rounded-card"
      >
        <div className="flex items-start justify-between gap-stack border-b border-border p-card">
          <h2 id={idDoTitulo} className="text-heading text-content">
            {titulo}
          </h2>
          <button
            type="button"
            onClick={aoFechar}
            className="text-body -m-2 rounded-control p-2 text-content-muted hover:text-content"
          >
            Fechar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-card">{children}</div>

        {rodape && <div className="border-t border-border p-card">{rodape}</div>}
      </div>
    </div>,
    document.body,
  )
}
