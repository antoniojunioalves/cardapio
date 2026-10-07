import type { Categoria, Produto } from '../../src/features/admin/catalog'
import type { GrupoDeOpcoes, Opcao } from '../../src/features/admin/option-groups'
import type { UsoDoPlano } from '../../src/features/admin/plan'
import { useSessaoStore } from '../../src/features/admin/session'
import { abrirComLocal, mockarRotas, type Resposta } from './pagina'

/**
 * O cardápio do painel nos testes: um estabelecimento, as sessões de quem
 * administra e de quem só lê, e uma API simulada que guarda o que recebe.
 */

export const ADMIN = '/lanchonete-do-ze/admin'

export const sessao = (permissions: string[]) => ({
  accessToken: 'token-de-acesso',
  user: { id: 'u', tenantId: 't', name: 'Zé', email: 'ze@exemplo.com', permissions },
  establishment: { id: 't', slug: 'lanchonete-do-ze', name: 'Lanchonete do Zé', status: 'ACTIVE' },
})
export const DONO = sessao([
  'orders:read',
  'settings:read',
  'categories:read',
  'categories:create',
  'categories:update',
  'categories:delete',
  'products:read',
  'products:create',
  'products:update',
  'products:delete',
])
export const ATENDENTE = sessao(['orders:read', 'categories:read', 'products:read'])

export const categoria = (
  dados: Partial<Categoria> & Pick<Categoria, 'id' | 'name'>,
): Categoria => ({
  description: null,
  imageUrl: null,
  isActive: true,
  sortOrder: 0,
  ...dados,
})
export const produto = (
  dados: Partial<Produto> & Pick<Produto, 'id' | 'name' | 'categoryId'>,
): Produto => ({
  type: 'SIMPLE',
  description: null,
  priceInCents: 1000,
  imageUrl: null,
  isAvailable: true,
  sortOrder: 0,
  ...dados,
})

/** A ordem de propósito embaralhada: quem ordena é a tela, pela posição. */
export const CATEGORIAS: Categoria[] = [
  categoria({ id: 'c-bebidas', name: 'Bebidas', sortOrder: 10 }),
  categoria({ id: 'c-sobremesas', name: 'Sobremesas', sortOrder: 20, isActive: false }),
  categoria({ id: 'c-lanches', name: 'Lanches', sortOrder: 0, description: 'Na chapa' }),
]
export const PRODUTOS: Produto[] = [
  produto({ id: 'p-refri', name: 'Refrigerante', categoryId: 'c-bebidas', priceInCents: 600 }),
  produto({
    id: 'p-combo',
    name: 'Combo do Zé',
    categoryId: 'c-lanches',
    type: 'COMBO',
    priceInCents: 3990,
    sortOrder: 20,
  }),
  produto({
    id: 'p-xburger',
    name: 'X-Burger',
    categoryId: 'c-lanches',
    priceInCents: 2590,
    sortOrder: 0,
  }),
  produto({
    id: 'p-xsalada',
    name: 'X-Salada',
    categoryId: 'c-lanches',
    priceInCents: 2790,
    sortOrder: 10,
    isAvailable: false,
  }),
]

const opcao = (id: string, name: string, priceDeltaInCents = 0, isAvailable = true): Opcao => ({
  id,
  name,
  priceDeltaInCents,
  isAvailable,
  sortOrder: 0,
})

/** Os grupos sem `products`: quem os usa a API simulada calcula, como a de verdade. */
export type GrupoGuardado = Omit<GrupoDeOpcoes, 'products' | 'isRequired'>

export const GRUPOS: GrupoGuardado[] = [
  {
    id: 'g-tamanho',
    name: 'Tamanho',
    description: null,
    minSelections: 1,
    maxSelections: 1,
    options: [opcao('o-normal', 'Normal'), opcao('o-grande', 'Grande', 600)],
  },
  {
    id: 'g-adicionais',
    name: 'Adicionais',
    description: 'Capriche no seu lanche',
    minSelections: 0,
    maxSelections: 2,
    options: [
      opcao('o-bacon', 'Bacon', 500),
      opcao('o-cheddar', 'Cheddar', 400),
      opcao('o-ovo', 'Ovo', 300, false),
    ],
  },
  {
    id: 'g-retirar',
    name: 'Retirar',
    description: null,
    minSelections: 0,
    maxSelections: 2,
    options: [opcao('o-cebola', 'Cebola'), opcao('o-tomate', 'Tomate')],
  },
]

/** Quais grupos cada produto usa, na ordem em que o cliente os vê. */
export const GRUPOS_DOS_PRODUTOS: Record<string, string[]> = {
  'p-xburger': ['g-tamanho', 'g-adicionais'],
  'p-xsalada': ['g-adicionais'],
}

export const COMPOSICOES: Record<string, { productId: string; quantity: number }[]> = {
  'p-combo': [
    { productId: 'p-xburger', quantity: 1 },
    { productId: 'p-refri', quantity: 1 },
  ],
}

export function plano(
  produtos: [number, number | null],
  categorias: [number, number | null],
): UsoDoPlano {
  return {
    plan: { code: 'FREE', name: 'Grátis' },
    orders: { used: 0, limit: 100, ceiling: 110, state: 'LIVRE' },
    users: { active: 1, limit: 2 },
    products: { used: produtos[0], limit: produtos[1] },
    categories: { used: categorias[0], limit: categorias[1] },
  }
}

export interface Api {
  categorias?: Categoria[]
  produtos?: Produto[]
  grupos?: GrupoGuardado[]
  gruposDosProdutos?: Record<string, string[]>
  composicoes?: Record<string, { productId: string; quantity: number }[]>
  plano?: UsoDoPlano
  /** Respostas forçadas, por `MÉTODO /caminho` depois de `/admin`: `'POST /categories'`. */
  forcar?: Record<string, Resposta>
}

export interface Envio {
  metodo: string
  caminho: string
  corpo: unknown
}

export const conflito = (code: string, message: string): Resposta => ({
  status: 409,
  corpo: { error: { code, message } },
})

const naoEncontrado = (message: string): Resposta => ({
  status: 404,
  corpo: { error: { message } },
})

/**
 * Uma API do cardápio que guarda o que recebe: criar, alterar, reordenar e
 * excluir mudam o que as leituras seguintes devolvem. Devolve o que foi
 * enviado, sem as leituras.
 */
export function simularApi(api: Api = {}) {
  let categorias = structuredClone(api.categorias ?? CATEGORIAS)
  let produtos = structuredClone(api.produtos ?? PRODUTOS)
  let grupos = structuredClone(api.grupos ?? GRUPOS)
  const gruposDosProdutos = structuredClone(api.gruposDosProdutos ?? GRUPOS_DOS_PRODUTOS)
  const composicoes = structuredClone(api.composicoes ?? COMPOSICOES)
  let novos = 0
  const enviados: Envio[] = []
  const ok = (corpo: unknown): Resposta => ({ status: 200, corpo })

  /** O grupo como a API devolve: com o obrigatório e com quem o usa. */
  const grupoCompleto = (g: GrupoGuardado): GrupoDeOpcoes => ({
    ...g,
    isRequired: g.minSelections >= 1,
    products: Object.entries(gruposDosProdutos)
      .filter(([, ids]) => ids.includes(g.id))
      .flatMap(([pid]) => {
        const p = produtos.find((x) => x.id === pid)
        return p ? [{ id: p.id, name: p.name }] : []
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  })
  const doProduto = (pid: string) =>
    (gruposDosProdutos[pid] ?? []).flatMap((gid) => {
      const g = grupos.find((x) => x.id === gid)
      return g ? [grupoCompleto(g)] : []
    })
  const composicao = (cid: string) => {
    const items = (composicoes[cid] ?? []).map((item) => {
      const p = produtos.find((x) => x.id === item.productId)
      return {
        productId: item.productId,
        name: p?.name ?? '',
        priceInCents: p?.priceInCents ?? 0,
        isAvailable: p?.isAvailable ?? false,
        quantity: item.quantity,
      }
    })
    return {
      items,
      precoAvulsoEmCentavos: items.reduce((s, i) => s + i.priceInCents * i.quantity, 0),
      todosDisponiveis: items.every((i) => i.isAvailable),
    }
  }
  const gravarOpcoes = (opcoes: { id?: string; name: string }[]): Opcao[] =>
    opcoes.map((o, i) => ({
      ...(o as Omit<Opcao, 'id' | 'sortOrder'>),
      id: o.id ?? `o-nova-${String(++novos)}`,
      sortOrder: i * 10,
    }))

  mockarRotas((url, metodo, corpo) => {
    const caminho = /\/api\/v1\/admin(\/.*)$/.exec(url)?.[1] ?? url
    if (metodo !== 'GET') enviados.push({ metodo, caminho, corpo })
    const forcada = api.forcar?.[`${metodo} ${caminho}`]
    if (forcada) return forcada

    const dados = (corpo ?? {}) as Record<string, unknown>
    const [, recurso, id, sub] = caminho.split('/')

    if (caminho === '/plan') return ok(api.plano ?? plano([4, 20], [3, 10]))
    if (caminho === '/setup-checklist') return ok({ ready: true, steps: [] })
    if (caminho === '/orders/summary') return ok({ new: 0, inProgress: 0, completedToday: 0 })

    if (recurso === 'categories') {
      if (id === 'order') {
        const ids = dados.ids as string[]
        categorias = ids.map((cid, i) => ({
          ...(categorias.find((c) => c.id === cid) as Categoria),
          sortOrder: i * 10,
        }))
        return ok(categorias)
      }
      if (metodo === 'GET') return ok(categorias)
      if (metodo === 'POST') {
        const criada = categoria({
          id: `c-nova-${String(++novos)}`,
          sortOrder: 100,
          ...(dados as Partial<Categoria>),
          name: dados.name as string,
        })
        categorias.push(criada)
        return { status: 201, corpo: criada }
      }
      if (metodo === 'PATCH') {
        categorias = categorias.map((c) => (c.id === id ? { ...c, ...dados } : c))
        return ok(categorias.find((c) => c.id === id))
      }
      if (metodo === 'DELETE') {
        categorias = categorias.filter((c) => c.id !== id)
        return { status: 204, corpo: undefined }
      }
    }

    if (recurso === 'option-groups') {
      const achado = grupos.find((g) => g.id === id)
      if (metodo === 'GET' && !id) {
        return ok(
          [...grupos].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(grupoCompleto),
        )
      }
      if (metodo === 'POST') {
        const criado: GrupoGuardado = {
          id: `g-novo-${String(++novos)}`,
          name: dados.name as string,
          description: (dados.description as string | null | undefined) ?? null,
          minSelections: dados.minSelections as number,
          maxSelections: dados.maxSelections as number,
          options: gravarOpcoes(dados.options as { name: string }[]),
        }
        grupos.push(criado)
        return { status: 201, corpo: grupoCompleto(criado) }
      }
      if (!achado) return naoEncontrado('Grupo de opções não encontrado.')
      if (metodo === 'GET') return ok(grupoCompleto(achado))
      if (metodo === 'PUT') {
        const alterado: GrupoGuardado = {
          ...achado,
          name: dados.name as string,
          description: (dados.description as string | null | undefined) ?? null,
          minSelections: dados.minSelections as number,
          maxSelections: dados.maxSelections as number,
          options: gravarOpcoes(dados.options as { id?: string; name: string }[]),
        }
        grupos = grupos.map((g) => (g.id === id ? alterado : g))
        return ok(grupoCompleto(alterado))
      }
      if (metodo === 'DELETE') {
        const usam = grupoCompleto(achado).products.length
        if (usam > 0) {
          return conflito(
            'OPTION_GROUP_IN_USE',
            `O grupo está em uso por ${String(usam)} produto(s). Desligue-o deles antes.`,
          )
        }
        grupos = grupos.filter((g) => g.id !== id)
        return { status: 204, corpo: undefined }
      }
    }

    if (recurso === 'products') {
      if (id === 'order') {
        const ids = dados.ids as string[]
        const daCategoria = ids.map((pid, i) => ({
          ...(produtos.find((p) => p.id === pid) as Produto),
          sortOrder: i * 10,
        }))
        produtos = produtos.map((p) => daCategoria.find((d) => d.id === p.id) ?? p)
        return ok(daCategoria)
      }
      if (sub === 'image') {
        const imageUrl = metodo === 'PUT' ? 'http://api/uploads/foto-nova.webp' : null
        produtos = produtos.map((p) => (p.id === id ? { ...p, imageUrl } : p))
        return ok(produtos.find((p) => p.id === id))
      }
      if (sub === 'option-groups' && id) {
        if (metodo === 'PUT') gruposDosProdutos[id] = dados.groupIds as string[]
        return ok(doProduto(id))
      }
      if (sub === 'combo-items' && id) {
        if (metodo === 'PUT') {
          composicoes[id] = dados.items as { productId: string; quantity: number }[]
        }
        return ok(composicao(id))
      }
      if (metodo === 'GET' && id) {
        const achado = produtos.find((p) => p.id === id)
        return achado ? ok(achado) : naoEncontrado('Produto não encontrado.')
      }
      if (metodo === 'GET') return ok(produtos)
      if (metodo === 'POST') {
        const criado = produto({
          id: `p-novo-${String(++novos)}`,
          ...(dados as Partial<Produto>),
          name: dados.name as string,
          categoryId: dados.categoryId as string,
        })
        produtos.push(criado)
        return { status: 201, corpo: criado }
      }
      if (metodo === 'PATCH') {
        produtos = produtos.map((p) => (p.id === id ? { ...p, ...dados } : p))
        return ok(produtos.find((p) => p.id === id))
      }
      if (metodo === 'DELETE') {
        produtos = produtos.filter((p) => p.id !== id)
        return { status: 204, corpo: undefined }
      }
    }
    return ok({})
  })
  return enviados
}

/** O painel num endereço do cardápio (`/cardapio…`), com a API simulada. */
export function abrirNoCardapio(caminho: string, api: Api = {}, comSessao = DONO) {
  const enviados = simularApi(api)
  useSessaoStore.getState().guardar(comSessao)
  abrirComLocal(`${ADMIN}/cardapio${caminho}`)
  return enviados
}
