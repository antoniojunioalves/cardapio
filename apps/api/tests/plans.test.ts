import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { insertProduct } from '../src/catalog/repository.js'
import {
  criarCategoria,
  criarProduto,
  excluirCategoria,
  excluirProduto,
} from '../src/catalog/service.js'
import { PLANOS } from '../src/db/catalogs.js'
import { closeDatabase, db } from '../src/db/index.js'
import {
  orders,
  paymentMethods,
  planFeatures,
  plans,
  subscriptions,
} from '../src/db/schema/index.js'
import { cabeMaisUm, cabeMaisUmUsuario, situacaoDosPedidos } from '../src/plans/limits.js'
import { exigirVagaNoCardapio } from '../src/plans/service.js'
import {
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

describe('limite de pedidos', () => {
  it('avisa a partir de 80%, tolera 10% acima do limite e só então bloqueia', () => {
    const situacao = (usados: number) => situacaoDosPedidos(usados, 100).situacao

    expect(situacao(79)).toBe('LIVRE')
    expect(situacao(80)).toBe('PERTO_DO_LIMITE')
    expect(situacao(100)).toBe('NA_TOLERANCIA')
    expect(situacao(109)).toBe('NA_TOLERANCIA')
    expect(situacao(110)).toBe('BLOQUEADO')
    expect(situacaoDosPedidos(0, 100).teto).toBe(110)
  })

  it('ilimitado nunca bloqueia; limite zero (recurso desligado) bloqueia já', () => {
    expect(situacaoDosPedidos(1_000_000, null).situacao).toBe('LIVRE')
    expect(situacaoDosPedidos(0, 0).situacao).toBe('BLOQUEADO')
  })

  it('usuários: limite exato, sem tolerância', () => {
    expect(cabeMaisUmUsuario(1, 2)).toBe(true)
    expect(cabeMaisUmUsuario(2, 2)).toBe(false)
    expect(cabeMaisUmUsuario(500, null)).toBe(true)
  })

  it('produtos e categorias: limite exato, sem tolerância', () => {
    expect(cabeMaisUm(19, 20)).toBe(true)
    expect(cabeMaisUm(20, 20)).toBe(false)
    expect(cabeMaisUm(0, 0)).toBe(false)
    expect(cabeMaisUm(5000, null)).toBe(true)
  })

  it('o plano gratuito limita a 20 produtos e 10 categorias; o Premium, não', () => {
    const limitesDe = (codigo: string) =>
      Object.fromEntries(
        (PLANOS.find((p) => p.code === codigo)?.features ?? []).map((f) => [f.key, f.limitValue]),
      )

    expect(limitesDe('FREE')).toMatchObject({ maxProducts: 20, maxCategories: 10 })
    expect(limitesDe('PREMIUM')).toMatchObject({ maxProducts: null, maxCategories: null })
  })
})

// --- Ponta a ponta -------------------------------------------------------------

let app: FastifyInstance
let lanchonete: TenantDeTeste
let semAssinatura: TenantDeTeste
let token = ''
let planoId = ''
const ids: Record<string, string> = {}

const SEMPRE_ABERTO = [0, 1, 2, 3, 4, 5, 6].flatMap((dayOfWeek) => [
  { dayOfWeek, opensAt: '00:00', closesAt: '12:00' },
  { dayOfWeek, opensAt: '12:00', closesAt: '00:00' },
])

async function montarLoja(f: TenantDeTeste): Promise<string> {
  const ctx = tenantContextFromUser(f.tenantId)
  await substituirHorarios(ctx, f.userId, SEMPRE_ABERTO)
  await substituirEntrega(ctx, f.userId, {
    configuracao: { deliveryEnabled: false, pickupEnabled: true },
    regioes: [],
  })
  await definirFormasDePagamento(ctx, f.userId, [
    { paymentMethodId: ids.pix ?? '', isEnabled: true, sortOrder: 0 },
  ])
  const categoria = await criarCategoria(ctx, f.userId, { name: 'Itens' })
  return (
    await criarProduto(ctx, f.userId, { name: 'X', categoryId: categoria.id, priceInCents: 1000 })
  ).id
}

const pedir = (f: TenantDeTeste, produto: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/public/${f.slug}/orders`,
    payload: {
      idempotencyKey: randomUUID(),
      customer: { phone: '(11) 98765-4321', name: 'Maria' },
      fulfillment: 'PICKUP',
      address: null,
      deliveryRegionId: null,
      paymentMethodId: ids.pix,
      changeForInCents: null,
      notes: null,
      items: [{ productId: produto, quantity: 1, notes: null, options: {} }],
      expectedTotalInCents: 1000,
    },
  })

const statusDoCardapio = async (f: TenantDeTeste) =>
  (await app.inject({ method: 'GET', url: `/api/v1/public/${f.slug}/menu` })).json<{
    status: { aberto: boolean; motivo?: string }
  }>().status

const uso = async () =>
  (
    await app.inject({
      method: 'GET',
      url: '/api/v1/admin/plan',
      headers: { authorization: `Bearer ${token}` },
    })
  ).json<{
    plan: { name: string }
    orders: { used: number; state: string; ceiling: number }
    products: { used: number; limit: number | null }
    categories: { used: number; limit: number | null }
  }>()

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()
  ids.pix = (await db.select().from(paymentMethods)).find((f) => f.code === 'PIX')?.id ?? ''

  // Plano de teste: 2 pedidos por mês — com a tolerância, o teto é 3 —, e um
  // cardápio de até 4 produtos em 2 categorias.
  const [plano] = await db
    .insert(plans)
    .values({ code: `TESTE_${randomUUID().slice(0, 8)}`, name: 'Plano de teste' })
    .returning({ id: plans.id })
  planoId = plano?.id ?? ''
  await db.insert(planFeatures).values([
    { planId: planoId, key: 'maxOrdersPerMonth', limitValue: 2 },
    { planId: planoId, key: 'maxUsers', limitValue: 5 },
    { planId: planoId, key: 'maxProducts', limitValue: 4 },
    { planId: planoId, key: 'maxCategories', limitValue: 2 },
  ])

  lanchonete = await criarTenantComUsuario()
  semAssinatura = await criarTenantComUsuario()
  await withTenant(tenantContextFromUser(lanchonete.tenantId), (tx) =>
    tx.insert(subscriptions).values({ tenantId: lanchonete.tenantId, planId: planoId }),
  )
  ids.produto = await montarLoja(lanchonete)
  ids.produtoSemAssinatura = await montarLoja(semAssinatura)

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: lanchonete.email, password: SENHA_PADRAO },
  })
  token = login.json<{ accessToken: string }>().accessToken
})

afterAll(async () => {
  await app.close()
  for (const f of [lanchonete, semAssinatura]) await removerTenantDeTeste(f)
  await db.delete(plans).where(eq(plans.id, planoId))
  await closeDatabase()
})

describe('limite de pedidos do plano, de ponta a ponta', () => {
  it('passada a tolerância, o cardápio para de receber pedidos sem citar o plano', async () => {
    const produto = ids.produto ?? ''

    expect((await pedir(lanchonete, produto)).statusCode).toBe(201)
    // Com limite 2, os 80% arredondam para o próprio limite: 1 pedido ainda é livre.
    expect((await uso()).orders.state).toBe('LIVRE')
    expect((await pedir(lanchonete, produto)).statusCode).toBe(201)
    expect((await uso()).orders.state).toBe('NA_TOLERANCIA')
    // Terceiro pedido ainda entra: é a tolerância.
    expect((await pedir(lanchonete, produto)).statusCode).toBe(201)

    const agora = await uso()
    expect(agora.orders).toMatchObject({ used: 3, ceiling: 3, state: 'BLOQUEADO' })
    expect(agora.plan.name).toBe('Plano de teste')

    const cardapio = await app.inject({
      method: 'GET',
      url: `/api/v1/public/${lanchonete.slug}/menu`,
    })
    expect(cardapio.json<{ status: unknown }>().status).toEqual({
      aberto: false,
      motivo: 'NAO_RECEBENDO',
    })
    expect(cardapio.body.toLowerCase()).not.toMatch(/plano|limite/)

    const recusado = await pedir(lanchonete, produto)
    expect(recusado.statusCode).toBe(422)
    expect(recusado.body).toContain('não está recebendo pedidos pela internet agora')
  })

  it('pedido cancelado continua contando', async () => {
    await withTenant(tenantContextFromUser(lanchonete.tenantId), (tx) =>
      tx.update(orders).set({ status: 'CANCELLED', cancellationReason: 'teste' }),
    )
    expect((await statusDoCardapio(lanchonete)).motivo).toBe('NAO_RECEBENDO')
  })

  it('no mês seguinte, os pedidos do mês anterior não contam', async () => {
    await withTenant(tenantContextFromUser(lanchonete.tenantId), (tx) =>
      tx.update(orders).set({ createdAt: sql`now() - interval '40 days'` }),
    )
    expect((await statusDoCardapio(lanchonete)).aberto).toBe(true)
    expect((await uso()).orders).toMatchObject({ used: 0, state: 'LIVRE' })
  })

  it('sem assinatura ativa, nada é limitado', async () => {
    for (let i = 0; i < 4; i += 1) {
      expect((await pedir(semAssinatura, ids.produtoSemAssinatura ?? '')).statusCode).toBe(201)
    }
    expect((await statusDoCardapio(semAssinatura)).aberto).toBe(true)
  })
})

describe('limite de produtos e categorias do plano', () => {
  const contexto = () => tenantContextFromUser(lanchonete.tenantId)
  const umNome = () => `Item ${randomUUID().slice(0, 8)}`

  const novoProduto = (categoryId: string, extra: { isAvailable?: boolean } = {}) =>
    criarProduto(contexto(), lanchonete.userId, {
      name: umNome(),
      categoryId,
      priceInCents: 500,
      ...extra,
    })

  let categoriaId = ''
  beforeAll(async () => {
    // A loja já nasceu com uma categoria ("Itens") e um produto ("X").
    const [categoria] = await withTenant(contexto(), (tx) =>
      tx.execute<{ id: string }>(sql`select id from categories limit 1`),
    ).then((r) => r.rows)
    categoriaId = categoria?.id ?? ''
  })

  it('o painel mostra quanto do cardápio o plano permite e quanto já foi usado', async () => {
    const agora = await uso()

    expect(agora.products).toEqual({ used: 1, limit: 4 })
    expect(agora.categories).toEqual({ used: 1, limit: 2 })
  })

  it('categoria além do limite é recusada, e excluir uma abre a vaga', async () => {
    const segunda = await criarCategoria(contexto(), lanchonete.userId, { name: umNome() })

    await expect(
      criarCategoria(contexto(), lanchonete.userId, { name: umNome() }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'PLAN_CATEGORY_LIMIT',
      message:
        'O plano Plano de teste permite 2 categorias. ' +
        'Exclua uma categoria para abrir vaga, ou mude de plano.',
    })
    expect((await uso()).categories.used).toBe(2)

    await excluirCategoria(storage, contexto(), lanchonete.userId, segunda.id)
    await expect(
      criarCategoria(contexto(), lanchonete.userId, { name: umNome() }),
    ).resolves.toMatchObject({ id: expect.any(String) as string })
  })

  it('produto além do limite é recusado — o indisponível também conta', async () => {
    await novoProduto(categoriaId)
    const indisponivel = await novoProduto(categoriaId, { isAvailable: false })
    await novoProduto(categoriaId)
    expect((await uso()).products).toEqual({ used: 4, limit: 4 })

    await expect(novoProduto(categoriaId)).rejects.toMatchObject({
      statusCode: 409,
      code: 'PLAN_PRODUCT_LIMIT',
      message:
        'O plano Plano de teste permite 4 produtos. ' +
        'Exclua um produto para abrir vaga, ou mude de plano.',
    })
    expect((await uso()).products.used).toBe(4)

    await excluirProduto(storage, contexto(), lanchonete.userId, indisponivel.id)
    await expect(novoProduto(categoriaId)).resolves.toMatchObject({ categoryId: categoriaId })
  })

  it('duas criações ao mesmo tempo: a segunda espera a primeira e encontra o limite', async () => {
    // Abre exatamente uma vaga.
    const [umQualquer] = await withTenant(contexto(), (tx) =>
      tx.execute<{ id: string }>(sql`select id from products where name <> 'X' limit 1`),
    ).then((r) => r.rows)
    await excluirProduto(storage, contexto(), lanchonete.userId, umQualquer?.id ?? '')
    expect((await uso()).products.used).toBe(3)

    // A primeira criação, parada no meio: conferiu o plano e inseriu, mas ainda
    // não confirmou — a outra transação não enxerga o produto dela.
    let confirmar = () => undefined as void
    const sinal = new Promise<void>((resolve) => {
      confirmar = resolve
    })
    let inseriu = () => undefined as void
    const primeiraInseriu = new Promise<void>((resolve) => {
      inseriu = resolve
    })
    const primeira = withTenant(contexto(), async (tx) => {
      await exigirVagaNoCardapio(tx, contexto(), 'produto')
      await insertProduct(tx, contexto(), {
        name: umNome(),
        categoryId: categoriaId,
        priceInCents: 500,
      })
      inseriu()
      await sinal
    })
    await primeiraInseriu

    // Sem a trava, a segunda contaria 3 de 4 e passaria na hora, furando o limite.
    const segunda = novoProduto(categoriaId).then(
      () => 'criado',
      (erro: { code?: string }) => erro.code,
    )
    const aindaEsperando = await Promise.race([
      segunda,
      new Promise<string>((resolve) => setTimeout(resolve, 200, 'esperando')),
    ])
    // Solta a primeira antes de conferir: se a conferência falhar, a transação
    // dela não fica aberta, segurando a trava dos testes seguintes.
    confirmar()
    await primeira
    expect(aindaEsperando).toBe('esperando')

    expect(await segunda).toBe('PLAN_PRODUCT_LIMIT')
    expect((await uso()).products.used).toBe(4)
  })

  it('os produtos de outro estabelecimento não contam, e sem assinatura nada é limitado', async () => {
    const ctx = tenantContextFromUser(semAssinatura.tenantId)
    const [categoria] = await withTenant(ctx, (tx) =>
      tx.execute<{ id: string }>(sql`select id from categories limit 1`),
    ).then((r) => r.rows)

    for (let i = 0; i < 6; i += 1) {
      await criarProduto(ctx, semAssinatura.userId, {
        name: umNome(),
        categoryId: categoria?.id ?? '',
        priceInCents: 500,
      })
    }
    for (let i = 0; i < 3; i += 1) {
      await criarCategoria(ctx, semAssinatura.userId, { name: umNome() })
    }

    // A lanchonete continua com os 4 dela.
    expect((await uso()).products.used).toBe(4)
  })
})
