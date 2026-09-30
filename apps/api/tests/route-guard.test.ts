import { randomUUID } from 'node:crypto'

import type { FastifyInstance, RouteOptions } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { closeDatabase } from '../src/db/index.js'

/**
 * Teste-guarda das rotas, pelo inventário do que está registrado.
 *
 * Toda rota nova cai numa de duas regras, sem ninguém precisar lembrar de
 * escrever um teste para ela:
 * - sob `/api/v1/admin`, responde 401 sem login;
 * - fora dele, precisa estar na lista abaixo, com o motivo de ser aberta.
 *
 * Esquecer o `requireAuth` numa rota do painel, ou abrir uma rota pública sem
 * querer, derruba este teste.
 */

const ROTAS_ABERTAS: Record<string, string> = {
  'GET /health': 'sonda de vida, sem banco',
  'GET /ready': 'sonda de prontidão',
  'GET /api/v1/public/:tenantSlug/menu': 'cardápio público',
  'POST /api/v1/public/:tenantSlug/customers/identify': 'identificação por telefone, com limite',
  'POST /api/v1/public/:tenantSlug/orders': 'envio do pedido, com limite',
  'POST /api/v1/public/signup': 'cadastro de estabelecimento, com limite',
  'GET /api/v1/public/signup/slug-availability': 'disponibilidade do endereço, com limite',
  'POST /api/v1/public/signup/confirm-email': 'confirmação pelo token do link, com limite',
  'POST /api/v1/auth/login': 'login, com limite',
  'POST /api/v1/auth/refresh': 'renovação pelo refresh token',
  'POST /api/v1/auth/logout': 'logout pelo refresh token',
  'GET /uploads/*': 'imagens públicas',
  'OPTIONS *': 'pré-verificação de CORS, respondida pelo plugin',
}

/** Fora do prefixo do painel, mas protegidas: precisam responder 401 sem login. */
const PROTEGIDAS_FORA_DO_ADMIN = new Set(['GET /api/v1/auth/me'])

const protegida = (r: { metodo: string; url: string }) =>
  r.url.startsWith('/api/v1/admin') || PROTEGIDAS_FORA_DO_ADMIN.has(`${r.metodo} ${r.url}`)

/** A conexão ao vivo autentica na primeira mensagem, não no cabeçalho (realtime.test.ts). */
const ADMIN_SEM_CABECALHO = new Set(['GET /api/v1/admin/orders/stream'])

let app: FastifyInstance
const rotas: { metodo: string; url: string }[] = []

beforeAll(async () => {
  app = await buildApp({
    rateLimit: false,
    aoRegistrarRota: (rota: RouteOptions) => {
      const metodos = Array.isArray(rota.method) ? rota.method : [rota.method]
      for (const metodo of metodos) {
        // HEAD é gerado a partir do GET; a documentação só existe fora de produção.
        if (metodo !== 'HEAD' && !rota.url.startsWith('/docs')) {
          rotas.push({ metodo, url: rota.url })
        }
      }
    },
  })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  await closeDatabase()
})

const chave = (r: { metodo: string; url: string }) => `${r.metodo} ${r.url}`

describe('inventário de rotas', () => {
  it('encontrou as rotas do painel e as públicas', () => {
    expect(rotas.filter((r) => r.url.startsWith('/api/v1/admin')).length).toBeGreaterThan(20)
    expect(rotas.some((r) => r.url === '/api/v1/public/:tenantSlug/orders')).toBe(true)
  })

  it('toda rota do painel recusa quem não está logado — com 401, antes de ler o corpo', async () => {
    const abertas: string[] = []
    for (const rota of rotas.filter(protegida)) {
      if (ADMIN_SEM_CABECALHO.has(chave(rota))) continue
      const resposta = await app.inject({
        method: rota.metodo as 'GET',
        url: rota.url.replace(/:[a-zA-Z]+/g, randomUUID()),
        payload: {},
      })
      if (resposta.statusCode !== 401)
        abertas.push(`${chave(rota)} → ${String(resposta.statusCode)}`)
    }
    expect(abertas, 'rotas do painel que não exigem login').toEqual([])
  })

  it('toda rota fora do painel é uma das abertas de propósito', () => {
    const desconhecidas = rotas
      .filter((r) => !protegida(r))
      .map(chave)
      .filter((k) => !(k in ROTAS_ABERTAS))
    expect(desconhecidas, 'rotas abertas que não estão na lista').toEqual([])
  })
})
