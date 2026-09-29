import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router'

import { resolverCarrinho, resumirCarrinho } from '@/features/cart/cart'
import { useCarrinho } from '@/features/cart/store'
import { CheckoutForm } from '@/features/checkout/components/CheckoutForm'
import { useCardapioPublico } from '@/features/menu/api'
import { ApiError } from '@/services/api'

import { NotFoundPage } from './NotFoundPage'
import type { EstadoDoPedidoEnviado } from './OrderSentPage'

/**
 * O checkout em `/{tenantSlug}/checkout`.
 *
 * Usa o mesmo cardápio do TanStack Query que a página do cardápio — vindo de
 * lá, já está em cache — para recalcular o carrinho e as condições de entrega.
 */
export function CheckoutPage() {
  const { tenantSlug = '' } = useParams()
  const consulta = useCardapioPublico(tenantSlug)
  const { itens, esvaziar } = useCarrinho(tenantSlug)
  const navigate = useNavigate()

  const nome = consulta.data?.establishment.name
  useEffect(() => {
    if (nome) document.title = `Finalizar pedido — ${nome}`
  }, [nome])

  if (consulta.isPending) {
    return (
      <div
        role="status"
        className="text-body flex min-h-dvh items-center justify-center text-content-muted"
      >
        Carregando…
      </div>
    )
  }

  if (consulta.isError) {
    if (consulta.error instanceof ApiError && consulta.error.status === 404) {
      return <NotFoundPage mensagem="Não encontramos este estabelecimento. Confira o endereço." />
    }
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-stack px-page-x text-center">
        <p className="text-heading">Não foi possível carregar o pedido</p>
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
  const linhas = resolverCarrinho(itens, cardapio)
  const resumo = resumirCarrinho(linhas, cardapio.establishment.minimumOrderInCents)

  return (
    <div className="min-h-dvh bg-surface-muted pb-section-y">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-2xl flex-col gap-1 px-page-x py-stack">
          <Link
            to={`/${tenantSlug}`}
            className="text-caption self-start font-semibold text-primary hover:underline"
          >
            ← Voltar ao cardápio
          </Link>
          <h1 className="text-heading text-content">Finalizar pedido</h1>
          <p className="text-caption text-content-muted">{cardapio.establishment.name}</p>
        </div>
      </header>

      <main className="mx-auto mt-section-y max-w-2xl px-page-x">
        {linhas.length === 0 ? (
          <div className="flex flex-col items-center gap-stack py-section-y text-center">
            <p className="text-body text-content-muted">Seu carrinho está vazio.</p>
            <Link
              to={`/${tenantSlug}`}
              className="rounded-control bg-primary px-4 py-2 font-semibold text-primary-content hover:bg-primary-hover"
            >
              Ver o cardápio
            </Link>
          </div>
        ) : (
          <CheckoutForm
            slug={tenantSlug}
            cardapio={cardapio}
            linhas={linhas}
            resumo={resumo}
            aoEnviado={(pedido) => {
              const estado: EstadoDoPedidoEnviado = {
                pedido,
                estabelecimento: cardapio.establishment.name,
                telefoneDeContato: cardapio.establishment.contactPhone,
              }
              // `replace`: o "voltar" não reabre um checkout já enviado.
              void navigate(`/${tenantSlug}/pedido-enviado`, { replace: true, state: estado })
              esvaziar()
            }}
          />
        )}
      </main>
    </div>
  )
}
