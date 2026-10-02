import type { ReactNode } from 'react'

/**
 * Os ícones da aplicação, em SVG no próprio código: são poucos, e não pedem uma
 * biblioteca. Todos decorativos (`aria-hidden`) — o texto ao lado é que diz o
 * que o botão ou o link faz.
 */

export interface IconeProps {
  /** O tamanho, como classe do Tailwind. Sem ele, 20 px. */
  className?: string
}

function Icone({ children, className = 'size-5' }: IconeProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} shrink-0`}
    >
      {children}
    </svg>
  )
}

export function IconeInicio(props: IconeProps) {
  return (
    <Icone {...props}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </Icone>
  )
}

export function IconePedidos(props: IconeProps) {
  return (
    <Icone {...props}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6" />
    </Icone>
  )
}

export function IconeMenu(props: IconeProps) {
  return (
    <Icone {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icone>
  )
}

export function IconeExterno(props: IconeProps) {
  return (
    <Icone {...props}>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M19 14v6H4V5h6" />
    </Icone>
  )
}

export function IconeSair(props: IconeProps) {
  return (
    <Icone {...props}>
      <path d="M10 4H5v16h5" />
      <path d="M15 8l4 4-4 4" />
      <path d="M19 12H9" />
    </Icone>
  )
}

export function IconeInfo(props: IconeProps) {
  return (
    <Icone {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.01" />
    </Icone>
  )
}

export function IconeHistorico(props: IconeProps) {
  return (
    <Icone {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icone>
  )
}

export function IconePerfil(props: IconeProps) {
  return (
    <Icone {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </Icone>
  )
}
