import { app as product } from '@repo/config'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'

describe('sondas de saúde', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /health responde ok com a identidade do produto', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      status: 'ok',
      name: product.name,
      environment: 'test',
    })
  })

  it('GET /ready responde pronto', async () => {
    const response = await app.inject({ method: 'GET', url: '/ready' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ status: 'ready', checks: {} })
  })
})

describe('tratamento de erros', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('rota inexistente devolve 404 no formato padrão de erro', async () => {
    const response = await app.inject({ method: 'GET', url: '/nao-existe' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({
      error: { code: 'NOT_FOUND' },
    })
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
