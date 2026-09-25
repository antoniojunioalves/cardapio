import { colors } from './colors'
import { radius } from './radius'
import { shadows } from './shadows'
import { spacing } from './spacing'
import { typography } from './typography'

/** Todos os tokens de design num objeto só, para quem precisa navegar o conjunto. */
export const tokens = {
  colors,
  typography,
  spacing,
  radius,
  shadows,
} as const

export type Tokens = typeof tokens
