import { app as product } from '@repo/config'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

/**
 * A moldura das páginas do produto — a inicial, o cadastro, o "entrar", a
 * confirmação de e-mail e os textos legais. O cardápio e o painel de cada
 * estabelecimento não usam: lá a identidade é a do estabelecimento.
 */
export function SiteLayout({
  children,
  acoes,
}: {
  children: ReactNode
  /** Links no canto do cabeçalho, como "Entrar". */
  acoes?: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-muted">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-stack px-page-x py-stack">
          <Link to="/" className="text-heading text-content">
            {product.name}
          </Link>
          {acoes}
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-border bg-surface">
        <div className="text-caption mx-auto flex max-w-4xl flex-wrap items-center gap-x-stack gap-y-1 px-page-x py-stack text-content-muted">
          <span>{product.name}</span>
          <Link to="/termos" className="hover:underline">
            Termos de uso
          </Link>
          <Link to="/privacidade" className="hover:underline">
            Política de privacidade
          </Link>
        </div>
      </footer>
    </div>
  )
}
