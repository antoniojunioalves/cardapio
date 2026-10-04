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

export function IconeConfiguracoes(props: IconeProps) {
  return (
    <Icone {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
    </Icone>
  )
}

export function IconeCardapio(props: IconeProps) {
  return (
    <Icone {...props}>
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M5 17a3 3 0 0 1 3-3h11M9 8h6" />
    </Icone>
  )
}

export function IconeSubir(props: IconeProps) {
  return (
    <Icone {...props}>
      <path d="m6 15 6-6 6 6" />
    </Icone>
  )
}

export function IconeDescer(props: IconeProps) {
  return (
    <Icone {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icone>
  )
}

export function IconeVoltar(props: IconeProps) {
  return (
    <Icone {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Icone>
  )
}

export function IconeMais(props: IconeProps) {
  return (
    <Icone {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icone>
  )
}

export function IconeEditar(props: IconeProps) {
  return (
    <Icone {...props}>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </Icone>
  )
}

export function IconeLixeira(props: IconeProps) {
  return (
    <Icone {...props}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Icone>
  )
}

export function IconeRemover(props: IconeProps) {
  return (
    <Icone {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icone>
  )
}

export function IconeFeito(props: IconeProps) {
  return (
    <Icone {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
    </Icone>
  )
}

export function IconePendente(props: IconeProps) {
  return (
    <Icone {...props}>
      <circle cx="12" cy="12" r="9" />
    </Icone>
  )
}
