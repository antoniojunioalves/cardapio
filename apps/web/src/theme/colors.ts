/**
 * Referências tipadas para os tokens de cor definidos em `tokens.css`.
 *
 * Nenhum valor hexadecimal aparece aqui: cada entrada é um `var(--…)`, de modo
 * que o CSS continua sendo a única fonte dos valores e os dois lados não podem
 * divergir. Use estas constantes quando a cor precisar ir para JavaScript
 * (estilo inline, canvas, biblioteca de gráfico). No JSX comum, prefira as
 * classes do Tailwind: `bg-primary`, `text-content-muted`.
 */

const scale = <Name extends string>(name: Name) =>
  ({
    50: `var(--color-${name}-50)`,
    100: `var(--color-${name}-100)`,
    200: `var(--color-${name}-200)`,
    300: `var(--color-${name}-300)`,
    400: `var(--color-${name}-400)`,
    500: `var(--color-${name}-500)`,
    600: `var(--color-${name}-600)`,
    700: `var(--color-${name}-700)`,
    800: `var(--color-${name}-800)`,
    900: `var(--color-${name}-900)`,
    950: `var(--color-${name}-950)`,
  }) as const

export const colors = {
  brand: scale('brand'),
  accent: scale('accent'),
  neutral: scale('neutral'),

  status: {
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    danger: 'var(--color-danger)',
    info: 'var(--color-info)',
  },

  /** Camada semântica — é esta que os componentes devem consumir. */
  surface: {
    base: 'var(--color-surface)',
    muted: 'var(--color-surface-muted)',
    inverted: 'var(--color-surface-inverted)',
  },
  border: {
    base: 'var(--color-border)',
    strong: 'var(--color-border-strong)',
  },
  content: {
    base: 'var(--color-content)',
    muted: 'var(--color-content-muted)',
    inverted: 'var(--color-content-inverted)',
  },
  primary: {
    base: 'var(--color-primary)',
    hover: 'var(--color-primary-hover)',
    content: 'var(--color-primary-content)',
  },
} as const

export type Colors = typeof colors
