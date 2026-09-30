import { randomUUID } from 'node:crypto'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { WebSocket as ClienteWs } from 'ws'

import { buildApp } from '../src/app.js'
import { criarCategoria, criarProduto } from '../src/catalog/service.js'
import { closeDatabase, db } from '../src/db/index.js'
import { orders, paymentMethods } from '../src/db/schema/index.js'
import { CanalDePedidos } from '../src/realtime/channel.js'
import { avisarPedido } from '../src/realtime/notify.js'
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

const STREAM = '/api/v1/admin/orders/stream'

let app: FastifyInstance
let lanchonete: TenantDeTeste
let pizzaria: TenantDeTeste
let semPermissao: TenantDeTeste
const tokens = { lanchonete: '', pizzaria: '', semPermissao: '' }
const ids = { pix: '', produto: '' }

async function entrar(f: TenantDeTeste): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { tenantSlug: f.slug, email: f.email, password: SENHA_PADRAO },
  })
  return r.json<{ accessToken: string }>().accessToken
}

/** As mensagens recebidas pela conexão, na ordem, e o código de fechamento. */
function observar(ws: ClienteWs) {
  const mensagens: Record<string, unknown>[] = []
  const esperando: (() => void)[] = []
  let fechamento: number | null = null

  ws.on('message', (dado: Buffer) => {
    mensagens.push(JSON.parse(dado.toString()) as Record<string, unknown>)
    esperando.splice(0).forEach((f) => {
      f()
    })
  })
  ws.on('close', (codigo: number) => {
    fechamento = codigo
    esperando.splice(0).forEach((f) => {
      f()
    })
  })

  const ate = async (condicao: () => boolean, ms = 3000) => {
    const limite = Date.now() + ms
    while (!condicao()) {
      if (Date.now() > limite)
        throw new Error(`tempo esgotado; recebido: ${JSON.stringify(mensagens)}`)
      await new Promise<void>((resolve) => {
        esperando.push(resolve)
        setTimeout(resolve, 50)
      })
    }
  }

  return {
    mensagens,
    fechamento: () => fechamento,
    /** Espera a n-ésima mensagem (a partir de 1). */
    mensagem: async (n: number) => {
      await ate(() => mensagens.length >= n)
      return mensagens[n - 1]
    },
    fechou: async () => {
      await ate(() => fechamento !== null)
      return fechamento
    },
  }
}

async function conectar(token: string | null) {
  const ws = await app.injectWS(STREAM)
  const obs = observar(ws)
  if (token !== null) ws.send(JSON.stringify({ type: 'auth', token }))
  return { ws, obs }
}

async function conectado(token: string) {
  const conexao = await conectar(token)
  expect(await conexao.obs.mensagem(1)).toEqual({ type: 'ready' })
  return conexao
}

const avisar = (f: TenantDeTeste, pedidoId: string, numero: number) =>
  withTenant(tenantContextFromUser(f.tenantId), (tx) =>
    avisarPedido(tx, { tipo: 'PEDIDO_CRIADO', tenantId: f.tenantId, pedidoId, numero }),
  )

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()

  lanchonete = await criarTenantComUsuario({
    permissoes: ['orders:read', 'orders:update'],
    permissoesReais: true,
  })
  pizzaria = await criarTenantComUsuario({ permissoes: ['orders:read'], permissoesReais: true })
  semPermissao = await criarTenantComUsuario({
    permissoes: ['products:read'],
    permissoesReais: true,
  })

  const ctx = tenantContextFromUser(lanchonete.tenantId)
  const ator = lanchonete.userId
  ids.pix = (await db.select().from(paymentMethods)).find((f) => f.code === 'PIX')?.id ?? ''
  await atualizarConfiguracoes(ctx, ator, { minimumOrderInCents: 0 })
  await substituirHorarios(
    ctx,
    ator,
    [0, 1, 2, 3, 4, 5, 6].flatMap((dayOfWeek) => [
      { dayOfWeek, opensAt: '00:00', closesAt: '12:00' },
      { dayOfWeek, opensAt: '12:00', closesAt: '00:00' },
    ]),
  )
  await substituirEntrega(ctx, ator, {
    configuracao: { deliveryEnabled: false, pickupEnabled: true },
    regioes: [],
  })
  await definirFormasDePagamento(ctx, ator, [
    { paymentMethodId: ids.pix, isEnabled: true, sortOrder: 0 },
  ])
  const categoria = await criarCategoria(ctx, ator, { name: 'Lanches' })
  ids.produto = (
    await criarProduto(ctx, ator, { name: 'X', categoryId: categoria.id, priceInCents: 1000 })
  ).id

  tokens.lanchonete = await entrar(lanchonete)
  tokens.pizzaria = await entrar(pizzaria)
  tokens.semPermissao = await entrar(semPermissao)
})

afterAll(async () => {
  await app.close()
  for (const f of [lanchonete, pizzaria, semPermissao]) await removerTenantDeTeste(f)
  await closeDatabase()
})

describe('canal por estabelecimento', () => {
  it('entrega só às assinaturas do tenant do evento, e sem o tenantId', () => {
    const canal = new CanalDePedidos()
    const recebidosA: unknown[] = []
    const recebidosB: unknown[] = []
    const cancelarA = canal.assinar('a', (m) => recebidosA.push(m))
    canal.assinar('b', (m) => recebidosB.push(m))

    canal.publicar({ tipo: 'PEDIDO_CRIADO', tenantId: 'a', pedidoId: 'p1', numero: 1 })
    expect(recebidosA).toEqual([{ type: 'order.created', orderId: 'p1', number: 1 }])
    expect(recebidosB).toEqual([])

    cancelarA()
    canal.publicar({ tipo: 'PEDIDO_CRIADO', tenantId: 'a', pedidoId: 'p2', numero: 2 })
    expect(recebidosA).toHaveLength(1)
    expect(canal.totalDeAssinaturas()).toBe(1)
  })
})

describe('autenticação da conexão', () => {
  it('token inválido fecha com 4001', async () => {
    const { obs } = await conectar('nao-e-um-token')
    expect(await obs.fechou()).toBe(4001)
  })

  it('mensagem que não é de autenticação fecha com 4001', async () => {
    const ws = await app.injectWS(STREAM)
    const obs = observar(ws)
    ws.send('olá')
    expect(await obs.fechou()).toBe(4001)
  })

  it('sem a permissão orders:read fecha com 4003', async () => {
    const { obs } = await conectar(tokens.semPermissao)
    expect(await obs.fechou()).toBe(4003)
  })

  it('origem diferente da web é recusada antes da conexão', async () => {
    await expect(
      app.injectWS(STREAM, { headers: { origin: 'https://site-malicioso.example' } }),
    ).rejects.toThrow()
  })
})

describe('eventos', () => {
  it('cada conexão recebe só os eventos do próprio estabelecimento', async () => {
    const daLanchonete = await conectado(tokens.lanchonete)
    const daPizzaria = await conectado(tokens.pizzaria)

    const pedidoDaPizzaria = randomUUID()
    const pedidoDaLanchonete = randomUUID()
    await avisar(pizzaria, pedidoDaPizzaria, 7)
    await avisar(lanchonete, pedidoDaLanchonete, 3)

    // O aviso da pizzaria saiu antes; se vazasse, seria a primeira mensagem.
    expect(await daLanchonete.obs.mensagem(2)).toEqual({
      type: 'order.created',
      orderId: pedidoDaLanchonete,
      number: 3,
    })
    expect(await daPizzaria.obs.mensagem(2)).toEqual({
      type: 'order.created',
      orderId: pedidoDaPizzaria,
      number: 7,
    })
    daLanchonete.ws.close()
    daPizzaria.ws.close()
  })

  it('aviso de uma transação desfeita não chega', async () => {
    const { ws, obs } = await conectado(tokens.lanchonete)

    await expect(
      withTenant(tenantContextFromUser(lanchonete.tenantId), async (tx) => {
        await avisarPedido(tx, {
          tipo: 'PEDIDO_CRIADO',
          tenantId: lanchonete.tenantId,
          pedidoId: randomUUID(),
          numero: 999,
        })
        throw new Error('rollback')
      }),
    ).rejects.toThrow('rollback')

    const depois = randomUUID()
    await avisar(lanchonete, depois, 1000)
    expect(await obs.mensagem(2)).toMatchObject({ orderId: depois })
    expect(obs.mensagens.some((m) => m.number === 999)).toBe(false)
    ws.close()
  })

  it('pedido criado e mudança de status chegam ao painel', async () => {
    const { ws, obs } = await conectado(tokens.lanchonete)

    const criado = await app.inject({
      method: 'POST',
      url: `/api/v1/public/${lanchonete.slug}/orders`,
      payload: {
        idempotencyKey: randomUUID(),
        customer: { phone: '(11) 98765-4321', name: 'Maria' },
        fulfillment: 'PICKUP',
        address: null,
        deliveryRegionId: null,
        paymentMethodId: ids.pix,
        changeForInCents: null,
        notes: null,
        items: [{ productId: ids.produto, quantity: 1, notes: null, options: {} }],
        expectedTotalInCents: 1000,
      },
    })
    expect(criado.statusCode, criado.body).toBe(201)
    const numero = criado.json<{ number: number }>().number

    const aviso = await obs.mensagem(2)
    expect(aviso).toMatchObject({ type: 'order.created', number: numero })

    const [pedido] = await withTenant(tenantContextFromUser(lanchonete.tenantId), (tx) =>
      tx.select().from(orders),
    )
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/orders/${pedido?.id ?? ''}/status`,
      headers: { authorization: `Bearer ${tokens.lanchonete}` },
      payload: { status: 'ACCEPTED' },
    })

    expect(await obs.mensagem(3)).toEqual({
      type: 'order.status_changed',
      orderId: pedido?.id,
      number: numero,
      status: 'ACCEPTED',
    })
    ws.close()
  })

  it('a conexão encerrada deixa de assinar o canal', async () => {
    // Com porta de verdade e o WebSocket nativo do Node: o `injectWS` não
    // repassa o fechamento do cliente ao servidor, e o teste não provaria nada.
    const servidor = await buildApp({ rateLimit: false })
    await servidor.listen({ port: 0, host: '127.0.0.1' })
    try {
      const { port } = servidor.server.address() as { port: number }
      const ws = new WebSocket(`ws://127.0.0.1:${String(port)}${STREAM}`)
      await new Promise((resolve) => ws.addEventListener('open', resolve))
      ws.send(JSON.stringify({ type: 'auth', token: tokens.lanchonete }))
      await new Promise((resolve) => ws.addEventListener('message', resolve))
      expect(servidor.canalDePedidos.totalDeAssinaturas()).toBe(1)

      ws.close()
      const limite = Date.now() + 2000
      while (servidor.canalDePedidos.totalDeAssinaturas() > 0 && Date.now() < limite) {
        await new Promise((r) => setTimeout(r, 20))
      }
      expect(servidor.canalDePedidos.totalDeAssinaturas()).toBe(0)
    } finally {
      await servidor.close()
    }
  })
})
