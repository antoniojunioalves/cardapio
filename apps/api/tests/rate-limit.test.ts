import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import { closeDatabase } from '../src/db/index.js'

describe('limite de requisições', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await closeDatabase()
  })

  it('bloqueia com 429 depois do limite, no formato padrão de erro', async () => {
    // O contador é por instância e por IP, e esta aplicação é exclusiva do teste.
    for (let i = 0; i < env.RATE_LIMIT_MAX; i += 1) {
      const permitida = await app.inject({ method: 'GET', url: '/health' })
      expect(permitida.statusCode).toBe(200)
    }

    const bloqueada = await app.inject({ method: 'GET', url: '/health' })

    expect(bloqueada.statusCode).toBe(429)
    expect(bloqueada.json()).toMatchObject({
      error: { code: 'RATE_LIMIT_EXCEEDED' },
    })
    expect(bloqueada.json<{ error: { requestId: string } }>().error.requestId).toBeTruthy()
  })

  it('anuncia o limite nos cabeçalhos, para o cliente poder se regular', async () => {
    const outraApp = await buildApp()
    await outraApp.ready()

    const response = await outraApp.inject({ method: 'GET', url: '/health' })

    expect(response.headers['x-ratelimit-limit']).toBe(String(env.RATE_LIMIT_MAX))
    expect(response.headers['x-ratelimit-remaining']).toBeDefined()

    await outraApp.close()
  })
})
