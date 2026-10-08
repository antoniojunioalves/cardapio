import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { permissoesParaGravarOGrupo } from '../src/catalog/option-groups.js'
import { closeDatabase } from '../src/db/index.js'
import { auditLogs } from '../src/db/schema/index.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'
import {
  criarColega,
  criarTenantComUsuario,
  removerTenantDeTeste,
  SENHA_PADRAO,
  type TenantDeTeste,
} from './helpers/fixtures.js'

/**
 * As permissões que dependem do que o pedido **muda**.
 *
 * Marcar o que esgotou, mexer em preço e alterar o resto são três permissões,
 * na mesma rota — vale para o produto e para as opções dos opcionais. E pausar
 * o recebimento de pedidos não é alterar as configurações. A rota deixa entrar
 * quem tem uma delas; é o serviço que confere qual o pedido usa.
 */

let app: FastifyInstance
let loja: TenantDeTeste
let tokenDoDono = ''

interface Produto {
  id: string
  categoryId: string
  name: string
  description: string | null
  priceInCents: number
  isAvailable: boolean
  sortOrder: number
}
interface Opcao {
  id: string
  name: string
  priceDeltaInCents: number
  isAvailable: boolean
}
interface Grupo {
  id: string
  name: string
  description: string | null
  minSelections: number
  maxSelections: number
  options: Opcao[]
}

const entrar = async (de: TenantDeTeste) =>
  (
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: de.email, password: SENHA_PADRAO },
    })
  ).json<{ accessToken: string }>().accessToken

/** Uma pessoa da loja com exatamente estas permissões, já logada. */
const com = async (...permissoes: string[]) => entrar(await criarColega(loja, permissoes))

function chamar(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  token: string,
  payload?: object,
) {
  return app.inject({
    method,
    url: `/api/v1/admin${url}`,
    headers: { authorization: `Bearer ${token}` },
    ...(payload && { payload }),
  })
}

const faltou = (permissao: string) => ({
  error: { code: 'FORBIDDEN', details: { missing: [permissao] } },
})

let categoriaId = ''
let outraCategoriaId = ''

async function novoProduto(): Promise<Produto> {
  const resposta = await chamar('POST', '/products', tokenDoDono, {
    categoryId: categoriaId,
    name: 'X-Burger',
    description: 'Pão, carne e queijo.',
    priceInCents: 2590,
  })
  expect(resposta.statusCode, resposta.body).toBe(201)
  return resposta.json<Produto>()
}
const produtoGravado = async (id: string) =>
  (await chamar('GET', `/products/${id}`, tokenDoDono)).json<Produto>()

/** "Adicionais": bacon a R$ 5,00 e cheddar a R$ 4,00, escolha livre. */
async function novoGrupo(): Promise<Grupo> {
  const resposta = await chamar('POST', '/option-groups', tokenDoDono, {
    name: 'Adicionais',
    minSelections: 0,
    maxSelections: 2,
    options: [
      { name: 'Bacon', priceDeltaInCents: 500 },
      { name: 'Cheddar', priceDeltaInCents: 400 },
    ],
  })
  expect(resposta.statusCode, resposta.body).toBe(201)
  return resposta.json<Grupo>()
}
const grupoGravado = async (id: string) =>
  (await chamar('GET', `/option-groups/${id}`, tokenDoDono)).json<Grupo>()

/** O grupo como a tela o envia: inteiro, com o id de cada opção. */
const corpoDoGrupo = (grupo: Grupo, mudar: (corpo: CorpoDoGrupo) => void = () => undefined) => {
  const corpo: CorpoDoGrupo = {
    name: grupo.name,
    description: grupo.description,
    minSelections: grupo.minSelections,
    maxSelections: grupo.maxSelections,
    options: grupo.options.map(({ id, name, priceDeltaInCents, isAvailable }) => ({
      id,
      name,
      priceDeltaInCents,
      isAvailable,
    })),
  }
  mudar(corpo)
  return corpo
}
interface CorpoDoGrupo {
  name: string
  description: string | null
  minSelections: number
  maxSelections: number
  options: { id?: string; name: string; priceDeltaInCents: number; isAvailable?: boolean }[]
}

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()

  loja = await criarTenantComUsuario({ dono: true })
  tokenDoDono = await entrar(loja)
  const criar = async (name: string) =>
    (await chamar('POST', '/categories', tokenDoDono, { name })).json<{ id: string }>().id
  categoriaId = await criar('Lanches')
  outraCategoriaId = await criar('Bebidas')
})

afterAll(async () => {
  await app.close()
  await removerTenantDeTeste(loja)
  await closeDatabase()
})

describe('produto: o que esgotou, o preço e o resto', () => {
  it('quem só marca o que esgotou marca — e não mexe em preço nem em nome', async () => {
    const cozinha = await com('products:read', 'products:availability')
    const produto = await novoProduto()
    const url = `/products/${produto.id}`

    const esgotou = await chamar('PATCH', url, cozinha, { isAvailable: false })
    expect(esgotou.statusCode, esgotou.body).toBe(200)
    expect(esgotou.json()).toMatchObject({ isAvailable: false })

    const preco = await chamar('PATCH', url, cozinha, { priceInCents: 100 })
    expect(preco.statusCode).toBe(403)
    expect(preco.json()).toMatchObject(faltou('products:price'))

    const nome = await chamar('PATCH', url, cozinha, { name: 'Outro nome' })
    expect(nome.statusCode).toBe(403)
    expect(nome.json()).toMatchObject(faltou('products:update'))

    expect(await produtoGravado(produto.id)).toMatchObject({
      name: 'X-Burger',
      priceInCents: 2590,
      isAvailable: false,
    })
  })

  it('quem só altera preços altera — e não marca o que esgotou', async () => {
    const financeiro = await com('products:read', 'products:price')
    const produto = await novoProduto()
    const url = `/products/${produto.id}`

    const preco = await chamar('PATCH', url, financeiro, { priceInCents: 2890 })
    expect(preco.statusCode, preco.body).toBe(200)
    expect(preco.json()).toMatchObject({ priceInCents: 2890 })

    const esgotou = await chamar('PATCH', url, financeiro, { isAvailable: false })
    expect(esgotou.statusCode).toBe(403)
    expect(esgotou.json()).toMatchObject(faltou('products:availability'))
    expect(await produtoGravado(produto.id)).toMatchObject({ isAvailable: true })
  })

  it('quem altera o produto muda nome, descrição, categoria e ordem — menos o preço e o que esgotou', async () => {
    const editor = await com('products:read', 'products:update')
    const produto = await novoProduto()
    const url = `/products/${produto.id}`

    const resto = await chamar('PATCH', url, editor, {
      name: 'X-Burger duplo',
      description: null,
      categoryId: outraCategoriaId,
      sortOrder: 30,
    })
    expect(resto.statusCode, resto.body).toBe(200)
    expect(resto.json()).toMatchObject({
      name: 'X-Burger duplo',
      description: null,
      categoryId: outraCategoriaId,
      sortOrder: 30,
    })

    expect((await chamar('PATCH', url, editor, { priceInCents: 1 })).json()).toMatchObject(
      faltou('products:price'),
    )
    expect((await chamar('PATCH', url, editor, { isAvailable: false })).json()).toMatchObject(
      faltou('products:availability'),
    )
  })

  it('cada campo do resto pede a permissão de alterar o produto', async () => {
    const cozinha = await com('products:read', 'products:availability', 'products:price')
    const produto = await novoProduto()

    for (const corpo of [
      { name: 'Outro' },
      { description: 'Outra descrição.' },
      { description: null },
      { categoryId: outraCategoriaId },
      { sortOrder: produto.sortOrder + 10 },
    ]) {
      const resposta = await chamar('PATCH', `/products/${produto.id}`, cozinha, corpo)
      expect(resposta.statusCode, JSON.stringify(corpo)).toBe(403)
      expect(resposta.json()).toMatchObject(faltou('products:update'))
    }
    expect(await produtoGravado(produto.id)).toEqual(produto)
  })

  it('o que vem igual ao gravado não pede permissão: a tela envia o formulário inteiro', async () => {
    const cozinha = await com('products:read', 'products:availability')
    const produto = await novoProduto()

    const resposta = await chamar('PATCH', `/products/${produto.id}`, cozinha, {
      categoryId: produto.categoryId,
      name: produto.name,
      description: produto.description,
      priceInCents: produto.priceInCents,
      sortOrder: produto.sortOrder,
      isAvailable: false,
    })

    expect(resposta.statusCode, resposta.body).toBe(200)
    expect(resposta.json()).toMatchObject({ isAvailable: false, priceInCents: 2590 })
  })

  it('um pedido com uma parte fora do alcance é recusado inteiro: nada é gravado', async () => {
    const cozinha = await com('products:read', 'products:availability')
    const produto = await novoProduto()

    const resposta = await chamar('PATCH', `/products/${produto.id}`, cozinha, {
      isAvailable: false,
      priceInCents: 100,
      name: 'Barato',
    })

    expect(resposta.statusCode).toBe(403)
    expect(resposta.json()).toMatchObject({
      error: { details: { missing: ['products:price', 'products:update'] } },
    })
    expect(await produtoGravado(produto.id)).toEqual(produto)
    const registros = await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
      tx
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, produto.id), eq(auditLogs.action, 'product.updated'))),
    )
    expect(registros).toEqual([])
  })

  it('quem só vê o cardápio não altera nada', async () => {
    const soVe = await com('products:read')
    const produto = await novoProduto()

    for (const corpo of [{ isAvailable: false }, { priceInCents: 1 }, { name: 'Outro' }]) {
      const resposta = await chamar('PATCH', `/products/${produto.id}`, soVe, corpo)
      expect(resposta.statusCode).toBe(403)
      expect(resposta.json()).toMatchObject({
        error: {
          details: { anyOf: ['products:update', 'products:price', 'products:availability'] },
        },
      })
    }
  })

  it('quem cria produtos cria com o preço inicial, sem a permissão de alterar preços', async () => {
    const cadastro = await com('products:read', 'products:create')

    const criado = await chamar('POST', '/products', cadastro, {
      categoryId: categoriaId,
      name: 'Novidade',
      priceInCents: 1990,
      isAvailable: false,
    })
    expect(criado.statusCode, criado.body).toBe(201)

    // Criado, o preço é de quem altera preços.
    const depois = await chamar('PATCH', `/products/${criado.json<Produto>().id}`, cadastro, {
      priceInCents: 990,
    })
    expect(depois.statusCode).toBe(403)
  })

  it('a ordem dos produtos e a foto são de quem altera o produto', async () => {
    const cozinha = await com('products:read', 'products:availability', 'products:price')
    const produto = await novoProduto()

    const ordem = await chamar('PUT', '/products/order', cozinha, {
      categoryId: categoriaId,
      ids: [produto.id],
    })
    const foto = await chamar('DELETE', `/products/${produto.id}/image`, cozinha)

    expect(ordem.statusCode).toBe(403)
    expect(foto.statusCode).toBe(403)
  })

  it('produto que não existe responde 404, e não 403', async () => {
    const cozinha = await com('products:read', 'products:availability')

    const resposta = await chamar(
      'PATCH',
      '/products/01900000-0000-7000-8000-00000000abcd',
      cozinha,
      { priceInCents: 1 },
    )

    expect(resposta.statusCode).toBe(404)
  })
})

describe('categorias', () => {
  it('quem vê o cardápio vê as categorias: é a mesma permissão', async () => {
    const soVe = await com('products:read')
    const semCardapio = await com('orders:read')

    expect((await chamar('GET', '/categories', soVe)).statusCode).toBe(200)
    expect((await chamar('GET', '/categories', semCardapio)).statusCode).toBe(403)
  })
})

describe('opções dos opcionais: a mesma divisão do produto', () => {
  it('quem só marca o que esgotou marca uma opção — e não muda o acréscimo nem o nome', async () => {
    const cozinha = await com('products:read', 'products:availability')
    const grupo = await novoGrupo()
    const url = `/option-groups/${grupo.id}`

    const esgotou = await chamar(
      'PUT',
      url,
      cozinha,
      corpoDoGrupo(grupo, (c) => {
        if (c.options[0]) c.options[0].isAvailable = false
      }),
    )
    expect(esgotou.statusCode, esgotou.body).toBe(200)
    expect(esgotou.json<Grupo>().options.map((o) => o.isAvailable)).toEqual([false, true])

    const gravado = await grupoGravado(grupo.id)
    const acrescimo = await chamar(
      'PUT',
      url,
      cozinha,
      corpoDoGrupo(gravado, (c) => {
        if (c.options[1]) c.options[1].priceDeltaInCents = 0
      }),
    )
    expect(acrescimo.statusCode).toBe(403)
    expect(acrescimo.json()).toMatchObject(faltou('products:price'))

    const nome = await chamar(
      'PUT',
      url,
      cozinha,
      corpoDoGrupo(gravado, (c) => {
        c.name = 'Extras'
      }),
    )
    expect(nome.statusCode).toBe(403)
    expect(nome.json()).toMatchObject(faltou('products:update'))
    expect(await grupoGravado(grupo.id)).toEqual(gravado)
  })

  it('quem só altera preços muda o acréscimo — e não renomeia nem marca o que esgotou', async () => {
    const financeiro = await com('products:read', 'products:price')
    const grupo = await novoGrupo()
    const url = `/option-groups/${grupo.id}`

    const acrescimo = await chamar(
      'PUT',
      url,
      financeiro,
      corpoDoGrupo(grupo, (c) => {
        if (c.options[0]) c.options[0].priceDeltaInCents = 650
      }),
    )
    expect(acrescimo.statusCode, acrescimo.body).toBe(200)
    expect(acrescimo.json<Grupo>().options[0]).toMatchObject({ priceDeltaInCents: 650 })

    const gravado = await grupoGravado(grupo.id)
    const esgotou = await chamar(
      'PUT',
      url,
      financeiro,
      corpoDoGrupo(gravado, (c) => {
        if (c.options[0]) c.options[0].isAvailable = false
      }),
    )
    expect(esgotou.json()).toMatchObject(faltou('products:availability'))
  })

  it('quem altera os opcionais muda o grupo, e cria e tira opções — de graça', async () => {
    const editor = await com('products:read', 'products:update')
    const grupo = await novoGrupo()
    const url = `/option-groups/${grupo.id}`

    const mudou = await chamar(
      'PUT',
      url,
      editor,
      corpoDoGrupo(grupo, (c) => {
        c.name = 'Extras'
        c.maxSelections = 1
        c.options = [...c.options.slice(0, 1), { name: 'Sem cebola', priceDeltaInCents: 0 }]
      }),
    )
    expect(mudou.statusCode, mudou.body).toBe(200)
    expect(mudou.json<Grupo>()).toMatchObject({ name: 'Extras', maxSelections: 1 })
    expect(mudou.json<Grupo>().options.map((o) => o.name)).toEqual(['Bacon', 'Sem cebola'])

    const gravado = await grupoGravado(grupo.id)
    const comAcrescimo = await chamar(
      'PUT',
      url,
      editor,
      corpoDoGrupo(gravado, (c) => {
        c.options.push({ name: 'Ovo', priceDeltaInCents: 300 })
      }),
    )
    expect(comAcrescimo.statusCode).toBe(403)
    expect(comAcrescimo.json()).toMatchObject(faltou('products:price'))

    const mudaAcrescimo = await chamar(
      'PUT',
      url,
      editor,
      corpoDoGrupo(gravado, (c) => {
        if (c.options[0]) c.options[0].priceDeltaInCents = 100
      }),
    )
    expect(mudaAcrescimo.json()).toMatchObject(faltou('products:price'))
    expect(await grupoGravado(grupo.id)).toEqual(gravado)
  })

  it('o grupo enviado igual ao gravado não pede nenhuma das três', async () => {
    const cozinha = await com('products:read', 'products:availability')
    const grupo = await novoGrupo()

    const resposta = await chamar('PUT', `/option-groups/${grupo.id}`, cozinha, corpoDoGrupo(grupo))

    expect(resposta.statusCode, resposta.body).toBe(200)
  })

  it('criar um grupo é de quem altera os opcionais; com acréscimo, também de quem altera preços', async () => {
    const editor = await com('products:read', 'products:update')
    const financeiro = await com('products:read', 'products:price')
    const gratis = {
      name: 'Ponto da carne',
      minSelections: 1,
      maxSelections: 1,
      options: [
        { name: 'Ao ponto', priceDeltaInCents: 0 },
        { name: 'Bem passado', priceDeltaInCents: 0 },
      ],
    }
    const pago = { ...gratis, options: [{ name: 'Grande', priceDeltaInCents: 800 }] }

    expect((await chamar('POST', '/option-groups', editor, gratis)).statusCode).toBe(201)
    const recusado = await chamar('POST', '/option-groups', editor, pago)
    expect(recusado.statusCode).toBe(403)
    expect(recusado.json()).toMatchObject(faltou('products:price'))
    // Sem a permissão de alterar os opcionais, nem o grupo de graça.
    expect((await chamar('POST', '/option-groups', financeiro, gratis)).statusCode).toBe(403)
  })

  it('ligar grupos ao produto, os itens do combo e excluir um grupo são de quem altera o produto', async () => {
    const cozinha = await com('products:read', 'products:availability', 'products:price')
    const produto = await novoProduto()
    const grupo = await novoGrupo()

    const ligar = await chamar('PUT', `/products/${produto.id}/option-groups`, cozinha, {
      groupIds: [grupo.id],
    })
    const itens = await chamar('PUT', `/products/${produto.id}/combo-items`, cozinha, {
      items: [{ productId: produto.id, quantity: 1 }],
    })
    const excluir = await chamar('DELETE', `/option-groups/${grupo.id}`, cozinha)

    expect([ligar.statusCode, itens.statusCode, excluir.statusCode]).toEqual([403, 403, 403])
  })
})

describe('o que gravar um grupo muda', () => {
  const opcao = (id: string, name: string, priceDeltaInCents: number, isAvailable = true) => ({
    id,
    name,
    priceDeltaInCents,
    isAvailable,
  })
  const gravado = {
    name: 'Tamanho',
    description: null,
    minSelections: 1,
    maxSelections: 1,
    options: [opcao('p', 'Pequena', 0), opcao('m', 'Média', 500), opcao('g', 'Grande', 900, false)],
  }
  const enviado = (mudar: (dados: typeof gravado) => void = () => undefined) => {
    const dados = structuredClone(gravado)
    mudar(dados)
    return dados
  }
  const usa = (mudar?: (dados: typeof gravado) => void) =>
    permissoesParaGravarOGrupo(gravado, enviado(mudar))

  it('igual ao gravado: nenhuma', () => {
    expect(usa()).toEqual([])
  })

  it.each([
    [
      'o acréscimo de uma opção',
      (d: typeof gravado) => void (d.options[1]!.priceDeltaInCents = 600),
    ],
    [
      'o acréscimo levado a zero',
      (d: typeof gravado) => void (d.options[1]!.priceDeltaInCents = 0),
    ],
  ])('%s: a de preços', (_o, mudar) => {
    expect(usa(mudar)).toEqual(['products:price'])
  })

  it.each([
    ['esgotar uma opção', (d: typeof gravado) => void (d.options[0]!.isAvailable = false)],
    ['voltar a ter uma opção', (d: typeof gravado) => void (d.options[2]!.isAvailable = true)],
  ])('%s: a do que esgotou', (_o, mudar) => {
    expect(usa(mudar)).toEqual(['products:availability'])
  })

  it('uma opção enviada sem o "disponível" volta a estar disponível: é mudança, se estava esgotada', () => {
    const dados = {
      ...enviado(),
      options: gravado.options.map(({ id, name, priceDeltaInCents }) => ({
        id,
        name,
        priceDeltaInCents,
      })),
    }

    expect(permissoesParaGravarOGrupo(gravado, dados)).toEqual(['products:availability'])
  })

  it.each([
    ['o nome do grupo', (d: typeof gravado) => void (d.name = 'Tamanhos')],
    ['a descrição', (d: typeof gravado) => void ((d.description as string | null) = 'Escolha um.')],
    ['o mínimo', (d: typeof gravado) => void (d.minSelections = 0)],
    ['o máximo', (d: typeof gravado) => void (d.maxSelections = 2)],
    ['o nome de uma opção', (d: typeof gravado) => void (d.options[0]!.name = 'Broto')],
    ['uma opção tirada', (d: typeof gravado) => void d.options.pop()],
    ['a primeira opção tirada', (d: typeof gravado) => void d.options.shift()],
    ['as opções em outra ordem', (d: typeof gravado) => void d.options.reverse()],
  ])('%s: a de alterar', (_o, mudar) => {
    expect(usa(mudar)).toEqual(['products:update'])
  })

  it('uma opção nova de graça é alteração; com acréscimo, é também preço', () => {
    const nova = (priceDeltaInCents: number) =>
      permissoesParaGravarOGrupo(gravado, {
        ...enviado(),
        options: [...gravado.options, { name: 'Gigante', priceDeltaInCents }],
      })

    expect(nova(0)).toEqual(['products:update'])
    expect(nova(1500)).toEqual(['products:price', 'products:update'])
  })

  it('trocar uma opção por outra de mesmo nome não é um jeito de mudar o preço sem a permissão', () => {
    const dados = {
      ...enviado(),
      options: [
        gravado.options[0]!,
        { name: 'Média', priceDeltaInCents: 100 },
        gravado.options[2]!,
      ],
    }

    expect(permissoesParaGravarOGrupo(gravado, dados)).toEqual([
      'products:price',
      'products:update',
    ])
  })

  it('tudo de uma vez pede as três, na ordem do catálogo', () => {
    expect(
      usa((d) => {
        d.name = 'Outro'
        d.options[0]!.isAvailable = false
        d.options[1]!.priceDeltaInCents = 1
      }),
    ).toEqual(['products:price', 'products:availability', 'products:update'])
  })

  it('um grupo novo é alteração; com alguma opção com acréscimo, também preço', () => {
    expect(
      permissoesParaGravarOGrupo(
        null,
        enviado((d) => d.options.splice(1)),
      ),
    ).toEqual(['products:update'])
    expect(permissoesParaGravarOGrupo(null, enviado())).toEqual([
      'products:price',
      'products:update',
    ])
  })
})

describe('pausar o recebimento de pedidos não é alterar as configurações', () => {
  const recebendo = async () =>
    (await chamar('GET', '/settings', tokenDoDono)).json<{
      isAcceptingOrders: boolean
      minimumOrderInCents: number
      name: string
    }>()

  it('quem pausa, pausa e retoma — e não altera mais nada', async () => {
    const balcao = await com('settings:read', 'orders:pause')

    const pausou = await chamar('PATCH', '/settings', balcao, { isAcceptingOrders: false })
    expect(pausou.statusCode, pausou.body).toBe(200)
    expect(pausou.json()).toMatchObject({ isAcceptingOrders: false })
    expect(
      (await chamar('PATCH', '/settings', balcao, { isAcceptingOrders: true })).json(),
    ).toMatchObject({ isAcceptingOrders: true })

    const minimo = await chamar('PATCH', '/settings', balcao, { minimumOrderInCents: 5000 })
    expect(minimo.statusCode).toBe(403)
    expect(minimo.json()).toMatchObject(faltou('settings:update'))
    const nome = await chamar('PATCH', '/settings', balcao, { name: 'Tomado' })
    expect(nome.statusCode).toBe(403)
    expect((await recebendo()).name).not.toBe('Tomado')
  })

  it('pausar junto com outra mudança é recusado inteiro', async () => {
    const balcao = await com('settings:read', 'orders:pause')
    const antes = await recebendo()

    const resposta = await chamar('PATCH', '/settings', balcao, {
      isAcceptingOrders: !antes.isAcceptingOrders,
      minimumOrderInCents: antes.minimumOrderInCents + 100,
    })

    expect(resposta.statusCode).toBe(403)
    expect(await recebendo()).toEqual(antes)
  })

  it('o formulário inteiro, com só o "recebendo pedidos" mudado, passa', async () => {
    const balcao = await com('settings:read', 'orders:pause')
    const antes = await recebendo()

    const resposta = await chamar('PATCH', '/settings', balcao, {
      name: antes.name,
      minimumOrderInCents: antes.minimumOrderInCents,
      isAcceptingOrders: !antes.isAcceptingOrders,
    })

    expect(resposta.statusCode, resposta.body).toBe(200)
    expect(resposta.json()).toMatchObject({ isAcceptingOrders: !antes.isAcceptingOrders })
  })

  it('quem altera as configurações também pausa', async () => {
    const gerente = await com('settings:read', 'settings:update')
    const antes = await recebendo()

    const resposta = await chamar('PATCH', '/settings', gerente, {
      isAcceptingOrders: !antes.isAcceptingOrders,
    })

    expect(resposta.statusCode, resposta.body).toBe(200)
  })

  it('quem só vê as configurações não pausa', async () => {
    const soVe = await com('settings:read')

    const resposta = await chamar('PATCH', '/settings', soVe, { isAcceptingOrders: false })

    expect(resposta.statusCode).toBe(403)
    expect(resposta.json()).toMatchObject({
      error: { details: { anyOf: ['settings:update', 'orders:pause'] } },
    })
  })

  it('quem pausa não mexe em horários, entrega nem formas de pagamento', async () => {
    const balcao = await com('settings:read', 'orders:pause')

    // O 403 vem antes de o corpo ser lido: o que importa aqui é a rota.
    const horarios = await chamar('PUT', '/business-hours', balcao, {})
    const entrega = await chamar('PUT', '/delivery', balcao, {})
    const pagamento = await chamar('PUT', '/payment-methods', balcao, {})

    expect([horarios.statusCode, entrega.statusCode, pagamento.statusCode]).toEqual([403, 403, 403])
  })
})
