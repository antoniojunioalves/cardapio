import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, type RenderResult } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'

import { AppRoutes } from '../../src/App'
import type { CardapioPublico } from '../../src/features/menu/types'
import { cardapioDoZe } from './cardapio'

export type Resposta = { status: number; corpo: unknown } | 'falha-de-rede'

export function mockarApi(resposta: Resposta) {
  const fetch = vi.fn(() =>
    resposta === 'falha-de-rede'
      ? Promise.reject(new Error('conexão recusada'))
      : Promise.resolve({
          ok: resposta.status < 400,
          status: resposta.status,
          json: () => Promise.resolve(resposta.corpo),
        }),
  )
  vi.stubGlobal('fetch', fetch)
  return fetch
}

/**
 * Simula a API respondendo por rota: o cardápio no GET e a identificação do
 * cliente no POST. Devolve o mock, para conferir o que foi enviado.
 */
export function mockarApiDoCheckout(
  cardapio: CardapioPublico,
  identificacao: Resposta = { status: 200, corpo: { cliente: null } },
) {
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const resposta: Resposta =
      init?.method === 'POST' && url.endsWith('/customers/identify')
        ? identificacao
        : { status: 200, corpo: cardapio }
    if (resposta === 'falha-de-rede') return Promise.reject(new Error('conexão recusada'))
    return Promise.resolve({
      ok: resposta.status < 400,
      status: resposta.status,
      json: () => Promise.resolve(resposta.corpo),
    })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

export function abrir(caminho: string): RenderResult {
  // Sem espera entre tentativas: o teste de falha de rede passaria segundos
  // aguardando o backoff padrão.
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[caminho]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Abre a página do cardápio e espera ele carregar. `sufixo` vai depois do slug: `?produto=…`. */
export async function abrirCardapio(
  cardapio: CardapioPublico = cardapioDoZe(),
  sufixo = '',
): Promise<{ fetch: ReturnType<typeof mockarApi>; pagina: RenderResult }> {
  const fetch = mockarApi({ status: 200, corpo: cardapio })
  const pagina = abrir(`/${cardapio.establishment.slug}${sufixo}`)
  await screen.findByRole('heading', { level: 1, name: cardapio.establishment.name })
  return { fetch, pagina }
}
