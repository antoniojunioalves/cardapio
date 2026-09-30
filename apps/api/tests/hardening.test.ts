import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import { closeDatabase } from '../src/db/index.js'
import { LIMITE_DE_IDENTIFICACOES } from '../src/routes/public-customers.js'

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await closeDatabase()
})

describe('cabeçalhos de segurança', () => {
  it('toda resposta sai com os cabeçalhos do helmet, e sem anunciar o servidor', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/health' })

    expect(resposta.headers['x-content-type-options']).toBe('nosniff')
    expect(resposta.headers['strict-transport-security']).toContain('max-age=')
    expect(resposta.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(resposta.headers['content-security-policy']).toContain("default-src 'self'")
    expect(resposta.headers['x-powered-by']).toBeUndefined()
  })
})

describe('tamanho do corpo', () => {
  it(`corpo JSON acima de ${String(env.JSON_BODY_LIMIT_BYTES)} bytes é recusado antes de ser lido`, async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/api/v1/public/qualquer/orders',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ notes: 'x'.repeat(env.JSON_BODY_LIMIT_BYTES) }),
      remoteAddress: '192.0.2.50',
    })

    expect(resposta.statusCode).toBe(413)
    expect(resposta.json()).toMatchObject({ error: { code: 'FST_ERR_CTP_BODY_TOO_LARGE' } })
  })
})

describe('IP de quem chama', () => {
  it('sem TRUST_PROXY, um X-Forwarded-For inventado não escapa do limite', async () => {
    expect(env.TRUST_PROXY).toBe(false)
    const ip = '192.0.2.77'
    const identificar = (i: number) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/public/qualquer/customers/identify',
        payload: { phone: '(11) 98765-4321' },
        remoteAddress: ip,
        // Cada chamada finge vir de um IP diferente.
        headers: { 'x-forwarded-for': `203.0.113.${String(i)}` },
      })

    for (let i = 0; i < LIMITE_DE_IDENTIFICACOES; i += 1) {
      expect((await identificar(i)).statusCode).not.toBe(429)
    }
    expect((await identificar(99)).statusCode).toBe(429)
  })
})

describe('sonda de prontidão', () => {
  it('em produção, não revela o motivo da falha do banco (rede interna)', async () => {
    const { verificacaoPublica } = await import('../src/routes/health.js')
    const falha = {
      status: 'error' as const,
      latencyMs: 5,
      message: 'connect ECONNREFUSED 10.0.3.4:5432',
    }

    expect(verificacaoPublica(falha, false)).toEqual({ status: 'error', latencyMs: 5 })
    expect(verificacaoPublica(falha, true)).toEqual(falha)
  })
})
