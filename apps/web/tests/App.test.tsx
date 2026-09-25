import { app as product } from '@repo/config'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from '../src/App'
import type { HealthResponse } from '../src/services/api'

const RESPOSTA_SAUDAVEL: HealthResponse = {
  status: 'ok',
  name: product.name,
  environment: 'test',
  uptimeSeconds: 42,
  timestamp: '2026-01-01T00:00:00.000Z',
}

function mockarFetch(resultado: 'ok' | 'falha') {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      resultado === 'ok'
        ? Promise.resolve({ ok: true, json: () => Promise.resolve(RESPOSTA_SAUDAVEL) })
        : Promise.reject(new Error('conexão recusada')),
    ),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('style')
})

describe('App', () => {
  it('exibe a identidade do produto vinda de @repo/config', async () => {
    mockarFetch('ok')
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: product.name })).toBeInTheDocument()
    // Espera a sonda resolver para que a atualização de estado não escape do teste.
    await screen.findByText('ok')
  })

  it('mostra o estado da API quando a sonda responde', async () => {
    mockarFetch('ok')
    render(<App />)

    expect(await screen.findByText('ok')).toBeInTheDocument()
    expect(screen.getByText('42s')).toBeInTheDocument()
  })

  it('explica o que fazer quando a API está fora do ar', async () => {
    mockarFetch('falha')
    render(<App />)

    expect(await screen.findByText('API indisponível')).toBeInTheDocument()
    expect(screen.getByText('conexão recusada')).toBeInTheDocument()
  })
})

describe('tema por tenant', () => {
  it('sobrescreve as custom properties em runtime e volta atrás', async () => {
    mockarFetch('ok')
    render(<App />)
    await screen.findByText('ok')

    const raiz = document.documentElement
    const botao = screen.getByRole('button', { name: 'Aplicar tema de exemplo' })

    expect(raiz.style.getPropertyValue('--color-primary')).toBe('')

    fireEvent.click(botao)
    expect(raiz.style.getPropertyValue('--color-primary')).toBe('#c2410c')
    expect(raiz.style.getPropertyValue('--radius-card')).toBe('1.5rem')

    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao tema do produto' }))
    expect(raiz.style.getPropertyValue('--color-primary')).toBe('')
  })
})
