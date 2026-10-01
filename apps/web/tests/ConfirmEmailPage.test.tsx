import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '../src/App'
import { mockarRotas, type Resposta } from './helpers/pagina'

const TOKEN = '00000000-0000-7000-8000-000000000010.segredo-de-256-bits'

function OndeEstou() {
  const local = useLocation()
  return <output data-testid="local">{`${local.pathname}${local.hash}`}</output>
}

function abrirLink(caminho: string, resposta: Resposta) {
  const fetch = mockarRotas((url, metodo) =>
    url.endsWith('/signup/confirm-email') && metodo === 'POST'
      ? resposta
      : { status: 404, corpo: {} },
  )
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[caminho]}>
        <AppRoutes />
        <OndeEstou />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('confirmação do e-mail pelo link', () => {
  it('manda o token do fragmento no corpo, e o cardápio está no ar', async () => {
    const fetch = abrirLink(`/confirmar-email#token=${TOKEN}`, {
      status: 200,
      corpo: { status: 'CONFIRMED', slug: 'lanchonete-da-maria' },
    })

    expect(await screen.findByRole('heading', { name: 'E-mail confirmado!' })).toBeVisible()
    // O painel passa pelo login, que é um só: quem já entrou vai direto.
    expect(screen.getByRole('link', { name: 'Ir para o painel' })).toHaveAttribute(
      'href',
      '/entrar',
    )
    expect(screen.getByRole('link', { name: 'Ver o cardápio' })).toHaveAttribute(
      'href',
      '/lanchonete-da-maria',
    )

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] ?? []
    // O token vai no corpo, nunca na URL — URL acaba em log.
    expect(url).not.toContain('segredo')
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toEqual({ token: TOKEN })
  })

  it('tira o token do endereço depois de lê-lo', async () => {
    abrirLink(`/confirmar-email#token=${TOKEN}`, {
      status: 200,
      corpo: { status: 'CONFIRMED', slug: 'lanchonete-da-maria' },
    })

    await screen.findByRole('heading', { name: 'E-mail confirmado!' })
    expect(screen.getByTestId('local')).toHaveTextContent(/^\/confirmar-email$/)
  })

  it('link já usado diz que já estava confirmado — não é erro', async () => {
    abrirLink(`/confirmar-email#token=${TOKEN}`, {
      status: 200,
      corpo: { status: 'ALREADY_CONFIRMED', slug: 'lanchonete-da-maria' },
    })

    expect(
      await screen.findByRole('heading', { name: 'Este e-mail já estava confirmado' }),
    ).toBeVisible()
  })

  it('link vencido explica e aponta o reenvio no painel', async () => {
    abrirLink(`/confirmar-email#token=${TOKEN}`, {
      status: 400,
      corpo: {
        error: {
          code: 'CONFIRMATION_EXPIRED',
          message: 'Este link de confirmação expirou. Peça outro no painel.',
        },
      },
    })

    expect(await screen.findByRole('heading', { name: 'Este link não vale mais' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('expirou')
    expect(screen.getByRole('link', { name: 'Entrar no painel' })).toHaveAttribute(
      'href',
      '/entrar',
    )
  })

  it('servidor fora do ar oferece tentar de novo', async () => {
    abrirLink(`/confirmar-email#token=${TOKEN}`, 'falha-de-rede')

    expect(
      await screen.findByRole('heading', { name: 'Não deu para confirmar agora' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeEnabled()
  })

  it('link sem token não chama a API', () => {
    const fetch = abrirLink('/confirmar-email', { status: 200, corpo: {} })

    expect(screen.getByRole('heading', { name: 'Link incompleto' })).toBeVisible()
    expect(fetch).not.toHaveBeenCalled()
  })
})
