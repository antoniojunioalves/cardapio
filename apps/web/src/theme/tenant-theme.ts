/**
 * Tema por tenant.
 *
 * Só a camada SEMÂNTICA é sobrescrevível — de propósito. Deixar um tenant
 * redefinir a paleta bruta inteira abriria espaço para combinações ilegíveis;
 * limitar aos papéis (primária, superfície, conteúdo) mantém o contraste sob
 * controle e ainda dá identidade visual própria a cada estabelecimento.
 *
 * Não há editor de temas nesta fase — apenas a arquitetura que torna um
 * possível no futuro sem tocar em componente nenhum.
 */

/** Papéis que um tenant pode redefinir, mapeados para a custom property correspondente. */
const OVERRIDABLE = {
  primary: '--color-primary',
  primaryHover: '--color-primary-hover',
  primaryContent: '--color-primary-content',
  surface: '--color-surface',
  surfaceMuted: '--color-surface-muted',
  content: '--color-content',
  contentMuted: '--color-content-muted',
  border: '--color-border',
  radiusControl: '--radius-control',
  radiusCard: '--radius-card',
} as const

export type TenantThemeToken = keyof typeof OVERRIDABLE

/** Tema de um tenant: um subconjunto dos papéis acima. */
export type TenantTheme = Partial<Record<TenantThemeToken, string>>

/**
 * Aplica o tema do tenant escrevendo custom properties no elemento alvo.
 * Por padrão escreve em `:root`, o que afeta a página inteira.
 */
export function applyTenantTheme(
  theme: TenantTheme,
  target: HTMLElement = document.documentElement,
): void {
  for (const [token, cssVariable] of Object.entries(OVERRIDABLE)) {
    const value = theme[token as TenantThemeToken]
    if (value !== undefined) {
      target.style.setProperty(cssVariable, value)
    }
  }
}

/** Remove qualquer sobrescrita e devolve a página ao tema padrão do produto. */
export function resetTenantTheme(target: HTMLElement = document.documentElement): void {
  for (const cssVariable of Object.values(OVERRIDABLE)) {
    target.style.removeProperty(cssVariable)
  }
}
