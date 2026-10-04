import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { eq } from 'drizzle-orm'

import { closeDatabase, db } from '../src/db/index.js'
import { auditLogs, tenants } from '../src/db/schema/index.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'
import {
  criarTenantComUsuario,
  removerTenantDeTeste,
  SENHA_PADRAO,
  type TenantDeTeste,
} from './helpers/fixtures.js'

let app: FastifyInstance
let dono: TenantDeTeste
let semPermissao: TenantDeTeste
let tokenDoDono = ''
let tokenSemPermissao = ''

async function autenticar(fixture: TenantDeTeste): Promise<string> {
  const resposta = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: fixture.email, password: SENHA_PADRAO },
  })
  return resposta.json<{ accessToken: string }>().accessToken
}

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()

  dono = await criarTenantComUsuario({
    permissoes: ['settings:read', 'settings:update'],
    permissoesReais: true,
  })
  semPermissao = await criarTenantComUsuario({
    permissoes: ['orders:read'],
    permissoesReais: true,
  })

  tokenDoDono = await autenticar(dono)
  tokenSemPermissao = await autenticar(semPermissao)
})

afterAll(async () => {
  await app.close()
  await removerTenantDeTeste(dono)
  await removerTenantDeTeste(semPermissao)
  await closeDatabase()
})

const comoDono = (method: 'GET' | 'PATCH' | 'PUT', url: string, payload?: unknown) =>
  app.inject({
    method,
    url: `/api/v1/admin${url}`,
    headers: { authorization: `Bearer ${tokenDoDono}` },
    ...(payload !== undefined && { payload: payload as object }),
  })

describe('proteção das rotas', () => {
  it('exige autenticação', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/api/v1/admin/settings' })

    expect(resposta.statusCode).toBe(401)
  })

  it('recusa quem está autenticado mas não tem a permissão', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/settings',
      headers: { authorization: `Bearer ${tokenSemPermissao}` },
    })

    expect(resposta.statusCode).toBe(403)
    expect(resposta.json<{ error: { code: string } }>().error.code).toBe('FORBIDDEN')
  })

  it('a resposta do 403 diz qual permissão faltou', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/settings',
      headers: { authorization: `Bearer ${tokenSemPermissao}` },
    })

    expect(resposta.json<{ error: { details: { missing: string[] } } }>().error.details).toEqual({
      required: ['settings:read'],
      missing: ['settings:read'],
    })
  })
})

describe('configurações do estabelecimento', () => {
  it('a primeira leitura cria a linha com os padrões', async () => {
    const resposta = await comoDono('GET', '/settings')

    expect(resposta.statusCode).toBe(200)
    expect(resposta.json()).toMatchObject({
      tenantId: dono.tenantId,
      minimumOrderInCents: 0,
      isAcceptingOrders: true,
    })
  })

  it('altera e devolve o resultado', async () => {
    const resposta = await comoDono('PATCH', '/settings', {
      description: 'Os melhores lanches do bairro',
      minimumOrderInCents: 2500,
      whatsappPhone: '5511988887777',
    })

    expect(resposta.statusCode).toBe(200)
    expect(resposta.json()).toMatchObject({
      description: 'Os melhores lanches do bairro',
      minimumOrderInCents: 2500,
      whatsappPhone: '5511988887777',
    })
  })

  it('traz o nome, o endereço e o fuso do estabelecimento', async () => {
    const [registro] = await db.select().from(tenants).where(eq(tenants.id, dono.tenantId))

    expect((await comoDono('GET', '/settings')).json()).toMatchObject({
      name: registro?.name,
      slug: dono.slug,
      timezone: 'America/Sao_Paulo',
    })
  })

  it('altera o nome e o fuso junto com o resto, e registra o antes e o depois', async () => {
    const antes = (await comoDono('GET', '/settings')).json<{ name: string }>().name

    const resposta = await comoDono('PATCH', '/settings', {
      name: '  Lanchonete Nova  ',
      timezone: 'America/Manaus',
      contactPhone: '(11) 3333-4444',
    })

    expect(resposta.statusCode, resposta.body).toBe(200)
    expect(resposta.json()).toMatchObject({
      name: 'Lanchonete Nova',
      timezone: 'America/Manaus',
      contactPhone: '(11) 3333-4444',
    })
    const [registro] = await db.select().from(tenants).where(eq(tenants.id, dono.tenantId))
    expect(registro).toMatchObject({ name: 'Lanchonete Nova', timezone: 'America/Manaus' })

    const registros = await withTenant(tenantContextFromUser(dono.tenantId), (tx) =>
      tx.select({ action: auditLogs.action, metadata: auditLogs.metadata }).from(auditLogs),
    )
    expect(registros.filter((r) => r.action === 'settings.updated').at(-1)?.metadata).toMatchObject(
      {
        alteracoes: {
          name: { de: antes, para: 'Lanchonete Nova' },
          timezone: { de: 'America/Sao_Paulo', para: 'America/Manaus' },
        },
      },
    )
  })

  it('o nome novo aparece no cardápio de quem entra depois', async () => {
    await comoDono('PATCH', '/settings', { name: 'Nome do Login' })

    const sessao = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: dono.email, password: SENHA_PADRAO },
    })
    expect(sessao.json<{ establishment: { name: string } }>().establishment.name).toBe(
      'Nome do Login',
    )
  })

  it('nome vazio e fuso que não existe são recusados', async () => {
    expect((await comoDono('PATCH', '/settings', { name: '   ' })).statusCode).toBe(400)
    expect((await comoDono('PATCH', '/settings', { timezone: 'Marte/Olimpo' })).statusCode).toBe(
      400,
    )
  })

  it('grava tudo ou nada: um campo inválido não deixa o nome mudar', async () => {
    const antes = (await comoDono('GET', '/settings')).json<{ name: string }>().name

    const resposta = await comoDono('PATCH', '/settings', {
      name: 'Não devia gravar',
      minimumOrderInCents: -1,
    })

    expect(resposta.statusCode).toBe(400)
    expect((await comoDono('GET', '/settings')).json<{ name: string }>().name).toBe(antes)
  })

  it('o endereço do cardápio não muda por esta rota', async () => {
    const resposta = await comoDono('PATCH', '/settings', { slug: 'outro-endereco' })

    expect(resposta.json<{ slug: string }>().slug).toBe(dono.slug)
  })

  it('mudar o nome de um estabelecimento não mexe no de outro', async () => {
    const [antes] = await db.select().from(tenants).where(eq(tenants.id, semPermissao.tenantId))

    await comoDono('PATCH', '/settings', { name: 'Só o meu' })

    const [depois] = await db.select().from(tenants).where(eq(tenants.id, semPermissao.tenantId))
    expect(depois?.name).toBe(antes?.name)
  })

  it('registra na auditoria apenas o que mudou', async () => {
    await comoDono('PATCH', '/settings', { minimumOrderInCents: 3000 })

    const registros = await withTenant(tenantContextFromUser(dono.tenantId), (tx) =>
      tx.select({ action: auditLogs.action, metadata: auditLogs.metadata }).from(auditLogs),
    )
    const ultimo = registros.filter((r) => r.action === 'settings.updated').at(-1)

    expect(ultimo?.metadata).toMatchObject({
      alteracoes: { minimumOrderInCents: { de: 2500, para: 3000 } },
    })
  })

  it('recusa WhatsApp com máscara — o link wa.me só aceita dígitos', async () => {
    const resposta = await comoDono('PATCH', '/settings', { whatsappPhone: '(11) 98888-7777' })

    expect(resposta.statusCode).toBe(400)
  })

  it('recusa tempo de preparo invertido', async () => {
    const resposta = await comoDono('PATCH', '/settings', {
      prepTimeMinMinutes: 60,
      prepTimeMaxMinutes: 20,
    })

    expect(resposta.statusCode).toBe(400)
  })

  it('recusa pedido mínimo negativo', async () => {
    expect((await comoDono('PATCH', '/settings', { minimumOrderInCents: -1 })).statusCode).toBe(400)
  })
})

describe('horário de funcionamento', () => {
  it('substitui a semana inteira', async () => {
    const resposta = await comoDono('PUT', '/business-hours', {
      intervalos: [
        { dayOfWeek: 1, opensAt: '11:00', closesAt: '14:30' },
        { dayOfWeek: 1, opensAt: '18:00', closesAt: '23:00' },
      ],
    })

    expect(resposta.statusCode).toBe(200)
    expect(resposta.json<unknown[]>()).toHaveLength(2)
  })

  it('a substituição realmente remove o que havia antes', async () => {
    await comoDono('PUT', '/business-hours', {
      intervalos: [{ dayOfWeek: 3, opensAt: '09:00', closesAt: '17:00' }],
    })

    const resposta = await comoDono('GET', '/business-hours')
    const horarios = resposta.json<{ dayOfWeek: number }[]>()

    expect(horarios).toHaveLength(1)
    expect(horarios[0]?.dayOfWeek).toBe(3)
  })

  it('aceita intervalo que atravessa a meia-noite', async () => {
    const resposta = await comoDono('PUT', '/business-hours', {
      intervalos: [{ dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00' }],
    })

    expect(resposta.statusCode).toBe(200)
  })

  it('recusa abertura igual ao fechamento', async () => {
    const resposta = await comoDono('PUT', '/business-hours', {
      intervalos: [{ dayOfWeek: 1, opensAt: '10:00', closesAt: '10:00' }],
    })

    expect(resposta.statusCode).toBe(400)
  })

  it('recusa intervalos sobrepostos no mesmo dia', async () => {
    const resposta = await comoDono('PUT', '/business-hours', {
      intervalos: [
        { dayOfWeek: 2, opensAt: '11:00', closesAt: '14:00' },
        { dayOfWeek: 2, opensAt: '13:00', closesAt: '18:00' },
      ],
    })

    expect(resposta.statusCode).toBe(400)
  })

  it('aceita o mesmo horário em dias diferentes', async () => {
    const resposta = await comoDono('PUT', '/business-hours', {
      intervalos: [
        { dayOfWeek: 1, opensAt: '11:00', closesAt: '14:00' },
        { dayOfWeek: 2, opensAt: '11:00', closesAt: '14:00' },
      ],
    })

    expect(resposta.statusCode).toBe(200)
  })

  it('recusa dia da semana fora da faixa', async () => {
    const resposta = await comoDono('PUT', '/business-hours', {
      intervalos: [{ dayOfWeek: 7, opensAt: '11:00', closesAt: '14:00' }],
    })

    expect(resposta.statusCode).toBe(400)
  })
})

describe('status do estabelecimento', () => {
  it('sem horário cadastrado informa o motivo', async () => {
    await comoDono('PUT', '/business-hours', { intervalos: [] })

    expect((await comoDono('GET', '/status')).json()).toEqual({
      aberto: false,
      motivo: 'SEM_HORARIO_CADASTRADO',
    })
  })

  it('a pausa manual vence o horário cadastrado', async () => {
    await comoDono('PUT', '/business-hours', {
      intervalos: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        dayOfWeek,
        opensAt: '00:00',
        closesAt: '23:59',
      })),
    })
    await comoDono('PATCH', '/settings', { isAcceptingOrders: false })

    expect((await comoDono('GET', '/status')).json()).toEqual({
      aberto: false,
      motivo: 'PAUSADO',
    })

    await comoDono('PATCH', '/settings', { isAcceptingOrders: true })
  })
})

describe('entrega', () => {
  it('nasce com entrega e retirada desligadas: é o dono quem escolhe', async () => {
    const resposta = await comoDono('GET', '/delivery')

    expect(resposta.statusCode).toBe(200)
    expect(resposta.json()).toMatchObject({
      configuracao: { deliveryEnabled: false, pickupEnabled: false, feeMode: 'FIXED' },
      regioes: [],
    })
  })

  it('salva configuração e regiões numa chamada', async () => {
    const resposta = await comoDono('PUT', '/delivery', {
      configuracao: {
        deliveryEnabled: true,
        pickupEnabled: true,
        feeMode: 'BY_REGION',
        fixedFeeInCents: 0,
        estimatedMinMinutes: 30,
        estimatedMaxMinutes: 60,
      },
      regioes: [
        { name: 'Centro', feeInCents: 500, isActive: true, sortOrder: 0 },
        { name: 'Vila Nova', feeInCents: 1000, isActive: true, sortOrder: 10 },
      ],
    })

    expect(resposta.statusCode).toBe(200)
    const corpo = resposta.json<{ configuracao: { feeMode: string }; regioes: unknown[] }>()
    expect(corpo.configuracao.feeMode).toBe('BY_REGION')
    expect(corpo.regioes).toHaveLength(2)
  })

  it('recusa modo por região sem nenhuma região ativa', async () => {
    const resposta = await comoDono('PUT', '/delivery', {
      configuracao: {
        deliveryEnabled: true,
        pickupEnabled: false,
        feeMode: 'BY_REGION',
        fixedFeeInCents: 0,
      },
      regioes: [],
    })

    // Salvar assim deixaria o checkout sem opção de entrega selecionável.
    expect(resposta.statusCode).toBe(400)
  })

  it('recusa desabilitar entrega e retirada ao mesmo tempo', async () => {
    const resposta = await comoDono('PUT', '/delivery', {
      configuracao: {
        deliveryEnabled: false,
        pickupEnabled: false,
        feeMode: 'FIXED',
        fixedFeeInCents: 0,
      },
      regioes: [],
    })

    expect(resposta.statusCode).toBe(400)
  })

  it('recusa regiões com nome repetido', async () => {
    const resposta = await comoDono('PUT', '/delivery', {
      configuracao: {
        deliveryEnabled: true,
        pickupEnabled: true,
        feeMode: 'BY_REGION',
        fixedFeeInCents: 0,
      },
      regioes: [
        { name: 'Centro', feeInCents: 500, isActive: true, sortOrder: 0 },
        { name: 'centro', feeInCents: 900, isActive: true, sortOrder: 1 },
      ],
    })

    expect(resposta.statusCode).toBe(400)
  })

  it('recusa tempo de entrega invertido', async () => {
    const resposta = await comoDono('PUT', '/delivery', {
      configuracao: {
        deliveryEnabled: true,
        pickupEnabled: true,
        feeMode: 'FIXED',
        fixedFeeInCents: 500,
        estimatedMinMinutes: 60,
        estimatedMaxMinutes: 30,
      },
      regioes: [],
    })

    expect(resposta.statusCode).toBe(400)
  })

  it('recusa taxa negativa', async () => {
    const resposta = await comoDono('PUT', '/delivery', {
      configuracao: {
        deliveryEnabled: true,
        pickupEnabled: true,
        feeMode: 'FIXED',
        fixedFeeInCents: -100,
      },
      regioes: [],
    })

    expect(resposta.statusCode).toBe(400)
  })
})

describe('formas de pagamento', () => {
  it('lista o catálogo com o que este estabelecimento habilitou', async () => {
    const resposta = await comoDono('GET', '/payment-methods')

    expect(resposta.statusCode).toBe(200)
    const formas = resposta.json<{ code: string; isEnabled: boolean }[]>()

    expect(formas.length).toBeGreaterThan(0)
    // Nenhuma vem habilitada por padrão: quem escolhe é o lojista.
    expect(formas.every((f) => !f.isEnabled)).toBe(true)
  })

  it('habilita as escolhidas e mantém as demais desligadas', async () => {
    const catalogo = (await comoDono('GET', '/payment-methods')).json<
      { id: string; code: string }[]
    >()
    const pix = catalogo.find((f) => f.code === 'PIX')
    const dinheiro = catalogo.find((f) => f.code === 'CASH')
    expect(pix && dinheiro).toBeTruthy()

    const resposta = await comoDono('PUT', '/payment-methods', {
      formas: [
        { paymentMethodId: pix?.id, isEnabled: true, sortOrder: 0 },
        { paymentMethodId: dinheiro?.id, isEnabled: true, sortOrder: 10 },
      ],
    })

    expect(resposta.statusCode).toBe(200)
    const habilitadas = resposta
      .json<{ code: string; isEnabled: boolean }[]>()
      .filter((f) => f.isEnabled)
      .map((f) => f.code)
      .sort()

    expect(habilitadas).toEqual(['CASH', 'PIX'])
  })

  it('desabilitar preserva a linha, para não perder a ordenação', async () => {
    const catalogo = (await comoDono('GET', '/payment-methods')).json<
      { id: string; code: string }[]
    >()
    const pix = catalogo.find((f) => f.code === 'PIX')

    await comoDono('PUT', '/payment-methods', {
      formas: [{ paymentMethodId: pix?.id, isEnabled: false, sortOrder: 42 }],
    })

    const depois = (await comoDono('GET', '/payment-methods')).json<
      { code: string; isEnabled: boolean; sortOrder: number }[]
    >()
    const linhaDoPix = depois.find((f) => f.code === 'PIX')

    expect(linhaDoPix).toMatchObject({ isEnabled: false, sortOrder: 42 })
  })
})
