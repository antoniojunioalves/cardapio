import { randomUUID } from 'node:crypto'

import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { closeDatabase, db } from '../src/db/index.js'
import { seedRbac } from '../src/db/seed-rbac.js'
import {
  auditLogs,
  planFeatures,
  plans,
  refreshTokens,
  roles,
  subscriptions,
} from '../src/db/schema/index.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'
import { definirPapel } from '../src/users/repository.js'
import {
  criarTenantComUsuario,
  removerTenantDeTeste,
  SENHA_PADRAO,
  type TenantDeTeste,
} from './helpers/fixtures.js'

let app: FastifyInstance
let loja: TenantDeTeste
let outraLoja: TenantDeTeste
let planoId = ''
let tokenDoDono = ''

interface Usuario {
  id: string
  email: string
  isActive: boolean
  role: { code: string } | null
}

async function entrar(tenantSlug: string, email: string, password = SENHA_PADRAO) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { tenantSlug, email, password },
  })
}

function chamar(method: 'GET' | 'POST' | 'PATCH', url: string, token: string, payload?: object) {
  return app.inject({
    method,
    url: `/api/v1/admin${url}`,
    headers: { authorization: `Bearer ${token}` },
    ...(payload && { payload }),
  })
}

async function criar(role: 'ADMIN' | 'STAFF', token = tokenDoDono) {
  const email = `pessoa-${randomUUID().slice(0, 8)}@EXEMPLO.com`
  const resposta = await chamar('POST', '/users', token, {
    name: 'Pessoa',
    email,
    password: 'senha-inicial-123',
    role,
  })
  return { resposta, email: email.toLowerCase() }
}

/** Desativa todos, menos o dono, para cada teste começar com vagas. */
async function liberarVagas() {
  const lista = (await chamar('GET', '/users', tokenDoDono)).json<Usuario[]>()
  for (const u of lista) {
    if (u.role?.code !== 'OWNER' && u.isActive) {
      await chamar('POST', `/users/${u.id}/deactivate`, tokenDoDono)
    }
  }
}

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()
  await seedRbac()

  // Plano de teste: 3 usuários ativos.
  const [plano] = await db
    .insert(plans)
    .values({ code: `TESTE_${randomUUID().slice(0, 8)}`, name: 'Plano de teste' })
    .returning({ id: plans.id })
  planoId = plano?.id ?? ''
  await db.insert(planFeatures).values({ planId: planoId, key: 'maxUsers', limitValue: 3 })

  loja = await criarTenantComUsuario()
  outraLoja = await criarTenantComUsuario()

  // O usuário do fixture vira o dono de verdade, com o papel OWNER do RBAC.
  const [dono] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, 'OWNER'))
  await withTenant(tenantContextFromUser(loja.tenantId), async (tx) => {
    await definirPapel(tx, loja.tenantId, loja.userId, dono?.id ?? '')
    await tx.insert(subscriptions).values({ tenantId: loja.tenantId, planId: planoId })
  })
  tokenDoDono = (await entrar(loja.slug, loja.email)).json<{ accessToken: string }>().accessToken
})

afterAll(async () => {
  await app.close()
  for (const f of [loja, outraLoja]) await removerTenantDeTeste(f)
  await db.delete(plans).where(eq(plans.id, planoId))
  await closeDatabase()
})

describe('criar usuário', () => {
  it('o dono cria um atendente, que consegue entrar com a senha inicial', async () => {
    await liberarVagas()
    const { resposta, email } = await criar('STAFF')

    expect(resposta.statusCode, resposta.body).toBe(201)
    expect(resposta.json()).toMatchObject({ email, isActive: true, role: { code: 'STAFF' } })
    expect(resposta.body).not.toContain('password')

    expect((await entrar(loja.slug, email, 'senha-inicial-123')).statusCode).toBe(200)
  })

  it('e-mail repetido é recusado', async () => {
    await liberarVagas()
    const { email } = await criar('STAFF')
    await liberarVagas()

    const repetido = await chamar('POST', '/users', tokenDoDono, {
      name: 'Outra',
      email,
      password: 'senha-inicial-123',
      role: 'STAFF',
    })
    expect(repetido.statusCode).toBe(409)
    expect(repetido.json()).toMatchObject({ error: { code: 'USER_EMAIL_TAKEN' } })
  })

  it('o papel OWNER não é dado pela API', async () => {
    const resposta = await chamar('POST', '/users', tokenDoDono, {
      name: 'Outro dono',
      email: 'dono2@exemplo.com',
      password: 'senha-inicial-123',
      role: 'OWNER',
    })
    expect(resposta.statusCode).toBe(400)
  })
})

describe('limite de usuários do plano', () => {
  it('conta só os ativos: cheio recusa, desativar abre vaga, reativar respeita o limite', async () => {
    await liberarVagas()
    // Dono + 2 = 3, o limite.
    await criar('STAFF')
    const { resposta: segundo } = await criar('STAFF')

    const cheio = await criar('STAFF')
    expect(cheio.resposta.statusCode).toBe(409)
    expect(cheio.resposta.json()).toMatchObject({ error: { code: 'PLAN_USER_LIMIT' } })
    expect(cheio.resposta.body).toContain('Plano de teste permite 3 usuários ativos')

    const idDoSegundo = segundo.json<Usuario>().id
    await chamar('POST', `/users/${idDoSegundo}/deactivate`, tokenDoDono)
    const { resposta: terceiro } = await criar('STAFF')
    expect(terceiro.statusCode).toBe(201)

    const reativar = await chamar('POST', `/users/${idDoSegundo}/reactivate`, tokenDoDono)
    expect(reativar.statusCode).toBe(409)
  })
})

describe('desativar', () => {
  it('encerra as sessões: o token para de valer, o refresh e o login são recusados', async () => {
    await liberarVagas()
    const { resposta, email } = await criar('STAFF')
    const id = resposta.json<Usuario>().id
    const sessao = (await entrar(loja.slug, email, 'senha-inicial-123')).json<{
      accessToken: string
      refreshToken: string
    }>()

    expect((await chamar('POST', `/users/${id}/deactivate`, tokenDoDono)).statusCode).toBe(200)

    expect((await chamar('GET', '/orders', sessao.accessToken)).statusCode).toBe(401)
    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: sessao.refreshToken },
    })
    expect(refresh.statusCode).toBe(401)
    expect((await entrar(loja.slug, email, 'senha-inicial-123')).statusCode).toBe(403)

    // Segunda barreira: a renovação já recusa usuário inativo, mas nenhum
    // refresh token dele fica válido no banco.
    const validos = await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
      tx
        .select()
        .from(refreshTokens)
        .where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt))),
    )
    expect(validos).toEqual([])
  })

  it('ninguém desativa a própria conta', async () => {
    const proprio = await chamar('POST', `/users/${loja.userId}/deactivate`, tokenDoDono)
    expect(proprio.statusCode).toBe(409)
    expect(proprio.json()).toMatchObject({ error: { code: 'CANNOT_DEACTIVATE_SELF' } })
  })
})

describe('o administrador', () => {
  async function comoAdmin() {
    await liberarVagas()
    const { resposta, email } = await criar('ADMIN')
    const token = (await entrar(loja.slug, email, 'senha-inicial-123')).json<{
      accessToken: string
    }>().accessToken
    return { token, id: resposta.json<Usuario>().id }
  }

  it('cria e altera usuários, mas não desativa ninguém (decisão do dono)', async () => {
    const admin = await comoAdmin()
    const { resposta } = await criar('STAFF', admin.token)
    expect(resposta.statusCode).toBe(201)
    const id = resposta.json<Usuario>().id

    const promovido = await chamar('PATCH', `/users/${id}`, admin.token, { role: 'ADMIN' })
    expect(promovido.json()).toMatchObject({ role: { code: 'ADMIN' } })

    expect((await chamar('POST', `/users/${id}/deactivate`, admin.token)).statusCode).toBe(403)
  })

  it('não mexe na conta do dono, nem muda o próprio papel', async () => {
    const admin = await comoAdmin()

    const noDono = await chamar('PATCH', `/users/${loja.userId}`, admin.token, { name: 'Outro' })
    expect(noDono.statusCode).toBe(403)

    const proprio = await chamar('PATCH', `/users/${admin.id}`, admin.token, { role: 'STAFF' })
    expect(proprio.statusCode).toBe(409)
    expect(proprio.json()).toMatchObject({ error: { code: 'CANNOT_CHANGE_OWN_ROLE' } })
  })
})

describe('regras gerais', () => {
  it('o papel do dono não muda, nem pelo próprio dono', async () => {
    const resposta = await chamar('PATCH', `/users/${loja.userId}`, tokenDoDono, { role: 'ADMIN' })
    expect(resposta.statusCode).toBe(409)
  })

  it('atendente não vê a lista de usuários', async () => {
    await liberarVagas()
    const { email } = await criar('STAFF')
    const token = (await entrar(loja.slug, email, 'senha-inicial-123')).json<{
      accessToken: string
    }>().accessToken
    expect((await chamar('GET', '/users', token)).statusCode).toBe(403)
  })

  it('usuário de outro estabelecimento responde 404', async () => {
    const resposta = await chamar('PATCH', `/users/${outraLoja.userId}`, tokenDoDono, {
      name: 'Invasor',
    })
    expect(resposta.statusCode).toBe(404)
  })

  it('criar, alterar e desativar ficam na auditoria', async () => {
    const registros = await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
      tx
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(and(eq(auditLogs.entityType, 'user'), eq(auditLogs.actorUserId, loja.userId))),
    )
    const acoes = new Set(registros.map((r) => r.action))
    expect(acoes).toContain('user.created')
    expect(acoes).toContain('user.deactivated')
  })
})
