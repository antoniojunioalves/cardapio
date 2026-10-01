import { app as product } from '@repo/config'
import { VERSAO_DOS_TERMOS } from '@repo/shared'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '../src/App'
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

describe('endereços do painel', () => {
  it('/{endereço}/admin é o painel: sem sessão, leva ao login, que é um só', () => {
    const fetch = mockarRotas(() => ({ status: 200, corpo: {} }))
    abrir('/lanchonete-do-ze/admin')

    expect(screen.getByRole('heading', { level: 1, name: 'Entrar no painel' })).toBeVisible()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('/entrar pede só e-mail e senha', () => {
    abrir('/entrar')

    expect(screen.getByRole('heading', { level: 1, name: 'Entrar no painel' })).toBeVisible()
    expect(screen.getByLabelText('E-mail')).toBeVisible()
    expect(screen.getByLabelText('Senha')).toBeVisible()
    expect(screen.queryByLabelText('Endereço do cardápio')).not.toBeInTheDocument()
  })
})
