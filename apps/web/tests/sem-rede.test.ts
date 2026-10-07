import { afterEach, describe, expect, it, vi } from 'vitest'

import { comSessao, useSessaoStore } from '../src/features/admin/session'
import { DONO } from './helpers/cardapio-admin'
import { mockarApi } from './helpers/pagina'
import { SEM_REDE } from './setup'

afterEach(() => {
  vi.unstubAllGlobals()
  useSessaoStore.getState().encerrar()
})

describe('os testes não usam a rede', () => {
  it('sem API simulada, uma chamada é recusada aqui mesmo', async () => {
    await expect(fetch('http://localhost:3333/health')).rejects.toThrow(SEM_REDE)
  })

  it('tirar a API simulada de um teste devolve a recusa, e não a rede de verdade', async () => {
    mockarApi({ status: 200, corpo: {} })
    await expect(fetch('http://localhost:3333/health')).resolves.toMatchObject({ status: 200 })

    vi.unstubAllGlobals()

    await expect(fetch('http://localhost:3333/health')).rejects.toThrow(SEM_REDE)
  })

  it('uma chamada atrasada do painel não chega a pedir a renovação da sessão', async () => {
    const chamadas: string[] = []
    const recusa = globalThis.fetch
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      chamadas.push(`${init?.method ?? 'GET'} ${url.replace(/^https?:\/\/[^/]+/, '')}`)
      return recusa(url, init)
    })
    useSessaoStore.getState().guardar(DONO)

    await expect(comSessao('/api/v1/admin/plan')).rejects.toThrow()

    // Com a API de verdade respondendo 401, viria em seguida um POST /auth/refresh.
    expect(chamadas).toEqual(['GET /api/v1/admin/plan'])
  })
})
