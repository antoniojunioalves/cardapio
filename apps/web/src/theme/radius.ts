/**
 * Raios de borda por papel do elemento. Um tenant com identidade mais suave
 * aumenta `card`; um com identidade mais dura zera os três.
 */
export const radius = {
  control: 'var(--radius-control)',
  card: 'var(--radius-card)',
  pill: 'var(--radius-pill)',
} as const

export type Radius = typeof radius
