import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { definirComposicao } from '../src/catalog/combos.js'
import { criarGrupo, definirGruposDoProduto } from '../src/catalog/option-groups.js'
import { criarCategoria, criarProduto } from '../src/catalog/service.js'
import { closeDatabase, db } from '../src/db/index.js'
import { paymentMethods, tenants, tenantSettings } from '../src/db/schema/index.js'
import type { CardapioPublico, ProdutoPublico } from '../src/public-menu/service.js'
import {
  atualizarConfiguracoes,
  definirFormasDePagamento,
  substituirEntrega,
  substituirHorarios,
} from '../src/settings/service.js'
import { storage } from '../src/storage/index.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'
import {
  criarTenantComUsuario,
  removerTenantDeTeste,
  SENHA_PADRAO,
  type TenantDeTeste,
} from './helpers/fixtures.js'

let app: FastifyInstance
let lanchonete: TenantDeTeste
let pizzaria: TenantDeTeste
let suspenso: TenantDeTeste

const ids = {
  categoriaInativa: '',
  produtoDaCategoriaInativa: '',
  categoriaVazia: '',
  pixId: '',
  dinheiroId: '',
}

const buscar = (slug: string, headers: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url: `/api/v1/public/${slug}/menu`, headers })

async function cardapioDe(slug: string): Promise<CardapioPublico> {
  const resposta = await buscar(slug)
  expect(resposta.statusCode).toBe(200)
  return resposta.json<CardapioPublico>()
}

function produtoChamado(cardapio: CardapioPublico, nome: string): ProdutoPublico {
  const produto = cardapio.categories.flatMap((c) => c.products).find((p) => p.name === nome)
  if (!produto) throw new Error(`produto ${nome} não está no cardápio`)
  return produto
}

/** Todas as chaves de um JSON, em qualquer profundidade. */
function todasAsChaves(valor: unknown, chaves = new Set<string>()): Set<string> {
  if (Array.isArray(valor)) {
    for (const item of valor) todasAsChaves(item, chaves)
  } else if (valor && typeof valor === 'object') {
    for (const [chave, filho] of Object.entries(valor)) {
      chaves.add(chave)
      todasAsChaves(filho, chaves)
    }
  }
  return chaves
}

async function montarLanchonete(fixture: TenantDeTeste): Promise<void> {
  const ctx = tenantContextFromUser(fixture.tenantId)
  const ator = fixture.userId

  await atualizarConfiguracoes(ctx, ator, {
    description: 'Os melhores lanches do bairro',
    whatsappPhone: '5511999990000',
    contactEmail: 'segredo-interno@exemplo.com',
    addressStreet: 'Rua das Flores',
    addressNumber: '123',
    addressCity: 'São Paulo',
    addressState: 'SP',
    minimumOrderInCents: 2000,
  })
  // Chave gravada direto: o upload de verdade é coberto nos testes de imagem.
  await withTenant(ctx, (tx) =>
    tx.update(tenantSettings).set({ logoKey: `tenants/${fixture.tenantId}/logo/x.png` }),
  )

  await substituirHorarios(ctx, ator, [{ dayOfWeek: 2, opensAt: '18:00', closesAt: '02:00' }])

  await substituirEntrega(ctx, ator, {
    configuracao: { deliveryEnabled: true, pickupEnabled: true, feeMode: 'BY_REGION' },
    regioes: [
      { name: 'Centro', feeInCents: 500, isActive: true, sortOrder: 0 },
      { name: 'Zona Rural', feeInCents: 1500, isActive: false, sortOrder: 1 },
    ],
  })

  await definirFormasDePagamento(ctx, ator, [
    { paymentMethodId: ids.pixId, isEnabled: true, sortOrder: 0 },
    { paymentMethodId: ids.dinheiroId, isEnabled: false, sortOrder: 1 },
  ])

  const lanches = await criarCategoria(ctx, ator, { name: 'Lanches', sortOrder: 0 })
  const bebidas = await criarCategoria(ctx, ator, { name: 'Bebidas', sortOrder: 1 })
  const inativa = await criarCategoria(ctx, ator, { name: 'Especiais', isActive: false })
  const vazia = await criarCategoria(ctx, ator, { name: 'Sobremesas' })
  ids.categoriaInativa = inativa.id
  ids.categoriaVazia = vazia.id

  const xSalada = await criarProduto(ctx, ator, {
    name: 'X-Salada',
    categoryId: lanches.id,
    priceInCents: 2590,
  })
  await criarProduto(ctx, ator, {
    name: 'X-Bacon',
    categoryId: lanches.id,
    priceInCents: 2990,
    isAvailable: false,
  })
  const pizzaSemTamanho = await criarProduto(ctx, ator, {
    name: 'Lanche no Tamanho',
    categoryId: lanches.id,
    priceInCents: 2000,
  })
  const refri = await criarProduto(ctx, ator, {
    name: 'Refrigerante',
    categoryId: bebidas.id,
    priceInCents: 700,
  })
  const suco = await criarProduto(ctx, ator, {
    name: 'Suco',
    categoryId: bebidas.id,
    priceInCents: 900,
    isAvailable: false,
  })
  const secreto = await criarProduto(ctx, ator, {
    name: 'Lanche Secreto',
    categoryId: inativa.id,
    priceInCents: 5000,
  })
  ids.produtoDaCategoriaInativa = secreto.id

  const adicionais = await criarGrupo(ctx, ator, {
    name: 'Adicionais',
    minSelections: 0,
    maxSelections: 2,
    options: [
      { name: 'Bacon', priceDeltaInCents: 500, isAvailable: false },
      { name: 'Cheddar', priceDeltaInCents: 400, isAvailable: false },
    ],
  })
  const tamanho = await criarGrupo(ctx, ator, {
    name: 'Tamanho',
    minSelections: 1,
    maxSelections: 1,
    options: [
      { name: 'Normal', priceDeltaInCents: 0, isAvailable: false },
      { name: 'Grande', priceDeltaInCents: 600, isAvailable: false },
    ],
  })
  await definirGruposDoProduto(ctx, ator, xSalada.id, [adicionais.id])
  await definirGruposDoProduto(ctx, ator, pizzaSemTamanho.id, [tamanho.id])

  const combo = await criarProduto(ctx, ator, {
    name: 'Combo X-Salada',
    categoryId: lanches.id,
    priceInCents: 2990,
    type: 'COMBO',
  })
  await definirComposicao(ctx, ator, combo.id, [
    { productId: xSalada.id, quantity: 1 },
    { productId: refri.id, quantity: 1 },
  ])

  const comboComSuco = await criarProduto(ctx, ator, {
    name: 'Combo com Suco',
    categoryId: lanches.id,
    priceInCents: 3190,
    type: 'COMBO',
  })
  await definirComposicao(ctx, ator, comboComSuco.id, [
    { productId: xSalada.id, quantity: 1 },
    { productId: suco.id, quantity: 1 },
  ])
}

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()

  const formas = await db.select().from(paymentMethods)
  ids.pixId = formas.find((f) => f.code === 'PIX')?.id ?? ''
  ids.dinheiroId = formas.find((f) => f.code === 'CASH')?.id ?? ''
  expect(ids.pixId && ids.dinheiroId).toBeTruthy()

  lanchonete = await criarTenantComUsuario()
  pizzaria = await criarTenantComUsuario({ permissoes: ['products:read'], permissoesReais: true })
  suspenso = await criarTenantComUsuario()

  await montarLanchonete(lanchonete)

  const ctxPizzaria = tenantContextFromUser(pizzaria.tenantId)
  const pizzas = await criarCategoria(ctxPizzaria, pizzaria.userId, { name: 'Pizzas' })
  await criarProduto(ctxPizzaria, pizzaria.userId, {
    name: 'Calabresa',
    categoryId: pizzas.id,
    priceInCents: 4500,
  })
  await atualizarConfiguracoes(ctxPizzaria, pizzaria.userId, { isAcceptingOrders: false })

  const ctxSuspenso = tenantContextFromUser(suspenso.tenantId)
  const cat = await criarCategoria(ctxSuspenso, suspenso.userId, { name: 'Itens' })
  await criarProduto(ctxSuspenso, suspenso.userId, {
    name: 'Produto',
    categoryId: cat.id,
    priceInCents: 100,
  })
  await db.update(tenants).set({ status: 'SUSPENDED' }).where(eq(tenants.id, suspenso.tenantId))
})

afterAll(async () => {
  await app.close()
  for (const fixture of [lanchonete, pizzaria, suspenso]) await removerTenantDeTeste(fixture)
  await closeDatabase()
})

describe('resolução do estabelecimento', () => {
  it('responde sem login, com o estabelecimento do slug', async () => {
    const cardapio = await cardapioDe(lanchonete.slug)

    expect(cardapio.establishment.slug).toBe(lanchonete.slug)
    expect(cardapio.establishment.description).toBe('Os melhores lanches do bairro')
    expect(cardapio.establishment.whatsappPhone).toBe('5511999990000')
    expect(cardapio.establishment.minimumOrderInCents).toBe(2000)
    expect(cardapio.establishment.timezone).toBe('America/Sao_Paulo')
    expect(cardapio.establishment.address).toMatchObject({
      street: 'Rua das Flores',
      number: '123',
    })
  })

  it('não guarda a resposta em cache — aberto e esgotado mudam a qualquer momento', async () => {
    const resposta = await buscar(lanchonete.slug)
    expect(resposta.headers['cache-control']).toBe('no-cache')
  })

  it('slug inexistente responde 404', async () => {
    const resposta = await buscar('nao-existe-este-estabelecimento')
    expect(resposta.statusCode).toBe(404)
    expect(resposta.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND')
  })

  it('slug em formato impossível responde 404, não 400 nem 500', async () => {
    for (const slug of ['Com-Maiuscula', 'com--dois-hifens', `${'a'.repeat(64)}`, '-inicio']) {
      expect((await buscar(encodeURIComponent(slug))).statusCode, slug).toBe(404)
    }
  })

  it('estabelecimento suspenso recebe exatamente a mesma resposta que um inexistente', async () => {
    const suspensa = await buscar(suspenso.slug)
    const inexistente = await buscar('nao-existe-este-estabelecimento')

    // Tudo igual, menos o requestId, que é único por requisição.
    const semRequestId = (r: typeof suspensa) => {
      const { requestId: _, ...erro } = r.json<{ error: { requestId: string } }>().error
      return erro
    }

    expect(suspensa.statusCode).toBe(404)
    expect(semRequestId(suspensa)).toEqual(semRequestId(inexistente))
  })

  it('um token de outro estabelecimento não muda o tenant — quem decide é o slug', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { tenantSlug: pizzaria.slug, email: pizzaria.email, password: SENHA_PADRAO },
    })
    const token = login.json<{ accessToken: string }>().accessToken
    expect(token).toBeTruthy()

    const resposta = await buscar(lanchonete.slug, { authorization: `Bearer ${token}` })
    const cardapio = resposta.json<CardapioPublico>()

    expect(cardapio.establishment.slug).toBe(lanchonete.slug)
    expect(cardapio.categories.map((c) => c.name)).toContain('Lanches')
  })
})

describe('isolamento entre estabelecimentos', () => {
  it('o cardápio de um não contém nada do outro', async () => {
    const daLanchonete = JSON.stringify(await cardapioDe(lanchonete.slug))
    const daPizzaria = JSON.stringify(await cardapioDe(pizzaria.slug))

    expect(daLanchonete).not.toContain('Calabresa')
    expect(daLanchonete).not.toContain(pizzaria.tenantId)
    expect(daPizzaria).not.toContain('X-Salada')
    expect(daPizzaria).not.toContain('Os melhores lanches')
    expect(daPizzaria).not.toContain(lanchonete.tenantId)
  })

  it('cada um tem o próprio status', async () => {
    expect((await cardapioDe(pizzaria.slug)).status).toEqual({ aberto: false, motivo: 'PAUSADO' })
    expect((await cardapioDe(lanchonete.slug)).status.aberto).toBeTypeOf('boolean')
  })
})

describe('o que a resposta expõe', () => {
  it('não contém nenhum campo interno, em nenhuma profundidade', async () => {
    const chaves = todasAsChaves(await cardapioDe(lanchonete.slug))

    const internos = [
      'tenantId',
      'createdAt',
      'updatedAt',
      'imageKey',
      'logoKey',
      'coverKey',
      'sortOrder',
      'isActive',
      'isAcceptingOrders',
      'contactEmail',
      'categoryId',
      'groupId',
      'productId',
      'passwordHash',
    ]
    expect(internos.filter((c) => chaves.has(c))).toEqual([])
  })

  it('não contém o e-mail interno do estabelecimento', async () => {
    const resposta = await buscar(lanchonete.slug)
    expect(resposta.body).not.toContain('segredo-interno@exemplo.com')
  })

  it('imagens saem como URL pública, nunca como chave de storage', async () => {
    const { establishment } = await cardapioDe(lanchonete.slug)
    expect(establishment.logoUrl).toBe(
      storage.publicUrl(`tenants/${lanchonete.tenantId}/logo/x.png`),
    )
    expect(establishment.coverUrl).toBeNull()
  })

  it('só as formas de pagamento habilitadas', async () => {
    const { paymentMethods: formas } = await cardapioDe(lanchonete.slug)
    expect(formas.map((f) => f.code)).toEqual(['PIX'])
  })

  it('entrega por região: só regiões ativas, e sem taxa fixa', async () => {
    const { delivery } = await cardapioDe(lanchonete.slug)

    expect(delivery.feeMode).toBe('BY_REGION')
    expect(delivery.fixedFeeInCents).toBeNull()
    expect(delivery.regions.map((r) => r.name)).toEqual(['Centro'])
    expect(delivery.pickupEnabled).toBe(true)
  })

  it('os horários cadastrados, para o cliente saber quando voltar', async () => {
    const { hours } = await cardapioDe(lanchonete.slug)
    expect(hours).toEqual([{ dayOfWeek: 2, opensAt: '18:00:00', closesAt: '02:00:00' }])
  })
})

describe('o cardápio', () => {
  it('categorias ativas com produto, na ordem cadastrada', async () => {
    const { categories } = await cardapioDe(lanchonete.slug)
    expect(categories.map((c) => c.name)).toEqual(['Lanches', 'Bebidas'])
  })

  it('categoria inativa some, com os produtos dela', async () => {
    const texto = JSON.stringify(await cardapioDe(lanchonete.slug))
    expect(texto).not.toContain(ids.categoriaInativa)
    expect(texto).not.toContain(ids.produtoDaCategoriaInativa)
    expect(texto).not.toContain('Lanche Secreto')
  })

  it('categoria ativa sem produto não aparece', async () => {
    expect(JSON.stringify(await cardapioDe(lanchonete.slug))).not.toContain(ids.categoriaVazia)
  })

  it('produto esgotado aparece, marcado como indisponível', async () => {
    const cardapio = await cardapioDe(lanchonete.slug)
    expect(produtoChamado(cardapio, 'X-Bacon').isAvailable).toBe(false)
    expect(produtoChamado(cardapio, 'X-Salada').isAvailable).toBe(true)
  })

  it('grupos de opção vêm com as opções, e opção esgotada aparece marcada', async () => {
    const xSalada = produtoChamado(await cardapioDe(lanchonete.slug), 'X-Salada')

    expect(xSalada.optionGroups).toHaveLength(1)
    expect(xSalada.optionGroups[0]).toMatchObject({
      name: 'Adicionais',
      minSelections: 0,
      maxSelections: 2,
      isRequired: false,
    })
    expect(xSalada.optionGroups[0]?.options.map((o) => [o.name, o.isAvailable])).toEqual([
      ['Bacon', false],
      ['Cheddar', false],
    ])
  })

  it('adicionais esgotados não tiram o lanche do cardápio', async () => {
    expect(produtoChamado(await cardapioDe(lanchonete.slug), 'X-Salada').isAvailable).toBe(true)
  })

  it('grupo obrigatório com todas as opções esgotadas torna o produto indisponível', async () => {
    const produto = produtoChamado(await cardapioDe(lanchonete.slug), 'Lanche no Tamanho')
    expect(produto.optionGroups[0]?.isRequired).toBe(true)
    expect(produto.isAvailable).toBe(false)
  })

  it('combo traz os componentes e o preço avulso, para mostrar a economia', async () => {
    const combo = produtoChamado(await cardapioDe(lanchonete.slug), 'Combo X-Salada')

    expect(combo.type).toBe('COMBO')
    expect(combo.priceInCents).toBe(2990)
    expect(combo.isAvailable).toBe(true)
    expect(combo.combo).toEqual({
      items: [
        { name: 'X-Salada', quantity: 1 },
        { name: 'Refrigerante', quantity: 1 },
      ],
      precoAvulsoEmCentavos: 2590 + 700,
    })
  })

  it('combo com componente esgotado fica indisponível', async () => {
    const combo = produtoChamado(await cardapioDe(lanchonete.slug), 'Combo com Suco')
    expect(combo.isAvailable).toBe(false)
  })

  it('produto simples não tem bloco de combo', async () => {
    expect(produtoChamado(await cardapioDe(lanchonete.slug), 'X-Salada').combo).toBeNull()
  })
})
