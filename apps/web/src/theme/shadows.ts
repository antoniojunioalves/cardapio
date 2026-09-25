/**
 * Elevação por papel: `card` para cartões em repouso, `raised` para o estado
 * ativo ou em foco, `overlay` para o que flutua acima da página (drawer,
 * modal, carrinho fixo).
 */
export const shadows = {
  card: 'var(--shadow-card)',
  raised: 'var(--shadow-raised)',
  overlay: 'var(--shadow-overlay)',
} as const

export type Shadows = typeof shadows
