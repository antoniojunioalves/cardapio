import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { atualizarProduto, criarCategoria, criarProduto } from '../src/catalog/service.js'
import { closeDatabase, db } from '../src/db/index.js'
import { paymentMethods, tenants } from '../src/db/schema/index.js'
import { montarChecklist, type SituacaoDoEstabelecimento } from '../src/settings/checklist.js'
import {
  atualizarConfiguracoes,
  definirFormasDePagamento,
  substituirEntrega,
  substituirHorarios,
} from '../src/settings/service.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import {
  criarTenantComUsuario,
  removerTenantDeTeste,
  SENHA_PADRAO,
  type TenantDeTeste,
} from './helpers/fixtures.js'

/** "O que falta para receber pedidos" (Fase 21). */

const PRONTO: SituacaoDoEstabelecimento = {
  status: 'ACTIVE',
  whatsapp: '5511999990000',
  horarios: 7,
  entrega: { deliveryEnabled: true, pickupEnabled: false, feeMode: 'FIXED', regioesAtivas: 0 },
  formasDePagamento: 2,
  produtosAVenda: 5,
}

const pendentes = (situacao: SituacaoDoEstabelecimento) =>
  montarChecklist(situacao)
    .steps.filter((passo) => !passo.done)
    .map((passo) => passo.key)

describe('a lista, passo a passo', () => {
  it('com tudo feito, está pronto para receber pedidos', () => {
    expect(montarChecklist(PRONTO)).toEqual({
      ready: true,
      steps: [
        { key: 'emailConfirmed', done: true },
        { key: 'whatsapp', done: true },
        { key: 'businessHours', done: true },
        { key: 'fulfillment', done: true },
        { key: 'paymentMethods', done: true },
        { key: 'products', done: true },
      ],
    })
  })

  it.each([
    ['emailConfirmed', { status: 'PENDING' }],
    ['whatsapp', { whatsapp: null }],
    ['businessHours', { horarios: 0 }],
    ['paymentMethods', { formasDePagamento: 0 }],
    ['products', { produtosAVenda: 0 }],
  ] as const)('falta só %s', (passo, mudanca) => {
    const situacao = { ...PRONTO, ...mudanca }

    expect(pendentes(situacao)).toEqual([passo])
    expect(montarChecklist(situacao).ready).toBe(false)
  })

  it('suspenso pela plataforma não é "e-mail por confirmar"', () => {
    expect(pendentes({ ...PRONTO, status: 'SUSPENDED' })).toEqual([])
  })

  it('entrega ou retirada: basta uma funcionar', () => {
    const com = (entrega: Partial<SituacaoDoEstabelecimento['entrega']>) =>
      pendentes({ ...PRONTO, entrega: { ...PRONTO.entrega, ...entrega } })

    expect(com({ deliveryEnabled: false, pickupEnabled: true })).toEqual([])
    expect(com({ deliveryEnabled: false, pickupEnabled: false })).toEqual(['fulfillment'])
    // Entrega por região sem região ativa não entrega em lugar nenhum.
    expect(com({ feeMode: 'BY_REGION', regioesAtivas: 0 })).toEqual(['fulfillment'])
    expect(com({ feeMode: 'BY_REGION', regioesAtivas: 2 })).toEqual([])
    expect(com({ feeMode: 'BY_REGION', regioesAtivas: 0, pickupEnabled: true })).toEqual([])
  })
})

describe('GET /api/v1/admin/setup-checklist', () => {
  let app: FastifyInstance
  let novo: TenantDeTeste
  let outro: TenantDeTeste
  let semPermissao: TenantDeTeste
  let token = ''

  const entrar = async (f: TenantDeTeste) =>
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: f.email, password: SENHA_PADRAO },
      })
    ).json<{ accessToken: string }>().accessToken

  const lista = async (comToken = token) =>
    app.inject({
      method: 'GET',
      url: '/api/v1/admin/setup-checklist',
      headers: { authorization: `Bearer ${comToken}` },
    })

  const faltando = async () =>
    (await lista())
      .json<{ steps: { key: string; done: boolean }[] }>()
      .steps.filter((passo) => !passo.done)
      .map((passo) => passo.key)

  beforeAll(async () => {
    app = await buildApp({ rateLimit: false })
    await app.ready()
    novo = await criarTenantComUsuario({ permissoes: ['settings:read'], permissoesReais: true })
    outro = await criarTenantComUsuario()
    semPermissao = await criarTenantComUsuario({
      permissoes: ['orders:read'],
      permissoesReais: true,
    })
    token = await entrar(novo)
  })

  afterAll(async () => {
    await app.close()
    for (const f of [novo, outro, semPermissao]) await removerTenantDeTeste(f)
    await closeDatabase()
  })

  it('exige login e a permissão de ler as configurações', async () => {
    const semLogin = await app.inject({ method: 'GET', url: '/api/v1/admin/setup-checklist' })
    expect(semLogin.statusCode).toBe(401)
    expect((await lista(await entrar(semPermissao))).statusCode).toBe(403)
  })

  it('o estabelecimento recém-criado só tem a entrega pronta, que já nasce habilitada', async () => {
    const resposta = await lista()

    expect(resposta.statusCode, resposta.body).toBe(200)
    expect(resposta.json<{ ready: boolean }>().ready).toBe(false)
    expect(await faltando()).toEqual(['whatsapp', 'businessHours', 'paymentMethods', 'products'])
  })

  it('aguardando a confirmação do e-mail, o primeiro passo fica pendente', async () => {
    await db.update(tenants).set({ status: 'PENDING' }).where(eq(tenants.id, novo.tenantId))
    expect(await faltando()).toContain('emailConfirmed')

    await db.update(tenants).set({ status: 'ACTIVE' }).where(eq(tenants.id, novo.tenantId))
    expect(await faltando()).not.toContain('emailConfirmed')
  })

  it('o cardápio de outro estabelecimento não conta', async () => {
    const ctx = tenantContextFromUser(outro.tenantId)
    const categoria = await criarCategoria(ctx, outro.userId, { name: 'Do outro' })
    await criarProduto(ctx, outro.userId, {
      name: 'Do outro',
      categoryId: categoria.id,
      priceInCents: 1000,
    })

    expect(await faltando()).toContain('products')
  })

  it('cada configuração feita sai da lista, até ficar pronto', async () => {
    const ctx = tenantContextFromUser(novo.tenantId)

    await atualizarConfiguracoes(ctx, novo.userId, { whatsappPhone: '5511999990000' })
    expect(await faltando()).toEqual(['businessHours', 'paymentMethods', 'products'])

    await substituirHorarios(ctx, novo.userId, [
      { dayOfWeek: 1, opensAt: '18:00', closesAt: '23:00' },
    ])
    expect(await faltando()).toEqual(['paymentMethods', 'products'])

    const [pix] = await db.select().from(paymentMethods).where(eq(paymentMethods.code, 'PIX'))
    await definirFormasDePagamento(ctx, novo.userId, [
      { paymentMethodId: pix?.id ?? '', isEnabled: true, sortOrder: 0 },
    ])
    expect(await faltando()).toEqual(['products'])

    // Produto indisponível não é produto à venda.
    const categoria = await criarCategoria(ctx, novo.userId, { name: 'Lanches' })
    const produto = await criarProduto(ctx, novo.userId, {
      name: 'X-Salada',
      categoryId: categoria.id,
      priceInCents: 2500,
      isAvailable: false,
    })
    expect(await faltando()).toEqual(['products'])

    await atualizarProduto(ctx, novo.userId, produto.id, { isAvailable: true })
    expect(await faltando()).toEqual([])
    expect((await lista()).json<{ ready: boolean }>().ready).toBe(true)
  })

  it('desligar a entrega sem ligar a retirada devolve o passo à lista', async () => {
    const ctx = tenantContextFromUser(novo.tenantId)

    await substituirEntrega(ctx, novo.userId, {
      configuracao: { deliveryEnabled: true, pickupEnabled: false, feeMode: 'BY_REGION' },
      regioes: [],
    })

    expect(await faltando()).toEqual(['fulfillment'])
  })
})
