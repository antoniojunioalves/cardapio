import { useEffect, useState } from 'react'

import { idDaSecao } from '../presentation'
import type { CategoriaPublica } from '../types'

/**
 * Faixa horizontal de categorias, fixa no topo ao rolar.
 *
 * Tocar numa categoria rola até a seção dela. A categoria em destaque
 * acompanha a rolagem por `IntersectionObserver`, quando o navegador tem — sem
 * ele, o destaque só muda com o toque, e a navegação continua funcionando.
 */
export function CategoryNav({ categorias }: { categorias: readonly CategoriaPublica[] }) {
  const [ativa, setAtiva] = useState<string | null>(categorias[0]?.id ?? null)

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return

    const observer = new IntersectionObserver(
      (entradas) => {
        const visivel = entradas.find((e) => e.isIntersecting)
        if (visivel) setAtiva(visivel.target.id.replace('categoria-', ''))
      },
      // Considera "ativa" a seção que ocupa a faixa logo abaixo da barra fixa.
      { rootMargin: '-80px 0px -70% 0px' },
    )

    for (const categoria of categorias) {
      const secao = document.getElementById(idDaSecao(categoria.id))
      if (secao) observer.observe(secao)
    }

    return () => {
      observer.disconnect()
    }
  }, [categorias])

  if (categorias.length === 0) return null

  return (
    <nav
      aria-label="Categorias"
      className="sticky top-0 z-10 mt-stack border-b border-border bg-surface-muted/95 backdrop-blur"
    >
      <ul className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-page-x py-2 [scrollbar-width:none]">
        {categorias.map((categoria) => {
          const selecionada = categoria.id === ativa
          return (
            <li key={categoria.id} className="shrink-0">
              <button
                type="button"
                aria-current={selecionada ? 'true' : undefined}
                onClick={() => {
                  setAtiva(categoria.id)
                  document
                    .getElementById(idDaSecao(categoria.id))
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className={`text-caption rounded-pill px-4 py-2 font-semibold whitespace-nowrap transition-colors ${
                  selecionada
                    ? 'bg-primary text-primary-content'
                    : 'bg-surface text-content shadow-card hover:bg-neutral-100'
                }`}
              >
                {categoria.name}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
