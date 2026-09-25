/**
 * Ritmo de layout. São tokens semânticos, não uma escala numérica — a escala
 * numérica do Tailwind (`p-4`, `gap-2`) continua disponível para ajuste fino
 * dentro de um componente.
 *
 * `pageX` é responsivo: muda sozinho a partir de 48rem, definido em tokens.css.
 */
export const spacing = {
  pageX: 'var(--spacing-page-x)',
  sectionY: 'var(--spacing-section-y)',
  card: 'var(--spacing-card)',
  stack: 'var(--spacing-stack)',
} as const

export type Spacing = typeof spacing
