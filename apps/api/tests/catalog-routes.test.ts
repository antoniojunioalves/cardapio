import { readdir } from 'node:fs/promises'
import path from 'node:path'

import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { reorderProducts } from '../src/catalog/repository.js'
import { closeDatabase } from '../src/db/index.js'
import { auditLogs } from '../src/db/schema/index.js'
import { storage } from '../src/storage/index.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'
import {
  criarTenantComUsuario,
  removerTenantDeTeste,
  SENHA_PADRAO,
  type TenantDeTeste,
} from './helpers/fixtures.js'
import { corpoMultipart, PNG } from './helpers/imagens.js'

const TODAS = [
  'categories:create',
  'categories:update',
  'categories:delete',
  'products:read',
  'products:create',
  'products:update',
  'products:price',
  'products:availability',
  'products:delete',
]

let app: FastifyInstance
let dono: TenantDeTeste
let atendente: TenantDeTeste
let token = ''
let tokenDoAtendente = ''

async function entrar(f: TenantDeTeste): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: f.email, password: SENHA_PADRAO },
  })
  return r.json<{ accessToken: string }>().accessToken
}

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()
  dono = await criarTenantComUsuario({ permissoes: TODAS })
  atendente = await criarTenantComUsuario({
    permissoes: ['products:read'],
  })
  token = await entrar(dono)
  tokenDoAtendente = await entrar(atendente)
})

afterAll(async () => {
  await app.close()
  await removerTenantDeTeste(dono)
  await removerTenantDeTeste(atendente)
  await closeDatabase()
})

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

function chamar(method: Metodo, url: string, payload?: unknown, comToken = token) {
  return app.inject({
    method,
    url: `/api/v1/admin${url}`,
    headers: { authorization: `Bearer ${comToken}` },
    ...(payload !== undefined && { payload: payload as object }),
  })
}

interface Categoria {
  id: string
  name: string
  sortOrder: number
  imageUrl: string | null
}
interface Produto {
  id: string
  categoryId: string
  name: string
  priceInCents: number
  isAvailable: boolean
  imageUrl: string | null
}

const codigo = (r: LightMyRequestResponse) => r.json<{ error: { code: string } }>().error.code

let sequencia = 0
async function novaCategoria(nome = `Categoria ${String(++sequencia)}`): Promise<Categoria> {
  const r = await chamar('POST', '/categories', { name: nome })
  expect(r.statusCode).toBe(201)
  return r.json<Categoria>()
}

async function novoProduto(categoryId: string, dados: Record<string, unknown> = {}) {
  const r = await chamar('POST', '/products', {
    categoryId,
    name: `Produto ${String(++sequencia)}`,
    priceInCents: 2590,
    ...dados,
  })
  expect(r.statusCode).toBe(201)
  return r.json<Produto>()
}

async function acoesAuditadas(): Promise<{ action: string; metadata: unknown }[]> {
  return withTenant(tenantContextFromUser(dono.tenantId), (tx) =>
    tx.select({ action: auditLogs.action, metadata: auditLogs.metadata }).from(auditLogs),
  )
}

describe('permissões', () => {
  it('quem só lê não cria', async () => {
    const r = await chamar('POST', '/categories', { name: 'Proibida' }, tokenDoAtendente)

    expect(r.statusCode).toBe(403)
  })

  it('quem só lê consegue listar', async () => {
    expect((await chamar('GET', '/categories', undefined, tokenDoAtendente)).statusCode).toBe(200)
  })
})

describe('categorias', () => {
  it('cria no fim da lista quando a ordem não é informada', async () => {
    const primeira = await novaCategoria()
    const segunda = await novaCategoria()

    expect(segunda.sortOrder).toBeGreaterThan(primeira.sortOrder)
  })

  it('recusa nome repetido sem diferenciar maiúsculas', async () => {
    await novaCategoria('Bebidas')
    const r = await chamar('POST', '/categories', { name: 'BEBIDAS' })

    expect(r.statusCode).toBe(409)
    expect(codigo(r)).toBe('CATEGORY_NAME_TAKEN')
  })

  it('renomear para um nome já usado também é recusado', async () => {
    await novaCategoria('Sobremesas')
    const outra = await novaCategoria()

    const r = await chamar('PATCH', `/categories/${outra.id}`, { name: 'sobremesas' })

    expect(r.statusCode).toBe(409)
  })

  it('recusa PATCH vazio', async () => {
    const categoria = await novaCategoria()

    expect((await chamar('PATCH', `/categories/${categoria.id}`, {})).statusCode).toBe(400)
  })

  it('recusa id malformado antes de tocar no banco', async () => {
    expect((await chamar('PATCH', '/categories/nao-e-uuid', { name: 'x' })).statusCode).toBe(400)
  })

  it('responde 404 para categoria inexistente', async () => {
    const r = await chamar('PATCH', '/categories/01a0d928-0000-7000-8000-000000000000', {
      name: 'x',
    })

    expect(r.statusCode).toBe(404)
  })

  it('exclui categoria vazia', async () => {
    const categoria = await novaCategoria()

    expect((await chamar('DELETE', `/categories/${categoria.id}`)).statusCode).toBe(204)
    expect((await chamar('DELETE', `/categories/${categoria.id}`)).statusCode).toBe(404)
  })

  it('recusa excluir categoria com produtos, dizendo quantos', async () => {
    const categoria = await novaCategoria()
    await novoProduto(categoria.id)
    await novoProduto(categoria.id)

    const r = await chamar('DELETE', `/categories/${categoria.id}`)

    expect(r.statusCode).toBe(409)
    expect(codigo(r)).toBe('CATEGORY_NOT_EMPTY')
    expect(r.json<{ error: { message: string } }>().error.message).toContain('2 produto')
  })
})

describe('ordem das categorias', () => {
  it('aplica a ordem informada', async () => {
    const atuais = (await chamar('GET', '/categories')).json<Categoria[]>()
    const invertida = [...atuais].reverse().map((c) => c.id)

    const r = await chamar('PUT', '/categories/order', { ids: invertida })

    expect(r.statusCode).toBe(200)
    expect(r.json<Categoria[]>().map((c) => c.id)).toEqual(invertida)
  })

  it('recusa lista parcial', async () => {
    const atuais = (await chamar('GET', '/categories')).json<Categoria[]>()

    const r = await chamar('PUT', '/categories/order', { ids: atuais.slice(1).map((c) => c.id) })

    expect(r.statusCode).toBe(400)
    expect(codigo(r)).toBe('ORDER_INCOMPLETE')
  })

  it('recusa id repetido', async () => {
    const atuais = (await chamar('GET', '/categories')).json<Categoria[]>()
    const ids = atuais.map((c) => c.id)
    ids[1] = ids[0] ?? ''

    expect((await chamar('PUT', '/categories/order', { ids })).statusCode).toBe(400)
  })
})

describe('ordem dos produtos de uma categoria', () => {
  async function categoriaComTres() {
    const categoria = await novaCategoria()
    const produtos = [
      await novoProduto(categoria.id),
      await novoProduto(categoria.id),
      await novoProduto(categoria.id),
    ]
    return { categoria, ids: produtos.map((p) => p.id) }
  }

  it('aplica a ordem informada, e só nessa categoria', async () => {
    const { categoria, ids } = await categoriaComTres()
    const outra = await categoriaComTres()
    const invertida = [...ids].reverse()

    const r = await chamar('PUT', '/products/order', { categoryId: categoria.id, ids: invertida })

    expect(r.statusCode, r.body).toBe(200)
    expect(r.json<Produto[]>().map((p) => p.id)).toEqual(invertida)
    const daOutra = (await chamar('GET', `/products?categoryId=${outra.categoria.id}`))
      .json<Produto[]>()
      .map((p) => p.id)
    expect(daOutra).toEqual(outra.ids)
  })

  it('registra na auditoria a categoria e a ordem nova', async () => {
    const { categoria, ids } = await categoriaComTres()
    const invertida = [...ids].reverse()

    await chamar('PUT', '/products/order', { categoryId: categoria.id, ids: invertida })

    expect(await acoesAuditadas()).toContainEqual({
      action: 'product.reordered',
      metadata: { categoryId: categoria.id, ordem: invertida },
    })
  })

  it('recusa lista parcial e id repetido', async () => {
    const { categoria, ids } = await categoriaComTres()
    const [a = '', b = ''] = ids

    const parcial = await chamar('PUT', '/products/order', {
      categoryId: categoria.id,
      ids: [a, b],
    })
    const repetido = await chamar('PUT', '/products/order', {
      categoryId: categoria.id,
      ids: [a, b, a],
    })

    expect(parcial.statusCode).toBe(400)
    expect(codigo(parcial)).toBe('ORDER_INCOMPLETE')
    expect(repetido.statusCode).toBe(400)
  })

  it('recusa produto de outra categoria no meio da lista', async () => {
    const { categoria, ids } = await categoriaComTres()
    const intruso = (await categoriaComTres()).ids[0] ?? ''

    const r = await chamar('PUT', '/products/order', {
      categoryId: categoria.id,
      ids: [...ids, intruso],
    })

    expect(r.statusCode).toBe(400)
    expect(codigo(r)).toBe('ORDER_INCOMPLETE')
  })

  it('no banco, a ordem só alcança os produtos da categoria informada', async () => {
    // A segunda barreira: o serviço já recusa a lista com um intruso, mas a
    // consulta também não move produto de outra categoria.
    const { categoria } = await categoriaComTres()
    const intruso = (await categoriaComTres()).ids[0] ?? ''

    const atualizadas = await withTenant(tenantContextFromUser(dono.tenantId), (tx) =>
      reorderProducts(tx, categoria.id, [intruso]),
    )

    expect(atualizadas).toBe(0)
  })

  it('categoria inexistente responde 404', async () => {
    const r = await chamar('PUT', '/products/order', {
      categoryId: '01a0d928-0000-7000-8000-000000000000',
      ids: ['01a0d928-0000-7000-8000-000000000001'],
    })

    expect(r.statusCode).toBe(404)
  })

  it('quem só lê não reordena', async () => {
    const { categoria, ids } = await categoriaComTres()

    const r = await chamar(
      'PUT',
      '/products/order',
      { categoryId: categoria.id, ids },
      tokenDoAtendente,
    )

    expect(r.statusCode).toBe(403)
  })
})

describe('produtos', () => {
  it('cria com preço em centavos e devolve imageUrl nula', async () => {
    const categoria = await novaCategoria()
    const produto = await novoProduto(categoria.id, { priceInCents: 3490 })

    expect(produto).toMatchObject({ priceInCents: 3490, isAvailable: true, imageUrl: null })
  })

  it('recusa preço com casas decimais — o valor é em centavos', async () => {
    const categoria = await novaCategoria()
    const r = await chamar('POST', '/products', {
      categoryId: categoria.id,
      name: 'X-Salada',
      priceInCents: 25.9,
    })

    expect(r.statusCode).toBe(400)
  })

  it('recusa preço negativo e preço absurdo', async () => {
    const categoria = await novaCategoria()
    const base = { categoryId: categoria.id, name: 'X' }

    expect((await chamar('POST', '/products', { ...base, priceInCents: -1 })).statusCode).toBe(400)
    // Um zero a mais digitado sem querer: R$ 259.000,00 por um lanche.
    expect(
      (await chamar('POST', '/products', { ...base, priceInCents: 25_900_000 })).statusCode,
    ).toBe(400)
  })

  it('aceita produto grátis', async () => {
    const categoria = await novaCategoria()

    expect((await novoProduto(categoria.id, { priceInCents: 0 })).priceInCents).toBe(0)
  })

  it('recusa categoria inexistente com 404', async () => {
    const r = await chamar('POST', '/products', {
      categoryId: '01a0d928-0000-7000-8000-000000000000',
      name: 'Órfão',
      priceInCents: 100,
    })

    expect(r.statusCode).toBe(404)
  })

  it('filtra por categoria', async () => {
    const a = await novaCategoria()
    const b = await novaCategoria()
    await novoProduto(a.id)
    await novoProduto(b.id)

    const r = await chamar('GET', `/products?categoryId=${a.id}`)

    expect(r.json<Produto[]>().every((p) => p.categoryId === a.id)).toBe(true)
  })

  it('move o produto de categoria', async () => {
    const origem = await novaCategoria()
    const destino = await novaCategoria()
    const produto = await novoProduto(origem.id)

    const r = await chamar('PATCH', `/products/${produto.id}`, { categoryId: destino.id })

    expect(r.json<Produto>().categoryId).toBe(destino.id)
  })

  it('movido sem dizer a posição, entra no fim da categoria nova', async () => {
    const origem = await novaCategoria()
    const destino = await novaCategoria()
    // Na origem ele é o primeiro (posição 0); no destino já há dois, em 0 e 10.
    const movido = await novoProduto(origem.id)
    const [primeiro, segundo] = [await novoProduto(destino.id), await novoProduto(destino.id)]

    await chamar('PATCH', `/products/${movido.id}`, { categoryId: destino.id })

    const ordem = (await chamar('GET', `/products?categoryId=${destino.id}`))
      .json<Produto[]>()
      .map((p) => p.id)
    expect(ordem).toEqual([primeiro?.id, segundo?.id, movido.id])
  })

  it('movido dizendo a posição, fica onde foi pedido', async () => {
    const origem = await novaCategoria()
    const destino = await novaCategoria()
    const movido = await novoProduto(origem.id)
    const outro = await novoProduto(destino.id, { sortOrder: 50 })

    await chamar('PATCH', `/products/${movido.id}`, { categoryId: destino.id, sortOrder: 0 })

    const ordem = (await chamar('GET', `/products?categoryId=${destino.id}`))
      .json<Produto[]>()
      .map((p) => p.id)
    expect(ordem).toEqual([movido.id, outro.id])
  })

  it('alterar outro campo não mexe na posição', async () => {
    const categoria = await novaCategoria()
    const produto = await novoProduto(categoria.id, { sortOrder: 30 })

    const r = await chamar('PATCH', `/products/${produto.id}`, {
      categoryId: categoria.id,
      name: 'Renomeado',
    })

    expect(r.json<{ sortOrder: number }>().sortOrder).toBe(30)
  })

  it('exclui o produto', async () => {
    const categoria = await novaCategoria()
    const produto = await novoProduto(categoria.id)

    expect((await chamar('DELETE', `/products/${produto.id}`)).statusCode).toBe(204)
    expect((await chamar('GET', `/products/${produto.id}`)).statusCode).toBe(404)
  })
})

describe('auditoria de preço e disponibilidade', () => {
  it('troca de preço gera registro próprio com o antes e o depois', async () => {
    const categoria = await novaCategoria()
    const produto = await novoProduto(categoria.id, { priceInCents: 2590 })

    await chamar('PATCH', `/products/${produto.id}`, { priceInCents: 2890 })

    const registro = (await acoesAuditadas())
      .filter((a) => a.action === 'product.price_changed')
      .at(-1)
    expect(registro?.metadata).toEqual({ de: 2590, para: 2890 })
  })

  it('marcar como esgotado gera registro próprio', async () => {
    const categoria = await novaCategoria()
    const produto = await novoProduto(categoria.id)

    await chamar('PATCH', `/products/${produto.id}`, { isAvailable: false })

    const registro = (await acoesAuditadas())
      .filter((a) => a.action === 'product.availability_changed')
      .at(-1)
    expect(registro?.metadata).toEqual({ de: true, para: false })
  })

  it('alterar só a descrição não registra troca de preço', async () => {
    const categoria = await novaCategoria()
    const produto = await novoProduto(categoria.id)
    const antes = (await acoesAuditadas()).filter((a) => a.action === 'product.price_changed')

    await chamar('PATCH', `/products/${produto.id}`, { description: 'Nova descrição' })

    const depois = (await acoesAuditadas()).filter((a) => a.action === 'product.price_changed')
    expect(depois).toHaveLength(antes.length)
  })
})

describe('imagem do produto', () => {
  function enviarImagem(url: string) {
    const { payload, headers } = corpoMultipart(PNG)
    return app.inject({
      method: 'PUT',
      url: `/api/v1/admin${url}`,
      payload,
      headers: { ...headers, authorization: `Bearer ${token}` },
    })
  }

  const chaveDe = (url: string) => new URL(url).pathname.replace(/^\/uploads\//, '')

  it('envia e devolve a URL, dentro do prefixo do estabelecimento', async () => {
    const categoria = await novaCategoria()
    const produto = await novoProduto(categoria.id)

    const r = await enviarImagem(`/products/${produto.id}/image`)

    expect(r.statusCode).toBe(200)
    expect(chaveDe(r.json<Produto>().imageUrl ?? '')).toMatch(
      new RegExp(`^tenants/${dono.tenantId}/products/`),
    )
  })

  it('excluir o produto apaga a imagem do disco', async () => {
    const categoria = await novaCategoria()
    const produto = await novoProduto(categoria.id)
    const url = (await enviarImagem(`/products/${produto.id}/image`)).json<Produto>().imageUrl ?? ''
    expect(await storage.exists(chaveDe(url))).toBe(true)

    await chamar('DELETE', `/products/${produto.id}`)

    expect(await storage.exists(chaveDe(url))).toBe(false)
  })

  it('a categoria também aceita imagem', async () => {
    const categoria = await novaCategoria()

    const r = await enviarImagem(`/categories/${categoria.id}/image`)

    expect(r.json<Categoria>().imageUrl).toMatch(/\/categories\/[0-9a-f-]+\.webp$/)
  })

  it('imagem para produto inexistente responde 404 e não deixa arquivo órfão', async () => {
    const pasta = path.join(storage.diretorioRaiz, 'tenants', dono.tenantId)
    // Tolerante a pasta inexistente: o teste não pode depender de outro ter
    // enviado imagem antes dele.
    const contarArquivos = async () => {
      try {
        const entradas = await readdir(pasta, { recursive: true, withFileTypes: true })
        return entradas.filter((e) => e.isFile()).length
      } catch {
        return 0
      }
    }
    const antes = await contarArquivos()

    const r = await enviarImagem('/products/01a0d928-0000-7000-8000-000000000000/image')

    // O arquivo é gravado antes da transação; quando ela falha, trocarImagem o
    // apaga. Sem isso, cada tentativa com id errado deixaria lixo no disco.
    expect(r.statusCode).toBe(404)
    expect(await contarArquivos()).toBe(antes)
  })
})
