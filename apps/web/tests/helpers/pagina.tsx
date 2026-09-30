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

/** Um pedido como a API devolve ao criar: 2 açaís, retirada, Pix. */
export const PEDIDO_CRIADO = {
  number: 42,
  status: 'RECEIVED',
  fulfillment: 'PICKUP',
  items: [{ name: 'Açaí na tigela', quantity: 2, options: [], notes: null, totalInCents: 3600 }],
  subtotalInCents: 3600,
  deliveryFeeInCents: 0,
  totalInCents: 3600,
  paymentMethodName: 'Pix',
  changeForInCents: null,
  createdAt: '2026-09-29T15:00:00.000Z',
  whatsapp: {
    url: 'https://wa.me/5511999990000?text=*Pedido%20%2342*',
    message: '*Pedido #42*',
  },
}

/**
 * Simula a API respondendo por rota: o cardápio no GET, a identificação do
 * cliente e o envio do pedido nos POSTs. `envios` responde um por tentativa,
 * na ordem — o último se repete. Devolve o mock, para conferir o que foi
 * enviado.
 */
export function mockarApiDoCheckout(
  cardapio: CardapioPublico,
  identificacao: Resposta = { status: 200, corpo: { cliente: null } },
  envios: readonly Resposta[] = [{ status: 201, corpo: PEDIDO_CRIADO }],
) {
  let tentativa = 0
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    let resposta: Resposta = { status: 200, corpo: cardapio }
    if (init?.method === 'POST' && url.endsWith('/customers/identify')) resposta = identificacao
    if (init?.method === 'POST' && url.endsWith('/orders')) {
      resposta = envios[Math.min(tentativa, envios.length - 1)] ?? 'falha-de-rede'
      tentativa += 1
    }
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

/**
 * Simula a API por rota: `responder` recebe a URL, o método e o corpo enviado,
 * e devolve a resposta. Devolve o mock, para conferir o que foi chamado.
 */
export function mockarRotas(responder: (url: string, metodo: string, corpo: unknown) => Resposta) {
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET'
    const corpo: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const resposta = responder(url, metodo, corpo)
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

/** Uma conexão ao vivo que nunca abre, para os testes que terminam no painel de pedidos. */
export function pararConexaoAoVivo() {
  vi.stubGlobal(
    'WebSocket',
    class {
      addEventListener() {
        /* nunca abre */
      }
      send() {
        /* nada a enviar */
      }
      close() {
        /* nada a fechar */
      }
    },
  )
}
