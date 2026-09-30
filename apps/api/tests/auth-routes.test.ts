import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { closeDatabase } from '../src/db/index.js'
import { auditLogs, refreshTokens } from '../src/db/schema/index.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'
import {
  criarTenantComUsuario,
  permissaoDe,
  removerTenantDeTeste,
  SENHA_PADRAO,
  sessaoDe,
  type TenantDeTeste,
} from './helpers/fixtures.js'

let app: FastifyInstance
let fixture: TenantDeTeste

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()
  fixture = await criarTenantComUsuario({ permissoes: ['products:read', 'orders:update'] })
})

afterAll(async () => {
  await app.close()
  await removerTenantDeTeste(fixture)
  await closeDatabase()
})

function entrar(corpo: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: corpo })
}

interface RespostaSessao {
  accessToken: string
  user: { id: string; tenantId: string; email: string; permissions: string[] }
}

describe('POST /api/v1/auth/login', () => {
  it('autentica e devolve sessão com as permissões efetivas', async () => {
    const resposta = await entrar({
      tenantSlug: fixture.slug,
      email: fixture.email,
      password: SENHA_PADRAO,
    })

    expect(resposta.statusCode).toBe(200)

    const sessao = sessaoDe<RespostaSessao>(resposta)
    expect(sessao.user).toMatchObject({ id: fixture.userId, tenantId: fixture.tenantId })
    expect(sessao.user.permissions).toEqual([
      permissaoDe(fixture, 'orders:update'),
      permissaoDe(fixture, 'products:read'),
    ])
    expect(sessao.accessToken.split('.')).toHaveLength(3)
    expect(sessao.refreshToken.startsWith(`${fixture.tenantId}.`)).toBe(true)
  })

  it('nunca devolve o hash da senha', async () => {
    const resposta = await entrar({
      tenantSlug: fixture.slug,
      email: fixture.email,
      password: SENHA_PADRAO,
    })

    expect(resposta.body).not.toContain('argon2')
    expect(resposta.body).not.toContain('passwordHash')
  })

  it('registra a entrada na auditoria', async () => {
    await entrar({ tenantSlug: fixture.slug, email: fixture.email, password: SENHA_PADRAO })

    const registros = await withTenant(tenantContextFromUser(fixture.tenantId), (tx) =>
      tx.select({ action: auditLogs.action, actor: auditLogs.actorUserId }).from(auditLogs),
    )

    expect(registros.some((r) => r.action === 'auth.login' && r.actor === fixture.userId)).toBe(
      true,
    )
  })

  it('recusa senha errada com mensagem genérica', async () => {
    const resposta = await entrar({
      tenantSlug: fixture.slug,
      email: fixture.email,
      password: 'senha-errada',
    })

    expect(resposta.statusCode).toBe(401)
    expect(resposta.json<{ error: { code: string } }>().error.code).toBe('UNAUTHORIZED')
  })

  it('responde a e-mail inexistente igual a senha errada', async () => {
    const resposta = await entrar({
      tenantSlug: fixture.slug,
      email: 'ninguem@exemplo.com',
      password: SENHA_PADRAO,
    })

    // Mesma resposta da senha errada: o endpoint não pode servir de oráculo
    // de quais e-mails estão cadastrados.
    expect(resposta.statusCode).toBe(401)
    expect(resposta.json<{ error: { code: string } }>().error.code).toBe('UNAUTHORIZED')
  })

  it('responde a estabelecimento inexistente igual a senha errada', async () => {
    const resposta = await entrar({
      tenantSlug: 'nao-existe-este-slug',
      email: fixture.email,
      password: SENHA_PADRAO,
    })

    expect(resposta.statusCode).toBe(401)
  })

  it('valida o corpo antes de tocar no banco', async () => {
    const resposta = await entrar({ tenantSlug: fixture.slug, email: 'não-é-email' })

    expect(resposta.statusCode).toBe(400)
    expect(resposta.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR')
  })
})

describe('conta desativada', () => {
  let desativado: TenantDeTeste

  beforeAll(async () => {
    desativado = await criarTenantComUsuario({ ativo: false })
  })

  afterAll(async () => {
    await removerTenantDeTeste(desativado)
  })

  it('só revela que está desativada depois de a senha conferir', async () => {
    const comSenhaCerta = await entrar({
      tenantSlug: desativado.slug,
      email: desativado.email,
      password: SENHA_PADRAO,
    })

    expect(comSenhaCerta.statusCode).toBe(403)
    expect(comSenhaCerta.json<{ error: { message: string } }>().error.message).toContain(
      'desativada',
    )

    // Quem não sabe a senha continua recebendo o 401 genérico — a informação
    // só chega a quem já provou ser o dono da conta.
    const comSenhaErrada = await entrar({
      tenantSlug: desativado.slug,
      email: desativado.email,
      password: 'chute',
    })

    expect(comSenhaErrada.statusCode).toBe(401)
  })
})

describe('GET /api/v1/auth/me', () => {
  it('exige autenticação', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/api/v1/auth/me' })

    expect(resposta.statusCode).toBe(401)
  })

  it('recusa token forjado', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: 'Bearer nao.e.um.token' },
    })

    expect(resposta.statusCode).toBe(401)
  })

  it('devolve o usuário autenticado e suas permissões', async () => {
    const { accessToken } = sessaoDe<RespostaSessao>(
      await entrar({ tenantSlug: fixture.slug, email: fixture.email, password: SENHA_PADRAO }),
    )

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    })

    expect(resposta.statusCode).toBe(200)
    expect(resposta.json()).toMatchObject({ id: fixture.userId, tenantId: fixture.tenantId })
  })
})

describe('renovação de sessão', () => {
  it('rotaciona: o token antigo para de valer e o novo funciona', async () => {
    const primeira = sessaoDe<RespostaSessao>(
      await entrar({ tenantSlug: fixture.slug, email: fixture.email, password: SENHA_PADRAO }),
    )

    const renovada = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: primeira.refreshToken },
    })

    expect(renovada.statusCode).toBe(200)
    const nova = sessaoDe<RespostaSessao>(renovada)
    expect(nova.refreshToken).not.toBe(primeira.refreshToken)

    const comNovo = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: nova.refreshToken },
    })
    expect(comNovo.statusCode).toBe(200)
  })

  it('reapresentar um token já rotacionado derruba todas as sessões do usuário', async () => {
    const sessaoA = sessaoDe<RespostaSessao>(
      await entrar({ tenantSlug: fixture.slug, email: fixture.email, password: SENHA_PADRAO }),
    )
    const sessaoB = sessaoDe<RespostaSessao>(
      await entrar({ tenantSlug: fixture.slug, email: fixture.email, password: SENHA_PADRAO }),
    )

    // Rotaciona a sessão A normalmente.
    const rotacionada = sessaoDe<RespostaSessao>(
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: sessaoA.refreshToken },
      }),
    )

    // Alguém reapresenta o token antigo: ou é cópia roubada, ou o legítimo
    // usando um token que já devia ter sido descartado. Não há como saber
    // qual, então tudo cai.
    const reuso = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: sessaoA.refreshToken },
    })
    expect(reuso.statusCode).toBe(401)

    for (const token of [rotacionada.refreshToken, sessaoB.refreshToken]) {
      const depois = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: token },
      })
      expect(depois.statusCode).toBe(401)
    }

    const registros = await withTenant(tenantContextFromUser(fixture.tenantId), (tx) =>
      tx.select({ action: auditLogs.action }).from(auditLogs),
    )
    expect(registros.some((r) => r.action === 'auth.refresh_reuse_detected')).toBe(true)
  })
})

describe('POST /api/v1/auth/logout', () => {
  it('revoga o refresh token e é idempotente', async () => {
    const sessao = sessaoDe<RespostaSessao>(
      await entrar({ tenantSlug: fixture.slug, email: fixture.email, password: SENHA_PADRAO }),
    )

    const saida = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken: sessao.refreshToken },
    })
    expect(saida.statusCode).toBe(204)

    // Sair de novo não é erro — o cliente pode repetir a chamada.
    const denovo = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken: sessao.refreshToken },
    })
    expect(denovo.statusCode).toBe(204)

    const revogado = await withTenant(tenantContextFromUser(fixture.tenantId), (tx) =>
      tx
        .select({ revokedAt: refreshTokens.revokedAt })
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, fixture.userId)),
    )
    expect(revogado.some((r) => r.revokedAt !== null)).toBe(true)
  })
})

describe('o banco nunca guarda o refresh token em claro', () => {
  it('guarda apenas o hash', async () => {
    const sessao = sessaoDe<RespostaSessao>(
      await entrar({ tenantSlug: fixture.slug, email: fixture.email, password: SENHA_PADRAO }),
    )

    const linhas = await withTenant(tenantContextFromUser(fixture.tenantId), (tx) =>
      tx.select({ tokenHash: refreshTokens.tokenHash }).from(refreshTokens),
    )

    expect(linhas.every((l) => l.tokenHash !== sessao.refreshToken)).toBe(true)
    expect(linhas.every((l) => /^[0-9a-f]{64}$/.test(l.tokenHash))).toBe(true)
  })
})

describe('limite de tentativas de login', () => {
  it('bloqueia depois de poucas tentativas', async () => {
    const comLimite = await buildApp()
    await comLimite.ready()

    const alvo = { tenantSlug: fixture.slug, email: fixture.email, password: 'errada' }
    const codigos: number[] = []

    for (let i = 0; i < 7; i += 1) {
      const r = await comLimite.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: alvo,
      })
      codigos.push(r.statusCode)
    }

    // O custo do argon2 sozinho não impede força bruta; o limite dedicado sim.
    expect(codigos.filter((c) => c === 429).length).toBeGreaterThan(0)
    expect(codigos.at(-1)).toBe(429)

    await comLimite.close()
  })
})

describe('refresh token em cookie', () => {
  it('vai só no cookie httpOnly e SameSite=Strict, restrito às rotas de autenticação', async () => {
    const resposta = await entrar({
      tenantSlug: fixture.slug,
      email: fixture.email,
      password: SENHA_PADRAO,
    })

    expect(resposta.json()).not.toHaveProperty('refreshToken')
    const cookie = resposta.cookies.find((c) => c.name === 'refresh_token')
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/v1/auth' })
    expect(cookie?.value.startsWith(`${fixture.tenantId}.`)).toBe(true)
  })

  it('a renovação funciona só com o cookie, e troca o cookie', async () => {
    const primeira = sessaoDe<RespostaSessao>(
      await entrar({ tenantSlug: fixture.slug, email: fixture.email, password: SENHA_PADRAO }),
    )

    const renovada = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refresh_token: primeira.refreshToken },
    })

    expect(renovada.statusCode).toBe(200)
    expect(renovada.json()).not.toHaveProperty('refreshToken')
    const novo = renovada.cookies.find((c) => c.name === 'refresh_token')?.value
    expect(novo).toBeTruthy()
    expect(novo).not.toBe(primeira.refreshToken)
  })

  it('sem cookie e sem corpo, a renovação é recusada', async () => {
    const resposta = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh' })
    expect(resposta.statusCode).toBe(401)
  })

  it('o logout revoga e apaga o cookie', async () => {
    const sessao = sessaoDe<RespostaSessao>(
      await entrar({ tenantSlug: fixture.slug, email: fixture.email, password: SENHA_PADRAO }),
    )

    const saida = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { refresh_token: sessao.refreshToken },
    })

    expect(saida.statusCode).toBe(204)
    const apagado = saida.cookies.find((c) => c.name === 'refresh_token')
    expect(apagado?.value).toBe('')
    const depois = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refresh_token: sessao.refreshToken },
    })
    expect(depois.statusCode).toBe(401)
  })
})
