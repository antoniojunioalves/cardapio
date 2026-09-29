import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'

import { useCardapioPublico } from '@/features/menu/api'
import { CategoryNav } from '@/features/menu/components/CategoryNav'
import { MenuHeader } from '@/features/menu/components/MenuHeader'
import { MenuInfo } from '@/features/menu/components/MenuInfo'
import { ProductCard } from '@/features/menu/components/ProductCard'
import { filtrarCardapio, idDaSecao } from '@/features/menu/presentation'
import { ApiError } from '@/services/api'

import { NotFoundPage } from './NotFoundPage'

/** O cardápio público em `/{tenantSlug}`. */
export function MenuPage() {
  const { tenantSlug = '' } = useParams()
  const consulta = useCardapioPublico(tenantSlug)
  const [busca, setBusca] = useState('')

  const nome = consulta.data?.establishment.name
  useEffect(() => {
    if (nome) document.title = `${nome} — Cardápio`
  }, [nome])

  const categorias = useMemo(
    () => filtrarCardapio(consulta.data?.categories ?? [], busca),
    [consulta.data, busca],
  )

  if (consulta.isPending) {
    return (
      <div
        role="status"
        className="text-body flex min-h-dvh items-center justify-center text-content-muted"
      >
        Carregando o cardápio…
      </div>
    )
  }

  if (consulta.isError) {
    if (consulta.error instanceof ApiError && consulta.error.status === 404) {
      return <NotFoundPage mensagem="Não encontramos este estabelecimento. Confira o endereço." />
    }

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-stack px-page-x text-center">
        <p className="text-heading">Não foi possível carregar o cardápio</p>
        <p className="text-body text-content-muted">Verifique a sua conexão e tente de novo.</p>
        <button
          type="button"
          onClick={() => void consulta.refetch()}
          className="rounded-control bg-primary px-4 py-2 font-semibold text-primary-content hover:bg-primary-hover"
        >
          Tentar de novo
        </button>
      </div>
    )
  }

  const cardapio = consulta.data
  const vazio = cardapio.categories.length === 0

  return (
    <div className="min-h-dvh pb-section-y">
      <MenuHeader cardapio={cardapio} />

      <div className="mx-auto mt-stack max-w-3xl px-page-x">
        <label htmlFor="busca" className="sr-only">
          Buscar no cardápio
        </label>
        <input
          id="busca"
          type="search"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value)
          }}
          placeholder="Buscar no cardápio"
          className="text-body w-full rounded-control border border-border bg-surface px-4 py-3 shadow-card"
        />
      </div>

      <div className="mt-stack">
        <CategoryNav categorias={categorias} />
      </div>

      <main className="mx-auto mt-stack flex max-w-3xl flex-col gap-section-y px-page-x">
        {vazio && (
          <p className="text-body text-center text-content-muted">
            O cardápio ainda está sendo preparado. Volte em breve.
          </p>
        )}

        {!vazio && categorias.length === 0 && (
          <p className="text-body text-center text-content-muted">
            Nenhum produto encontrado para “{busca.trim()}”.
          </p>
        )}

        {categorias.map((categoria) => (
          <section
            key={categoria.id}
            id={idDaSecao(categoria.id)}
            aria-labelledby={`titulo-${categoria.id}`}
            className="scroll-mt-16"
          >
            <h2 id={`titulo-${categoria.id}`} className="text-heading text-content">
              {categoria.name}
            </h2>
            {categoria.description && (
              <p className="text-caption text-content-muted">{categoria.description}</p>
            )}
            <div className="mt-stack flex flex-col gap-stack">
              {categoria.products.map((produto) => (
                <ProductCard key={produto.id} produto={produto} />
              ))}
            </div>
          </section>
        ))}

        <MenuInfo cardapio={cardapio} />
      </main>
    </div>
  )
}
