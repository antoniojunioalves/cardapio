import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { closeDatabase } from '../src/db/index.js'

describe('documentação OpenAPI', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp({ rateLimit: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await closeDatabase()
  })

  it('gera a especificação a partir dos schemas Zod das rotas', () => {
    const spec = app.swagger() as {
      openapi: string
      paths: Record<string, unknown>
    }

    expect(spec.openapi).toMatch(/^3\./)
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(['/health', '/ready']))
  })

  it('descreve as respostas de /ready, incluindo o 503', () => {
    const spec = app.swagger() as {
      paths: Record<string, { get?: { responses?: Record<string, unknown> } }>
    }

    const respostas = spec.paths['/ready']?.get?.responses ?? {}

    expect(Object.keys(respostas)).toEqual(expect.arrayContaining(['200', '503']))
  })

  it('o schema de /health reflete os campos reais da resposta', () => {
    const spec = app.swagger() as {
      paths: Record<
        string,
        {
          get?: {
            responses?: Record<
              string,
              { content?: { 'application/json'?: { schema?: { properties?: object } } } }
            >
          }
        }
      >
    }

    const propriedades =
      spec.paths['/health']?.get?.responses?.['200']?.content?.['application/json']?.schema
        ?.properties ?? {}

    expect(Object.keys(propriedades)).toEqual(
      expect.arrayContaining(['status', 'name', 'environment', 'uptimeSeconds', 'timestamp']),
    )
  })

  it('serve a interface em /docs fora de produção', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/' })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/html')
  })
})
