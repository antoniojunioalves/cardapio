import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { closeDatabase, db } from '../src/db/index.js'
import { categories, products } from '../src/db/schema/index.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'
import {
  criarTenantComUsuario,
  removerTenantDeTeste,
  SENHA_PADRAO,
  type TenantDeTeste,
} from './helpers/fixtures.js'
import { corpoMultipart, PNG } from './helpers/imagens.js'

/**
 * Isolamento do catálogo.
 *
 * Aqui há um vetor que as fases anteriores não tinham: **referências**. Um
 * produto aponta para uma categoria, e a checagem de chave estrangeira do
 * PostgreSQL roda por fora do RLS. Sem a FK composta, o Tenant A conseguiria
 * criar um produto dentro de uma categoria do Tenant B, bastando saber o UUID.
 */

const TODAS = [
  'categories:read',
  'categories:create',
  'categories:update',
  'categories:delete',
  'products:read',
  'products:create',
  'products:update',
  'products:delete',
]

let app: FastifyInstance
let tenantA: TenantDeTeste
let tenantB: TenantDeTeste
let tokenA = ''
let categoriaDeB = ''
let produtoDeB = ''

async function entrar(f: TenantDeTeste): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { tenantSlug: f.slug, email: f.email, password: SENHA_PADRAO },
  })
  return r.json<{ accessToken: string }>().accessToken
}

const comoA = (
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1/admin${url}`,
    headers: { authorization: `Bearer ${tokenA}` },
    ...(payload && { payload }),
  })

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()
  tenantA = await criarTenantComUsuario({ permissoes: TODAS, permissoesReais: true })
  tenantB = await criarTenantComUsuario({ permissoes: TODAS, permissoesReais: true })
  tokenA = await entrar(tenantA)
  const tokenB = await entrar(tenantB)

  const comoB = (url: string, payload: object) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/admin${url}`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload,
    })

  categoriaDeB = (await comoB('/categories', { name: 'Pizzas de B' })).json<{ id: string }>().id
  produtoDeB = (
    await comoB('/products', { categoryId: categoriaDeB, name: 'Margherita', priceInCents: 4500 })
  ).json<{ id: string }>().id

  await comoA('POST', '/categories', { name: 'Lanches de A' })
})

afterAll(async () => {
  await app.close()
  await removerTenantDeTeste(tenantA)
  await removerTenantDeTeste(tenantB)
  await closeDatabase()
})

describe('leitura', () => {
  it('A não vê as categorias de B', async () => {
    const nomes = (await comoA('GET', '/categories')).json<{ name: string }[]>().map((c) => c.name)

    expect(nomes).toEqual(['Lanches de A'])
  })

  it('A não vê os produtos de B', async () => {
    expect((await comoA('GET', '/products')).json()).toEqual([])
  })

  it('pedir o produto de B pelo id dá 404, e não 403', async () => {
    // Um 403 confirmaria que o id existe — informação útil para quem está
    // tentando adivinhar ids de outro estabelecimento.
    expect((await comoA('GET', `/products/${produtoDeB}`)).statusCode).toBe(404)
  })

  it('filtrar pela categoria de B devolve lista vazia', async () => {
    expect((await comoA('GET', `/products?categoryId=${categoriaDeB}`)).json()).toEqual([])
  })
})

describe('escrita', () => {
  it('A não altera o preço de um produto de B', async () => {
    expect((await comoA('PATCH', `/products/${produtoDeB}`, { priceInCents: 1 })).statusCode).toBe(
      404,
    )

    const [produto] = await withTenant(tenantContextFromUser(tenantB.tenantId), (tx) =>
      tx.select({ preco: products.priceInCents }).from(products).where(eq(products.id, produtoDeB)),
    )
    expect(produto?.preco).toBe(4500)
  })

  it('A não marca como esgotado um produto de B', async () => {
    expect(
      (await comoA('PATCH', `/products/${produtoDeB}`, { isAvailable: false })).statusCode,
    ).toBe(404)
  })

  it('A não exclui produto nem categoria de B', async () => {
    expect((await comoA('DELETE', `/products/${produtoDeB}`)).statusCode).toBe(404)
    expect((await comoA('DELETE', `/categories/${categoriaDeB}`)).statusCode).toBe(404)
  })

  it('A não renomeia uma categoria de B', async () => {
    expect(
      (await comoA('PATCH', `/categories/${categoriaDeB}`, { name: 'Invadida' })).statusCode,
    ).toBe(404)
  })

  it('A não inclui uma categoria de B na própria reordenação', async () => {
    const minhas = (await comoA('GET', '/categories')).json<{ id: string }[]>().map((c) => c.id)

    const r = await comoA('PUT', '/categories/order', { ids: [...minhas, categoriaDeB] })

    expect(r.statusCode).toBe(400)
  })

  it('A não envia imagem para um produto de B', async () => {
    // Com uma imagem válida, para o pedido passar da validação e chegar ao
    // serviço. Sem corpo, a rota responderia 400 antes de consultar qualquer
    // coisa — e o teste passaria mesmo que o isolamento não existisse.
    const { payload, headers } = corpoMultipart(PNG)
    const r = await app.inject({
      method: 'PUT',
      url: `/api/v1/admin/products/${produtoDeB}/image`,
      payload,
      headers: { ...headers, authorization: `Bearer ${tokenA}` },
    })

    expect(r.statusCode).toBe(404)
  })
})

describe('referências entre estabelecimentos', () => {
  it('A não cria produto dentro de uma categoria de B pela API', async () => {
    const r = await comoA('POST', '/products', {
      categoryId: categoriaDeB,
      name: 'Infiltrado',
      priceInCents: 100,
    })

    expect(r.statusCode).toBe(404)
  })

  it('A não move um produto próprio para uma categoria de B', async () => {
    const [minhaCategoria] = (await comoA('GET', '/categories')).json<{ id: string }[]>()
    const meu = (
      await comoA('POST', '/products', {
        categoryId: minhaCategoria?.id,
        name: 'Meu',
        priceInCents: 100,
      })
    ).json<{ id: string }>()

    const r = await comoA('PATCH', `/products/${meu.id}`, { categoryId: categoriaDeB })

    expect(r.statusCode).toBe(404)
  })

  it('o banco recusa a referência mesmo que a verificação da aplicação falhe', async () => {
    // Sem passar pelo serviço: um INSERT direto, marcado como de A, apontando
    // para a categoria de B. É o que aconteceria se alguém esquecesse a
    // verificação no código. A FK composta é quem recusa.
    await expect(
      withTenant(tenantContextFromUser(tenantA.tenantId), (tx) =>
        tx.insert(products).values({
          tenantId: tenantA.tenantId,
          categoryId: categoriaDeB,
          name: 'Contrabando',
          priceInCents: 100,
        }),
      ),
    ).rejects.toThrow()
  })
})

describe('fora de contexto', () => {
  it('nada do catálogo é legível', async () => {
    expect(await db.select().from(categories)).toEqual([])
    expect(await db.select().from(products)).toEqual([])
  })
})
