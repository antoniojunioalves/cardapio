import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { closeDatabase, db } from '../src/db/index.js'
import { comboItems, optionGroups, options, productOptionGroups } from '../src/db/schema/index.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'
import {
  criarTenantComUsuario,
  removerTenantDeTeste,
  SENHA_PADRAO,
  type TenantDeTeste,
} from './helpers/fixtures.js'

/**
 * Isolamento da personalização.
 *
 * Esta fase é quase toda feita de referências — opção aponta para grupo,
 * produto aponta para grupo, combo aponta para produto —, e cada referência é
 * uma chance de apontar para o estabelecimento vizinho. Os testes tentam cada
 * uma delas duas vezes: pela API, e por um INSERT direto que simula alguém
 * esquecendo a verificação na aplicação.
 */

const PERMISSOES = [
  'products:read',
  'products:create',
  'products:update',
  'products:delete',
  'categories:create',
]

let app: FastifyInstance
let tenantA: TenantDeTeste
let tenantB: TenantDeTeste
let tokenA = ''

let produtoDeA = ''
let comboDeA = ''
let grupoDeB = ''
let opcaoDeB = ''
let produtoDeB = ''

async function entrar(f: TenantDeTeste): Promise<string> {
  return (
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { tenantSlug: f.slug, email: f.email, password: SENHA_PADRAO },
    })
  ).json<{ accessToken: string }>().accessToken
}

function como(token: string) {
  return (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({
      method,
      url: `/api/v1/admin${url}`,
      headers: { authorization: `Bearer ${token}` },
      ...(payload && { payload }),
    })
}

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()
  tenantA = await criarTenantComUsuario({ permissoes: PERMISSOES, permissoesReais: true })
  tenantB = await criarTenantComUsuario({ permissoes: PERMISSOES, permissoesReais: true })
  tokenA = await entrar(tenantA)
  const comoA = como(tokenA)
  const comoB = como(await entrar(tenantB))

  const categoriaDeA = (await comoA('POST', '/categories', { name: 'A' })).json<{ id: string }>().id
  produtoDeA = (
    await comoA('POST', '/products', {
      categoryId: categoriaDeA,
      name: 'Lanche de A',
      priceInCents: 100,
    })
  ).json<{ id: string }>().id
  comboDeA = (
    await comoA('POST', '/products', {
      categoryId: categoriaDeA,
      name: 'Combo de A',
      priceInCents: 100,
      type: 'COMBO',
    })
  ).json<{ id: string }>().id

  const categoriaDeB = (await comoB('POST', '/categories', { name: 'B' })).json<{ id: string }>().id
  produtoDeB = (
    await comoB('POST', '/products', {
      categoryId: categoriaDeB,
      name: 'Pizza de B',
      priceInCents: 100,
    })
  ).json<{ id: string }>().id
  const grupo = (
    await comoB('POST', '/option-groups', {
      name: 'Bordas de B',
      minSelections: 0,
      maxSelections: 1,
      options: [{ name: 'Catupiry', priceDeltaInCents: 800 }],
    })
  ).json<{ id: string; options: { id: string }[] }>()
  grupoDeB = grupo.id
  opcaoDeB = grupo.options[0]?.id ?? ''
})

afterAll(async () => {
  await app.close()
  await removerTenantDeTeste(tenantA)
  await removerTenantDeTeste(tenantB)
  await closeDatabase()
})

const contextoDeA = () => tenantContextFromUser(tenantA.tenantId)

describe('grupos de opção', () => {
  it('A não vê os grupos de B', async () => {
    expect((await como(tokenA)('GET', '/option-groups')).json()).toEqual([])
    expect((await como(tokenA)('GET', `/option-groups/${grupoDeB}`)).statusCode).toBe(404)
  })

  it('A não altera nem exclui o grupo de B', async () => {
    const edicao = await como(tokenA)('PUT', `/option-groups/${grupoDeB}`, {
      name: 'Invadido',
      minSelections: 0,
      maxSelections: 1,
      options: [{ name: 'X', priceDeltaInCents: 0 }],
    })

    expect(edicao.statusCode).toBe(404)
    expect((await como(tokenA)('DELETE', `/option-groups/${grupoDeB}`)).statusCode).toBe(404)
  })

  it('A não sequestra a opção de B para um grupo próprio', async () => {
    const meu = (
      await como(tokenA)('POST', '/option-groups', {
        name: 'Meu',
        minSelections: 0,
        maxSelections: 1,
        options: [{ name: 'Minha', priceDeltaInCents: 0 }],
      })
    ).json<{ id: string }>()

    const r = await como(tokenA)('PUT', `/option-groups/${meu.id}`, {
      name: 'Meu',
      minSelections: 0,
      maxSelections: 1,
      options: [{ id: opcaoDeB, name: 'Roubada', priceDeltaInCents: 0 }],
    })

    expect(r.statusCode).toBe(400)
  })

  it('o banco recusa uma opção de A dentro do grupo de B', async () => {
    await expect(
      withTenant(contextoDeA(), (tx) =>
        tx.insert(options).values({
          tenantId: tenantA.tenantId,
          groupId: grupoDeB,
          name: 'Infiltrada',
        }),
      ),
    ).rejects.toThrow()
  })
})

describe('ligação entre produto e grupo', () => {
  it('A não liga o grupo de B ao próprio produto', async () => {
    const r = await como(tokenA)('PUT', `/products/${produtoDeA}/option-groups`, {
      groupIds: [grupoDeB],
    })

    expect(r.statusCode).toBe(404)
  })

  it('o banco recusa a ligação mesmo sem a verificação da aplicação', async () => {
    await expect(
      withTenant(contextoDeA(), (tx) =>
        tx.insert(productOptionGroups).values({
          tenantId: tenantA.tenantId,
          productId: produtoDeA,
          groupId: grupoDeB,
        }),
      ),
    ).rejects.toThrow()
  })

  it('A não consulta os grupos de um produto de B', async () => {
    expect((await como(tokenA)('GET', `/products/${produtoDeB}/option-groups`)).statusCode).toBe(
      404,
    )
  })
})

describe('combos', () => {
  it('A não coloca um produto de B no próprio combo', async () => {
    const r = await como(tokenA)('PUT', `/products/${comboDeA}/combo-items`, {
      items: [{ productId: produtoDeB, quantity: 1 }],
    })

    expect(r.statusCode).toBe(404)
  })

  it('o banco recusa o componente de outro estabelecimento', async () => {
    await expect(
      withTenant(contextoDeA(), (tx) =>
        tx.insert(comboItems).values({
          tenantId: tenantA.tenantId,
          comboProductId: comboDeA,
          itemProductId: produtoDeB,
        }),
      ),
    ).rejects.toThrow()
  })
})

describe('fora de contexto', () => {
  it('nada da personalização é legível', async () => {
    expect(await db.select().from(optionGroups)).toEqual([])
    expect(await db.select().from(options)).toEqual([])
    expect(await db.select().from(productOptionGroups)).toEqual([])
    expect(await db.select().from(comboItems)).toEqual([])
  })
})
