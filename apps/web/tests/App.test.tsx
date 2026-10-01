import { app as product } from '@repo/config'
import { VERSAO_DOS_TERMOS } from '@repo/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { App, AppRoutes } from '../src/App'
import { useSessaoStore } from '../src/features/admin/session'
import { abrir, mockarRotas } from './helpers/pagina'

beforeEach(() => {
  localStorage.clear()
  useSessaoStore.setState({ slug: null, usuario: null, accessToken: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('página inicial', () => {
  it('apresenta o produto, com o nome vindo de @repo/config', () => {
    render(<App />)

    expect(screen.getByRole('link', { name: product.name })).toHaveAttribute('href', '/')
    expect(
      screen.getByRole('heading', { level: 1, name: /Seu cardápio digital/ }),
    ).toBeInTheDocument()
    expect(screen.getByText(product.description)).toBeVisible()
  })

  it('leva ao cadastro e ao painel', () => {
    abrir('/')

    expect(screen.getByRole('link', { name: 'Começar grátis' })).toHaveAttribute(
      'href',
      '/cadastro',
    )
    expect(screen.getByRole('link', { name: 'Já tenho conta' })).toHaveAttribute('href', '/entrar')
    expect(screen.getByRole('link', { name: 'Termos de uso' })).toHaveAttribute('href', '/termos')
    expect(screen.getByRole('link', { name: 'Política de privacidade' })).toHaveAttribute(
      'href',
      '/privacidade',
    )
  })

  it('não consulta a API: a página inicial não depende dela', () => {
    const fetch = mockarRotas(() => ({ status: 500, corpo: {} }))
    abrir('/')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('termos e privacidade', () => {
  it.each([
    ['/termos', 'Termos de uso'],
    ['/privacidade', 'Política de privacidade'],
  ])('%s mostra o texto, a versão em vigor e o aviso de provisório', (caminho, titulo) => {
    abrir(caminho)

    expect(screen.getByRole('heading', { level: 1, name: titulo })).toBeInTheDocument()
    const [ano] = VERSAO_DOS_TERMOS.split('-')
    expect(screen.getByText(new RegExp(`Versão de .*${ano ?? ''}`))).toBeVisible()
    expect(screen.getByRole('note')).toHaveTextContent('Texto provisório')
  })

  it('a privacidade conta o que o checkout mostra a quem digita um telefone conhecido', () => {
    abrir('/privacidade')
    expect(screen.getByText(/mostra o primeiro nome e os endereços salvos/)).toBeVisible()
  })

  it('as páginas do produto ganham da rota do cardápio, que tem o mesmo formato', () => {
    const fetch = mockarRotas(() => ({ status: 200, corpo: {} }))
    abrir('/termos')
    // Se `/termos` caísse em `/:tenantSlug`, o cardápio "termos" seria buscado.
    expect(fetch).not.toHaveBeenCalled()
  })
})

function OndeEstou() {
  return <output data-testid="local">{useLocation().pathname}</output>
}

/** A aplicação inteira em `/entrar`, com um marcador que mostra para onde a navegação foi. */
function abrirEntrar() {
  // O login do estabelecimento busca o nome dele no cardápio público.
  mockarRotas(() => ({ status: 404, corpo: { error: { code: 'NOT_FOUND' } } }))
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/entrar']}>
        <AppRoutes />
        <OndeEstou />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('entrar pela página inicial', () => {
  it('pergunta o endereço e leva ao login daquele estabelecimento', () => {
    abrirEntrar()

    fireEvent.change(screen.getByLabelText('Endereço do cardápio'), {
      target: { value: 'http://localhost:5173/lanchonete-do-ze/admin' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(screen.getByTestId('local')).toHaveTextContent('/lanchonete-do-ze/admin')
  })

  it('endereço impossível diz como é o formato, sem sair da página', () => {
    abrirEntrar()

    fireEvent.change(screen.getByLabelText('Endereço do cardápio'), {
      target: { value: 'lanchonete do zé' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(screen.getByText(/como lanchonete-do-ze/)).toBeVisible()
    expect(screen.getByTestId('local')).toHaveTextContent('/entrar')
  })

  it('quem já entrou neste aparelho encontra o endereço preenchido', () => {
    useSessaoStore.setState({ slug: 'pizzaria-da-esquina' })
    abrirEntrar()
    expect(screen.getByLabelText('Endereço do cardápio')).toHaveValue('pizzaria-da-esquina')
  })
})
