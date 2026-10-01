import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { closeDatabase } from '../src/db/index.js'
import { auditLogs } from '../src/db/schema/index.js'
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
let token = ''
let categoriaId = ''

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
const chamar = (method: Metodo, url: string, payload?: object) =>
  app.inject({
    method,
    url: `/api/v1/admin${url}`,
    headers: { authorization: `Bearer ${token}` },
    ...(payload && { payload }),
  })

const codigo = (r: LightMyRequestResponse) => r.json<{ error: { code: string } }>().error.code

interface Opcao {
  id: string
  name: string
  priceDeltaInCents: number
  isAvailable: boolean
}
interface Grupo {
  id: string
  name: string
  minSelections: number
  maxSelections: number
  isRequired: boolean
  options: Opcao[]
}
interface Composicao {
  items: { productId: string; name: string; quantity: number }[]
  precoAvulsoEmCentavos: number
  todosDisponiveis: boolean
}

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()
  dono = await criarTenantComUsuario({
    permissoes: [
      'products:read',
      'products:create',
      'products:update',
      'products:delete',
      'categories:create',
    ],
    permissoesReais: true,
  })
  token = (
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: dono.email, password: SENHA_PADRAO },
    })
  ).json<{ accessToken: string }>().accessToken

  categoriaId = (await chamar('POST', '/categories', { name: 'Lanches' })).json<{ id: string }>().id
})

afterAll(async () => {
  await app.close()
  await removerTenantDeTeste(dono)
  await closeDatabase()
})

let sequencia = 0
async function produto(dados: Record<string, unknown> = {}): Promise<{ id: string }> {
  const r = await chamar('POST', '/products', {
    categoryId: categoriaId,
    name: `Produto ${String(++sequencia)}`,
    priceInCents: 2000,
    ...dados,
  })
  expect(r.statusCode).toBe(201)
  return r.json<{ id: string }>()
}

async function grupo(dados: Record<string, unknown> = {}): Promise<Grupo> {
  const r = await chamar('POST', '/option-groups', {
    name: `Grupo ${String(++sequencia)}`,
    minSelections: 0,
    maxSelections: 2,
    options: [
      { name: 'Bacon', priceDeltaInCents: 500 },
      { name: 'Cheddar', priceDeltaInCents: 400 },
    ],
    ...dados,
  })
  expect(r.statusCode).toBe(201)
  return r.json<Grupo>()
}

describe('grupos de opção', () => {
  it('cria o grupo com as opções, e deriva o obrigatório do mínimo', async () => {
    const tamanho = await grupo({
      name: 'Tamanho',
      minSelections: 1,
      maxSelections: 1,
      options: [
        { name: 'Normal', priceDeltaInCents: 0 },
        { name: 'Grande', priceDeltaInCents: 600 },
      ],
    })

    expect(tamanho.isRequired).toBe(true)
    expect(tamanho.options.map((o) => [o.name, o.priceDeltaInCents])).toEqual([
      ['Normal', 0],
      ['Grande', 600],
    ])

    const adicionais = await grupo()
    expect(adicionais.isRequired).toBe(false)
  })

  it('recusa um grupo impossível de satisfazer', async () => {
    const r = await chamar('POST', '/option-groups', {
      name: 'Escolha duas',
      minSelections: 2,
      maxSelections: 2,
      options: [{ name: 'Só uma', priceDeltaInCents: 0 }],
    })

    expect(r.statusCode).toBe(400)
    expect(codigo(r)).toBe('INVALID_OPTION_GROUP')
  })

  it('recusa acréscimo negativo', async () => {
    const r = await chamar('POST', '/option-groups', {
      name: 'Tamanho',
      minSelections: 1,
      maxSelections: 1,
      options: [{ name: 'Pequeno', priceDeltaInCents: -200 }],
    })

    expect(r.statusCode).toBe(400)
  })

  it('a edição altera as opções com id, cria as sem id e remove as ausentes', async () => {
    const original = await grupo()
    const [bacon] = original.options

    const r = await chamar('PUT', `/option-groups/${original.id}`, {
      name: original.name,
      minSelections: 0,
      maxSelections: 2,
      options: [
        { id: bacon?.id, name: 'Bacon', priceDeltaInCents: 600 },
        { name: 'Ovo', priceDeltaInCents: 200 },
      ],
    })

    expect(r.statusCode).toBe(200)
    const editado = r.json<Grupo>()
    expect(editado.options.map((o) => o.name)).toEqual(['Bacon', 'Ovo'])
    // O bacon manteve a identidade: foi alterado, e não recriado.
    expect(editado.options[0]?.id).toBe(bacon?.id)
    expect(editado.options[0]?.priceDeltaInCents).toBe(600)
  })

  it('a troca de preço de uma opção fica na auditoria com antes e depois', async () => {
    const original = await grupo()
    const [bacon, cheddar] = original.options

    await chamar('PUT', `/option-groups/${original.id}`, {
      name: original.name,
      minSelections: 0,
      maxSelections: 2,
      options: [
        { id: bacon?.id, name: 'Bacon', priceDeltaInCents: 700 },
        { id: cheddar?.id, name: 'Cheddar', priceDeltaInCents: 400 },
      ],
    })

    const registros = await withTenant(tenantContextFromUser(dono.tenantId), (tx) =>
      tx.select({ action: auditLogs.action, metadata: auditLogs.metadata }).from(auditLogs),
    )
    const ultimo = registros.filter((r) => r.action === 'option_group.updated').at(-1)
    expect(ultimo?.metadata).toMatchObject({
      precosAlterados: [{ option: 'Bacon', de: 500, para: 700 }],
    })
  })

  it('não aceita, na edição, opção que pertence a outro grupo', async () => {
    const tamanho = await grupo()
    const adicionais = await grupo()
    const opcaoDoTamanho = tamanho.options[0]?.id

    const r = await chamar('PUT', `/option-groups/${adicionais.id}`, {
      name: adicionais.name,
      minSelections: 0,
      maxSelections: 1,
      options: [{ id: opcaoDoTamanho, name: 'Sequestrada', priceDeltaInCents: 0 }],
    })

    expect(r.statusCode).toBe(400)
    expect(codigo(r)).toBe('OPTION_NOT_IN_GROUP')
  })

  it('exclui grupo sem uso', async () => {
    const livre = await grupo()

    expect((await chamar('DELETE', `/option-groups/${livre.id}`)).statusCode).toBe(204)
  })

  it('recusa excluir grupo em uso, dizendo por quantos produtos', async () => {
    const emUso = await grupo()
    const lanche = await produto()
    await chamar('PUT', `/products/${lanche.id}/option-groups`, { groupIds: [emUso.id] })

    const r = await chamar('DELETE', `/option-groups/${emUso.id}`)

    expect(r.statusCode).toBe(409)
    expect(codigo(r)).toBe('OPTION_GROUP_IN_USE')
  })
})

describe('grupos de um produto', () => {
  it('liga os grupos na ordem informada', async () => {
    const tamanho = await grupo({ name: 'Tamanho do lanche' })
    const adicionais = await grupo({ name: 'Adicionais do lanche' })
    const lanche = await produto()

    const r = await chamar('PUT', `/products/${lanche.id}/option-groups`, {
      groupIds: [adicionais.id, tamanho.id],
    })

    expect(r.json<Grupo[]>().map((g) => g.name)).toEqual([
      'Adicionais do lanche',
      'Tamanho do lanche',
    ])
  })

  it('o mesmo grupo serve a vários produtos — é o que torna o bacon uma edição só', async () => {
    const adicionais = await grupo()
    const a = await produto()
    const b = await produto()

    await chamar('PUT', `/products/${a.id}/option-groups`, { groupIds: [adicionais.id] })
    await chamar('PUT', `/products/${b.id}/option-groups`, { groupIds: [adicionais.id] })

    const deA = (await chamar('GET', `/products/${a.id}/option-groups`)).json<Grupo[]>()
    const deB = (await chamar('GET', `/products/${b.id}/option-groups`)).json<Grupo[]>()
    expect(deA[0]?.id).toBe(adicionais.id)
    expect(deB[0]?.id).toBe(adicionais.id)
  })

  it('recusa grupo inexistente com 404, sem alterar nada', async () => {
    const lanche = await produto()
    const real = await grupo()
    await chamar('PUT', `/products/${lanche.id}/option-groups`, { groupIds: [real.id] })

    const r = await chamar('PUT', `/products/${lanche.id}/option-groups`, {
      groupIds: ['01a0d928-0000-7000-8000-000000000000'],
    })

    expect(r.statusCode).toBe(404)
    const depois = (await chamar('GET', `/products/${lanche.id}/option-groups`)).json<Grupo[]>()
    expect(depois.map((g) => g.id)).toEqual([real.id])
  })

  it('recusa grupo repetido', async () => {
    const lanche = await produto()
    const g = await grupo()

    const r = await chamar('PUT', `/products/${lanche.id}/option-groups`, {
      groupIds: [g.id, g.id],
    })

    expect(r.statusCode).toBe(400)
  })
})

describe('combos', () => {
  it('monta o combo e calcula quanto os itens custariam separados', async () => {
    const lanche = await produto({ name: 'X-Salada', priceInCents: 2590 })
    const batata = await produto({ name: 'Batata', priceInCents: 1500 })
    const refri = await produto({ name: 'Refrigerante', priceInCents: 600 })
    const combo = await produto({ name: 'Combo X-Salada', type: 'COMBO', priceInCents: 3990 })

    const r = await chamar('PUT', `/products/${combo.id}/combo-items`, {
      items: [
        { productId: lanche.id, quantity: 1 },
        { productId: batata.id, quantity: 1 },
        { productId: refri.id, quantity: 2 },
      ],
    })

    expect(r.statusCode).toBe(200)
    const composicao = r.json<Composicao>()
    expect(composicao.items.map((i) => `${String(i.quantity)}x ${i.name}`)).toEqual([
      '1x X-Salada',
      '1x Batata',
      '2x Refrigerante',
    ])
    expect(composicao.precoAvulsoEmCentavos).toBe(2590 + 1500 + 600 * 2)
    expect(composicao.todosDisponiveis).toBe(true)
  })

  it('um componente esgotado deixa o combo indisponível', async () => {
    const lanche = await produto()
    const suco = await produto()
    const combo = await produto({ type: 'COMBO' })
    await chamar('PUT', `/products/${combo.id}/combo-items`, {
      items: [
        { productId: lanche.id, quantity: 1 },
        { productId: suco.id, quantity: 1 },
      ],
    })

    await chamar('PATCH', `/products/${suco.id}`, { isAvailable: false })

    expect(
      (await chamar('GET', `/products/${combo.id}/combo-items`)).json<Composicao>()
        .todosDisponiveis,
    ).toBe(false)
  })

  it('recusa combo dentro de combo', async () => {
    const interno = await produto({ type: 'COMBO' })
    const externo = await produto({ type: 'COMBO' })

    const r = await chamar('PUT', `/products/${externo.id}/combo-items`, {
      items: [{ productId: interno.id, quantity: 1 }],
    })

    expect(r.statusCode).toBe(400)
    expect(codigo(r)).toBe('COMBO_IN_COMBO')
  })

  it('recusa combo contendo a si mesmo', async () => {
    const combo = await produto({ type: 'COMBO' })

    const r = await chamar('PUT', `/products/${combo.id}/combo-items`, {
      items: [{ productId: combo.id, quantity: 1 }],
    })

    expect(codigo(r)).toBe('COMBO_CONTAINS_ITSELF')
  })

  it('recusa componentes num produto que não é combo', async () => {
    const simples = await produto()
    const outro = await produto()

    const r = await chamar('PUT', `/products/${simples.id}/combo-items`, {
      items: [{ productId: outro.id, quantity: 1 }],
    })

    expect(codigo(r)).toBe('NOT_A_COMBO')
  })

  it('recusa excluir um produto que é componente, dizendo de qual combo', async () => {
    const lanche = await produto()
    const combo = await produto({ name: 'Combo da Casa', type: 'COMBO' })
    await chamar('PUT', `/products/${combo.id}/combo-items`, {
      items: [{ productId: lanche.id, quantity: 1 }],
    })

    const r = await chamar('DELETE', `/products/${lanche.id}`)

    expect(r.statusCode).toBe(409)
    expect(codigo(r)).toBe('PRODUCT_IN_COMBO')
    expect(r.json<{ error: { message: string } }>().error.message).toContain('Combo da Casa')
  })

  it('excluir o combo leva os componentes junto, e os produtos continuam', async () => {
    const lanche = await produto()
    const combo = await produto({ type: 'COMBO' })
    await chamar('PUT', `/products/${combo.id}/combo-items`, {
      items: [{ productId: lanche.id, quantity: 1 }],
    })

    expect((await chamar('DELETE', `/products/${combo.id}`)).statusCode).toBe(204)
    expect((await chamar('GET', `/products/${lanche.id}`)).statusCode).toBe(200)
    // Sem o combo, o lanche deixa de ser componente e pode ser excluído.
    expect((await chamar('DELETE', `/products/${lanche.id}`)).statusCode).toBe(204)
  })
})

describe('tipo do produto', () => {
  it('é imutável: o PATCH recusa o campo', async () => {
    const combo = await produto({ type: 'COMBO' })

    const r = await chamar('PATCH', `/products/${combo.id}`, { type: 'SIMPLE' })

    // O motivo precisa ser o campo recusado, e não um 400 qualquer que
    // passaria o teste por acaso.
    expect(r.statusCode).toBe(400)
    expect(r.body).toContain('Unrecognized key: \\"type\\"')
  })
})
