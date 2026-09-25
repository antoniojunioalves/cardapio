/**
 * Tokens de tipografia. Os tamanhos são semânticos em vez de numéricos
 * (`heading` em vez de `xl`) para que ajustar a escala de um tenant não
 * exija reescrever componente nenhum.
 */
export const typography = {
  family: {
    sans: 'var(--font-sans)',
    mono: 'var(--font-mono)',
  },
  /** Classes utilitárias correspondentes, geradas pelo Tailwind a partir dos tokens. */
  size: {
    display: 'text-display',
    heading: 'text-heading',
    body: 'text-body',
    caption: 'text-caption',
  },
} as const

export type Typography = typeof typography
