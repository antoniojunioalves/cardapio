import { app as product } from '@repo/config'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { closeDatabase, type DatabaseCheck } from '../src/db/index.js'

describe('GET /health — liveness', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp({ rateLimit: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('responde ok com a identidade do produto', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      status: 'ok',
      name: product.name,
      environment: 'test',
    })
  })

  it('não depende do banco — responde mesmo com a verificação falhando', async () => {
    const comBancoFora = await buildApp({
      rateLimit: false,
      checkDatabase: () => Promise.reject(new Error('banco fora do ar')),
    })
    await comBancoFora.ready()

    const response = await comBancoFora.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)

    await comBancoFora.close()
  })
})

describe('GET /ready — readiness', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp({ rateLimit: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await closeDatabase()
  })

  it('responde 200 com o banco alcançável, reportando a latência', async () => {
    const response = await app.inject({ method: 'GET', url: '/ready' })

    expect(response.statusCode).toBe(200)

    const corpo = response.json<{
      status: string
      checks: { database: DatabaseCheck }
    }>()

    expect(corpo.status).toBe('ready')
    expect(corpo.checks.database.status).toBe('ok')
    expect(corpo.checks.database.latencyMs).toBeGreaterThanOrEqual(0)
  })
})

describe('GET /ready — banco indisponível', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp({
      rateLimit: false,
      checkDatabase: () =>
        Promise.resolve({
          status: 'error' as const,
          latencyMs: 12,
          message: 'conexão recusada',
        }),
    })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('responde 503 para sair do balanceador sem reiniciar o processo', async () => {
    const response = await app.inject({ method: 'GET', url: '/ready' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({
      status: 'unavailable',
      checks: { database: { status: 'error', message: 'conexão recusada' } },
    })
  })
})

describe('tratamento de erros', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp({ rateLimit: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('rota inexistente devolve 404 no formato padrão de erro', async () => {
    const response = await app.inject({ method: 'GET', url: '/nao-existe' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
    expect(response.json<{ error: { requestId: string } }>().error.requestId).toBeTruthy()
  })

  it('reaproveita o x-request-id recebido, para correlacionar log e resposta', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/nao-existe',
      headers: { 'x-request-id': 'id-vindo-do-proxy' },
    })

    expect(response.json<{ error: { requestId: string } }>().error.requestId).toBe(
      'id-vindo-do-proxy',
    )
  })
})
