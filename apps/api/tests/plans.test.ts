import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { criarCategoria, criarProduto } from '../src/catalog/service.js'
import { closeDatabase, db } from '../src/db/index.js'
import {
  orders,
  paymentMethods,
  planFeatures,
  plans,
  subscriptions,
} from '../src/db/schema/index.js'
import { cabeMaisUmUsuario, situacaoDosPedidos } from '../src/plans/limits.js'
import {
  definirFormasDePagamento,
  substituirEntrega,
  substituirHorarios,
} from '../src/settings/service.js'
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
  ).json<{ plan: { name: string }; orders: { used: number; state: string; ceiling: number } }>()

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()
  ids.pix = (await db.select().from(paymentMethods)).find((f) => f.code === 'PIX')?.id ?? ''

  // Plano de teste: 2 pedidos por mês — com a tolerância, o teto é 3.
  const [plano] = await db
    .insert(plans)
    .values({ code: `TESTE_${randomUUID().slice(0, 8)}`, name: 'Plano de teste' })
    .returning({ id: plans.id })
  planoId = plano?.id ?? ''
  await db.insert(planFeatures).values([
    { planId: planoId, key: 'maxOrdersPerMonth', limitValue: 2 },
    { planId: planoId, key: 'maxUsers', limitValue: 5 },
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
