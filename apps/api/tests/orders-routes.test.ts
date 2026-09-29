import { randomUUID } from 'node:crypto'

import type { NovoPedidoEnviado, PedidoCriado, ProblemaDoPedido } from '@repo/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { criarGrupo, definirGruposDoProduto } from '../src/catalog/option-groups.js'
import { atualizarProduto, criarCategoria, criarProduto } from '../src/catalog/service.js'
import { closeDatabase, db } from '../src/db/index.js'
import {
  auditLogs,
  customerAddresses,
  customers,
  orderItemOptions,
  orderItems,
  orders,
  paymentMethods,
  tenants,
} from '../src/db/schema/index.js'
import { LIMITE_DE_PEDIDOS } from '../src/routes/public-orders.js'
import {
  atualizarConfiguracoes,
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

let app: FastifyInstance
let lanchonete: TenantDeTeste
let pizzaria: TenantDeTeste
let fechada: TenantDeTeste
let tokenDaLanchonete = ''
let tokenDaPizzaria = ''

const ids = {
  pix: '',
  dinheiro: '',
  xSalada: '',
  adicionais: '',
  bacon: '',
  cheddar: '',
  refri: '',
  suco: '',
  calabresa: '',
  produtoDaFechada: '',
}

const TELEFONE = '5511987654321'
const ENDERECO = {
  postalCode: '01310-100',
  street: 'Avenida Paulista',
  number: '1000',
  complement: 'apto 5',
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  reference: null,
}

/** Aberto a qualquer hora em que o teste rodar. */
const SEMPRE_ABERTO = [0, 1, 2, 3, 4, 5, 6].flatMap((dayOfWeek) => [
  { dayOfWeek, opensAt: '00:00', closesAt: '12:00' },
  { dayOfWeek, opensAt: '12:00', closesAt: '00:00' },
])

async function entrar(f: TenantDeTeste): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { tenantSlug: f.slug, email: f.email, password: SENHA_PADRAO },
  })
  return r.json<{ accessToken: string }>().accessToken
}

/** X-Salada com bacon (2590 + 500) × 2 = 6180, refrigerante 700, entrega 500: 7380. */
function pedido(extra: Partial<NovoPedidoEnviado> = {}): NovoPedidoEnviado {
  return {
    idempotencyKey: randomUUID(),
    customer: { phone: '(11) 98765-4321', name: 'Maria Oliveira' },
    fulfillment: 'DELIVERY',
    address: { newAddress: ENDERECO },
    deliveryRegionId: null,
    paymentMethodId: ids.pix,
    changeForInCents: null,
    notes: 'Interfone quebrado',
    items: [
      {
        productId: ids.xSalada,
        quantity: 2,
        notes: 'sem cebola',
        options: { [ids.adicionais]: [ids.bacon] },
      },
      { productId: ids.refri, quantity: 1, notes: null, options: {} },
    ],
    expectedTotalInCents: 7380,
    ...extra,
  }
}

const enviar = (slug: string, corpo: unknown) =>
  app.inject({ method: 'POST', url: `/api/v1/public/${slug}/orders`, payload: corpo as object })

async function criar(corpo: NovoPedidoEnviado = pedido()): Promise<PedidoCriado> {
  const resposta = await enviar(lanchonete.slug, corpo)
  expect(resposta.statusCode, resposta.body).toBe(201)
  return resposta.json<PedidoCriado>()
}

const problemasDe = (corpo: string) =>
  (JSON.parse(corpo) as { error: { details: { problemas: ProblemaDoPedido[] } } }).error.details
    .problemas

function admin(method: 'GET' | 'PATCH', url: string, payload?: object, token = tokenDaLanchonete) {
  return app.inject({
    method,
    url: `/api/v1/admin${url}`,
    headers: { authorization: `Bearer ${token}` },
    ...(payload && { payload }),
  })
}

const naLanchonete = <T>(fn: Parameters<typeof withTenant<T>>[1]) =>
  withTenant(tenantContextFromUser(lanchonete.tenantId), fn)

async function montarLanchonete(): Promise<void> {
  const ctx = tenantContextFromUser(lanchonete.tenantId)
  const ator = lanchonete.userId

  await atualizarConfiguracoes(ctx, ator, {
    minimumOrderInCents: 2000,
    whatsappPhone: '5511999990000',
  })
  await substituirHorarios(ctx, ator, SEMPRE_ABERTO)
  await substituirEntrega(ctx, ator, {
    configuracao: {
      deliveryEnabled: true,
      pickupEnabled: true,
      feeMode: 'FIXED',
      fixedFeeInCents: 500,
    },
    regioes: [],
  })
  await definirFormasDePagamento(ctx, ator, [
    { paymentMethodId: ids.pix, isEnabled: true, sortOrder: 0 },
    { paymentMethodId: ids.dinheiro, isEnabled: true, sortOrder: 1 },
  ])

  const lanches = await criarCategoria(ctx, ator, { name: 'Lanches' })
  const xSalada = await criarProduto(ctx, ator, {
    name: 'X-Salada',
    categoryId: lanches.id,
    priceInCents: 2590,
  })
  const refri = await criarProduto(ctx, ator, {
    name: 'Refrigerante',
    categoryId: lanches.id,
    priceInCents: 700,
  })
  const suco = await criarProduto(ctx, ator, {
    name: 'Suco',
    categoryId: lanches.id,
    priceInCents: 900,
    isAvailable: false,
  })
  const adicionais = await criarGrupo(ctx, ator, {
    name: 'Adicionais',
    minSelections: 0,
    maxSelections: 2,
    options: [
      { name: 'Bacon', priceDeltaInCents: 500 },
      { name: 'Cheddar', priceDeltaInCents: 400 },
    ],
  })
  await definirGruposDoProduto(ctx, ator, xSalada.id, [adicionais.id])

  ids.xSalada = xSalada.id
  ids.refri = refri.id
  ids.suco = suco.id
  ids.adicionais = adicionais.id
  ids.bacon = adicionais.options.find((o) => o.name === 'Bacon')?.id ?? ''
  ids.cheddar = adicionais.options.find((o) => o.name === 'Cheddar')?.id ?? ''
}

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()

  const formas = await db.select().from(paymentMethods)
  ids.pix = formas.find((f) => f.code === 'PIX')?.id ?? ''
  ids.dinheiro = formas.find((f) => f.code === 'CASH')?.id ?? ''

  lanchonete = await criarTenantComUsuario({
    permissoes: ['orders:read', 'orders:update'],
    permissoesReais: true,
  })
  pizzaria = await criarTenantComUsuario({ permissoes: ['orders:read'], permissoesReais: true })
  fechada = await criarTenantComUsuario()
  await montarLanchonete()

  const ctxPizzaria = tenantContextFromUser(pizzaria.tenantId)
  const pizzas = await criarCategoria(ctxPizzaria, pizzaria.userId, { name: 'Pizzas' })
  ids.calabresa = (
    await criarProduto(ctxPizzaria, pizzaria.userId, {
      name: 'Calabresa',
      categoryId: pizzas.id,
      priceInCents: 4500,
    })
  ).id

  // Sem horário cadastrado: fechada.
  const ctxFechada = tenantContextFromUser(fechada.tenantId)
  const itens = await criarCategoria(ctxFechada, fechada.userId, { name: 'Itens' })
  ids.produtoDaFechada = (
    await criarProduto(ctxFechada, fechada.userId, {
      name: 'Item',
      categoryId: itens.id,
      priceInCents: 5000,
    })
  ).id
  await definirFormasDePagamento(ctxFechada, fechada.userId, [
    { paymentMethodId: ids.pix, isEnabled: true, sortOrder: 0 },
  ])

  tokenDaLanchonete = await entrar(lanchonete)
  tokenDaPizzaria = await entrar(pizzaria)
})

afterAll(async () => {
  await app.close()
  for (const fixture of [lanchonete, pizzaria, fechada]) await removerTenantDeTeste(fixture)
  await closeDatabase()
})

describe('criar pedido', () => {
  it('recalcula no servidor e guarda tudo copiado', async () => {
    const criado = await criar()

    expect(criado).toMatchObject({
      status: 'RECEIVED',
      fulfillment: 'DELIVERY',
      subtotalInCents: 6880,
      deliveryFeeInCents: 500,
      totalInCents: 7380,
      paymentMethodName: 'Pix',
      items: [
        {
          name: 'X-Salada',
          quantity: 2,
          options: ['Bacon'],
          notes: 'sem cebola',
          totalInCents: 6180,
        },
        { name: 'Refrigerante', quantity: 1, options: [], notes: null, totalInCents: 700 },
      ],
    })

    const [gravado] = await naLanchonete((tx) =>
      tx.select().from(orders).where(eq(orders.number, criado.number)),
    )
    expect(gravado).toMatchObject({
      customerName: 'Maria Oliveira',
      customerPhone: TELEFONE,
      addressPostalCode: '01310100',
      addressStreet: 'Avenida Paulista',
      addressComplement: 'apto 5',
      paymentMethodCode: 'PIX',
      notes: 'Interfone quebrado',
    })

    const opcoes = await naLanchonete((tx) => tx.select().from(orderItemOptions))
    expect(opcoes.map((o) => [o.groupName, o.optionName, o.priceDeltaInCents])).toContainEqual([
      'Adicionais',
      'Bacon',
      500,
    ])
  })

  it('cria o cliente e o endereço no primeiro pedido, e não duplica o endereço depois', async () => {
    await criar()
    await criar()

    const [clientes, enderecos] = await naLanchonete(async (tx) => [
      await tx.select().from(customers).where(eq(customers.phone, TELEFONE)),
      await tx.select().from(customerAddresses),
    ])
    expect(clientes).toHaveLength(1)
    expect(enderecos.filter((e) => e.street === 'Avenida Paulista')).toHaveLength(1)
  })

  it('o número é sequencial por estabelecimento, sem repetir em pedidos simultâneos', async () => {
    const criados = await Promise.all(Array.from({ length: 5 }, () => criar()))
    const numeros = criados.map((c) => c.number).sort((a, b) => a - b)

    expect(new Set(numeros).size).toBe(5)
    expect((numeros.at(-1) ?? 0) - (numeros[0] ?? 0)).toBe(4)
  })

  it('devolve a mensagem do WhatsApp e o link para o número do estabelecimento', async () => {
    const criado = await criar()

    expect(criado.whatsapp.url).toMatch(/^https:\/\/wa\.me\/5511999990000\?text=/)
    expect(decodeURIComponent(criado.whatsapp.url?.split('text=')[1] ?? '')).toBe(
      criado.whatsapp.message,
    )
    // Endereço digitado na hora: sai completo.
    expect(criado.whatsapp.message).toContain(`*Pedido #${String(criado.number)}* —`)
    expect(criado.whatsapp.message).toContain(
      'Avenida Paulista, 1000, apto 5 — Bela Vista, São Paulo',
    )
    expect(criado.whatsapp.message).toContain('CEP 01310-100')
    expect(criado.whatsapp.message).toContain('*Cliente:* Maria Oliveira — (11) 98765-4321')

    // A mensagem fica guardada no pedido.
    const [gravado] = await naLanchonete((tx) =>
      tx.select().from(orders).where(eq(orders.number, criado.number)),
    )
    expect(gravado?.whatsappMessage).toBe(criado.whatsapp.message)
  })

  it('sem WhatsApp cadastrado, a mensagem vem sem link', async () => {
    const ctx = tenantContextFromUser(lanchonete.tenantId)
    await atualizarConfiguracoes(ctx, lanchonete.userId, { whatsappPhone: null })
    try {
      const criado = await criar()
      expect(criado.whatsapp.url).toBeNull()
      expect(criado.whatsapp.message).toContain('*Pedido #')
    } finally {
      await atualizarConfiguracoes(ctx, lanchonete.userId, { whatsappPhone: '5511999990000' })
    }
  })

  it('o mesmo envio repetido devolve o mesmo pedido, sem duplicar', async () => {
    const corpo = pedido()
    const primeiro = await criar(corpo)
    const [segundo, terceiro] = await Promise.all([criar(corpo), criar(corpo)])

    expect(segundo.number).toBe(primeiro.number)
    expect(terceiro.number).toBe(primeiro.number)
    expect(segundo.whatsapp.message).toBe(primeiro.whatsapp.message)
    const gravados = await naLanchonete((tx) =>
      tx.select().from(orders).where(eq(orders.idempotencyKey, corpo.idempotencyKey)),
    )
    expect(gravados).toHaveLength(1)
  })

  it('total diferente do que o cliente viu é recusado, e nada é gravado', async () => {
    const antes = await naLanchonete((tx) => tx.select().from(orders))
    const resposta = await enviar(
      lanchonete.slug,
      pedido({ customer: { phone: '(21) 99999-0000', name: 'Novo' }, expectedTotalInCents: 5000 }),
    )

    expect(resposta.statusCode).toBe(409)
    expect(resposta.json()).toMatchObject({
      error: { code: 'PRICE_CHANGED', details: { totalInCents: 7380 } },
    })
    const [depois, novoCliente] = await naLanchonete(async (tx) => [
      await tx.select().from(orders),
      await tx.select().from(customers).where(eq(customers.phone, '5521999990000')),
    ])
    expect(depois).toHaveLength(antes.length)
    expect(novoCliente).toHaveLength(0)
  })

  it('preço mandado pelo navegador é ignorado', async () => {
    const corpo = pedido()
    const comPreco = {
      ...corpo,
      items: corpo.items.map((i) => ({ ...i, priceInCents: 1, totalInCents: 1 })),
      totalInCents: 1,
    }
    const resposta = await enviar(lanchonete.slug, comPreco)

    expect(resposta.statusCode).toBe(201)
    expect(resposta.json<PedidoCriado>().totalInCents).toBe(7380)
  })

  it('recusa com todos os problemas: esgotado, de outro estabelecimento, opção inválida', async () => {
    const resposta = await enviar(
      lanchonete.slug,
      pedido({
        items: [
          { productId: ids.suco, quantity: 1, notes: null, options: {} },
          { productId: ids.calabresa, quantity: 1, notes: null, options: {} },
          {
            productId: ids.xSalada,
            quantity: 1,
            notes: null,
            options: { [ids.adicionais]: [ids.bacon, ids.bacon] },
          },
        ],
      }),
    )

    expect(resposta.statusCode).toBe(422)
    expect(problemasDe(resposta.body).map((p) => [p.tipo, p.itemIndex])).toEqual([
      ['PRODUTO_INDISPONIVEL', 0],
      ['PRODUTO_INDISPONIVEL', 1],
      ['OPCOES_INVALIDAS', 2],
    ])
  })

  it('abaixo do mínimo é recusado', async () => {
    const resposta = await enviar(
      lanchonete.slug,
      pedido({
        items: [{ productId: ids.refri, quantity: 1, notes: null, options: {} }],
        expectedTotalInCents: 1200,
      }),
    )
    expect(problemasDe(resposta.body).map((p) => p.tipo)).toEqual(['PEDIDO_MINIMO'])
  })

  it('entrega sem endereço é recusada; retirada não precisa', async () => {
    const semEndereco = await enviar(lanchonete.slug, pedido({ address: null }))
    expect(problemasDe(semEndereco.body).map((p) => p.tipo)).toEqual(['ENDERECO_INVALIDO'])

    const retirada = await criar(
      pedido({ fulfillment: 'PICKUP', address: null, expectedTotalInCents: 6880 }),
    )
    expect(retirada.deliveryFeeInCents).toBe(0)
  })

  it('estabelecimento fechado recusa; suspenso ou inexistente responde 404', async () => {
    const corpo = pedido({
      address: null,
      fulfillment: 'PICKUP',
      items: [{ productId: ids.produtoDaFechada, quantity: 1, notes: null, options: {} }],
      expectedTotalInCents: 5000,
    })
    const fechadaResposta = await enviar(fechada.slug, corpo)
    expect(problemasDe(fechadaResposta.body).map((p) => p.tipo)).toContain(
      'ESTABELECIMENTO_FECHADO',
    )

    expect((await enviar('nao-existe-nenhum', corpo)).statusCode).toBe(404)
  })

  it('corpo malformado é recusado antes de qualquer consulta', async () => {
    const resposta = await enviar(lanchonete.slug, { ...pedido(), items: [] })
    expect(resposta.statusCode).toBe(400)
  })
})

describe('endereço salvo', () => {
  async function enderecoDaMaria(): Promise<string> {
    const identificacao = await app.inject({
      method: 'POST',
      url: `/api/v1/public/${lanchonete.slug}/customers/identify`,
      payload: { phone: TELEFONE },
    })
    const id = identificacao.json<{ cliente: { enderecos: { id: string }[] } | null }>().cliente
      ?.enderecos[0]?.id
    if (!id) throw new Error('a Maria deveria ter endereço salvo')
    return id
  }

  it('usa o endereço completo guardado, sem devolvê-lo na resposta', async () => {
    await criar()
    const savedAddressId = await enderecoDaMaria()

    const resposta = await enviar(lanchonete.slug, pedido({ address: { savedAddressId } }))

    expect(resposta.statusCode).toBe(201)
    // O nome da rua sai, mascarado, na mensagem do WhatsApp; o resto não.
    expect(resposta.json<PedidoCriado>().whatsapp.message).toContain(
      'Avenida Paulista, 1••• — Bela Vista (endereço cadastrado)',
    )
    for (const trecho of ['1000', 'apto', '01310']) {
      expect(resposta.body).not.toContain(trecho)
    }
    const numero = resposta.json<PedidoCriado>().number
    const [gravado] = await naLanchonete((tx) =>
      tx.select().from(orders).where(eq(orders.number, numero)),
    )
    expect(gravado?.addressStreet).toBe('Avenida Paulista')
  })

  it('endereço salvo de outro cliente é recusado', async () => {
    await criar()
    const daMaria = await enderecoDaMaria()

    const resposta = await enviar(
      lanchonete.slug,
      pedido({
        customer: { phone: '(31) 99999-1234', name: 'Intruso' },
        address: { savedAddressId: daMaria },
      }),
    )
    expect(problemasDe(resposta.body).map((p) => p.tipo)).toEqual(['ENDERECO_INVALIDO'])
  })

  it('só o primeiro nome (o que o checkout preenche) vira o nome completo guardado no pedido', async () => {
    await criar()
    const criado = await criar(pedido({ customer: { phone: TELEFONE, name: 'Maria' } }))

    const [gravado] = await naLanchonete((tx) =>
      tx.select().from(orders).where(eq(orders.number, criado.number)),
    )
    expect(gravado?.customerName).toBe('Maria Oliveira')
    // A resposta ao navegador — mensagem do WhatsApp inclusive — não leva o nome guardado.
    expect(JSON.stringify(criado)).not.toContain('Oliveira')
    expect(criado.whatsapp.message).toContain('*Cliente:* Maria —')
  })

  it('cliente que já existe mantém o nome guardado; o pedido guarda o nome digitado', async () => {
    const criado = await criar(pedido({ customer: { phone: TELEFONE, name: 'Outro Nome' } }))

    const [cliente, gravado] = await naLanchonete(async (tx) => [
      (await tx.select().from(customers).where(eq(customers.phone, TELEFONE)))[0],
      (await tx.select().from(orders).where(eq(orders.number, criado.number)))[0],
    ])
    expect(cliente?.name).toBe('Maria Oliveira')
    expect(gravado?.customerName).toBe('Outro Nome')
  })
})

describe('painel do estabelecimento', () => {
  it('lista do mais recente para o mais antigo, filtra por status e pagina', async () => {
    const a = await criar()
    const b = await criar()

    const lista = (await admin('GET', '/orders?limit=2')).json<{ number: number }[]>()
    expect(lista.map((p) => p.number)).toEqual([b.number, a.number])

    const antes = (await admin('GET', `/orders?before=${String(b.number)}&limit=1`)).json<
      { number: number }[]
    >()
    expect(antes.map((p) => p.number)).toEqual([a.number])

    const recebidos = (await admin('GET', '/orders?status=RECEIVED')).json<{ status: string }[]>()
    expect(recebidos.every((p) => p.status === 'RECEIVED')).toBe(true)
  })

  it('o detalhe mostra o pedido como foi feito, mesmo depois de o produto mudar', async () => {
    const criado = await criar()
    const [gravado] = await naLanchonete((tx) =>
      tx.select().from(orders).where(eq(orders.number, criado.number)),
    )

    await atualizarProduto(
      tenantContextFromUser(lanchonete.tenantId),
      lanchonete.userId,
      ids.refri,
      {
        name: 'Refrigerante 2L',
        priceInCents: 1500,
      },
    )

    const detalhe = (await admin('GET', `/orders/${gravado?.id ?? ''}`)).json<{
      address: { street: string; postalCode: string }
      items: { productName: string; unitPriceInCents: number; options: { optionName: string }[] }[]
    }>()
    expect(detalhe.address).toMatchObject({ street: 'Avenida Paulista', postalCode: '01310100' })
    expect(detalhe.items.map((i) => [i.productName, i.unitPriceInCents])).toEqual([
      ['X-Salada', 3090],
      ['Refrigerante', 700],
    ])

    await atualizarProduto(
      tenantContextFromUser(lanchonete.tenantId),
      lanchonete.userId,
      ids.refri,
      {
        name: 'Refrigerante',
        priceInCents: 700,
      },
    )
  })

  it('o status só avança, cancelar exige motivo, e tudo vai para a auditoria', async () => {
    const criado = await criar(
      pedido({ fulfillment: 'PICKUP', address: null, expectedTotalInCents: 6880 }),
    )
    const [gravado] = await naLanchonete((tx) =>
      tx.select().from(orders).where(eq(orders.number, criado.number)),
    )
    const url = `/orders/${gravado?.id ?? ''}/status`

    expect((await admin('PATCH', url, { status: 'PREPARING' })).json()).toMatchObject({
      status: 'PREPARING',
    })
    const volta = await admin('PATCH', url, { status: 'ACCEPTED' })
    expect(volta.statusCode).toBe(409)
    expect(volta.json()).toMatchObject({ error: { code: 'INVALID_STATUS_TRANSITION' } })

    const saiuParaEntrega = await admin('PATCH', url, { status: 'OUT_FOR_DELIVERY' })
    expect(saiuParaEntrega.statusCode).toBe(409)

    const semMotivo = await admin('PATCH', url, { status: 'CANCELLED' })
    expect(semMotivo.statusCode).toBe(400)
    expect(semMotivo.json()).toMatchObject({ error: { code: 'CANCELLATION_REASON_REQUIRED' } })

    const cancelado = await admin('PATCH', url, { status: 'CANCELLED', reason: 'Cliente desistiu' })
    expect(cancelado.json()).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'Cliente desistiu',
    })
    expect((await admin('PATCH', url, { status: 'COMPLETED' })).statusCode).toBe(409)

    const registros = await naLanchonete((tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, gravado?.id ?? '')),
    )
    expect(registros.map((r) => r.metadata)).toEqual([
      { number: criado.number, de: 'RECEIVED', para: 'PREPARING' },
      { number: criado.number, de: 'PREPARING', para: 'CANCELLED', motivo: 'Cliente desistiu' },
    ])
    expect(registros.every((r) => r.actorUserId === lanchonete.userId)).toBe(true)
  })

  it('pedido de outro estabelecimento responde 404', async () => {
    const criado = await criar()
    const [gravado] = await naLanchonete((tx) =>
      tx.select().from(orders).where(eq(orders.number, criado.number)),
    )

    const resposta = await admin('GET', `/orders/${gravado?.id ?? ''}`, undefined, tokenDaPizzaria)
    expect(resposta.statusCode).toBe(404)
    expect((await admin('GET', '/orders', undefined, tokenDaPizzaria)).json()).toEqual([])
  })

  it('sem login responde 401; sem permissão de atualizar, 403', async () => {
    const semLogin = await app.inject({ method: 'GET', url: '/api/v1/admin/orders' })
    expect(semLogin.statusCode).toBe(401)

    const semPermissao = await admin(
      'PATCH',
      `/orders/${randomUUID()}/status`,
      { status: 'ACCEPTED' },
      tokenDaPizzaria,
    )
    expect(semPermissao.statusCode).toBe(403)
  })

  it('itens e opções do pedido não aparecem para outro estabelecimento no banco', async () => {
    await criar()
    const [itens, opcoes] = await withTenant(
      tenantContextFromUser(pizzaria.tenantId),
      async (tx) => [await tx.select().from(orderItems), await tx.select().from(orderItemOptions)],
    )
    expect(itens).toEqual([])
    expect(opcoes).toEqual([])
  })
})

describe('limite de requisições', () => {
  it(`bloqueia depois de ${String(LIMITE_DE_PEDIDOS)} envios por minuto do mesmo IP`, async () => {
    const comLimite = await buildApp()
    await comLimite.ready()
    const envio = () =>
      comLimite.inject({
        method: 'POST',
        url: `/api/v1/public/${lanchonete.slug}/orders`,
        payload: {},
        remoteAddress: '198.51.100.20',
      })

    for (let i = 0; i < LIMITE_DE_PEDIDOS; i += 1) expect((await envio()).statusCode).toBe(400)
    expect((await envio()).statusCode).toBe(429)
    await comLimite.close()
  })
})

// Pedido não some quando o cliente é excluído por engano.
describe('integridade', () => {
  it('cliente com pedidos não pode ser excluído', async () => {
    await criar()
    await expect(
      naLanchonete((tx) => tx.delete(customers).where(eq(customers.phone, TELEFONE))),
    ).rejects.toThrow()
  })

  it('excluir o estabelecimento leva pedidos e clientes junto, sem esbarrar na restrição', async () => {
    const descartavel = await criarTenantComUsuario()
    await db.delete(tenants).where(eq(tenants.id, descartavel.tenantId))
    await removerTenantDeTeste(descartavel)
  })
})
