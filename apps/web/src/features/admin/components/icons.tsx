import type { ReactNode } from 'react'

/** Os ícones do painel, em SVG no próprio código: são poucos, e não pedem uma biblioteca. */
function Icone({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0"
    >
      {children}
    </svg>
  )
}

export function IconeInicio() {
  return (
    <Icone>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </Icone>
  )
}

export function IconePedidos() {
  return (
    <Icone>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6" />
    </Icone>
  )
}

export function IconeMenu() {
  return (
    <Icone>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icone>
  )
}

export function IconeExterno() {
  return (
    <Icone>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M19 14v6H4V5h6" />
    </Icone>
  )
}

export function IconeSair() {
  return (
    <Icone>
      <path d="M10 4H5v16h5" />
      <path d="M15 8l4 4-4 4" />
      <path d="M19 12H9" />
    </Icone>
  )
}
