import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { acoesDoPedido } from '../src/features/admin/orders'
import { avisoDoPlano, type UsoDoPlano } from '../src/features/admin/plan'
import { apagarSessaoAntiga, comSessao, useSessaoStore } from '../src/features/admin/session'
import type { PedidoDoPainel } from '../src/features/admin/types'
import { cardapioDoZe } from './helpers/cardapio'
import { abrir } from './helpers/pagina'

// --- WebSocket falso ---------------------------------------------------------

class WebSocketFalso {
  static instancias: WebSocketFalso[] = []
  readonly url: string
  readonly enviados: string[] = []
  private ouvintes: Record<string, ((evento: unknown) => void)[]> = {}
  fechadoPeloPainel = false

  constructor(url: string) {
    this.url = url
    WebSocketFalso.instancias.push(this)
  }
  addEventListener(tipo: string, ouvinte: (evento: unknown) => void) {
    ;(this.ouvintes[tipo] ??= []).push(ouvinte)
  }
  send(dado: string) {
    this.enviados.push(dado)
  }
  close() {
    this.fechadoPeloPainel = true
  }
  // Controles do teste:
  abrir() {
    this.emitir('open', {})
  }
  receber(mensagem: object) {
    this.emitir('message', { data: JSON.stringify(mensagem) })
  }
  fechar(code: number) {
    this.emitir('close', { code })
  }
  private emitir(tipo: string, evento: unknown) {
    act(() => {
      for (const ouvinte of this.ouvintes[tipo] ?? []) ouvinte(evento)
    })
  }
}

const ultimoSocket = async () => {
  await waitFor(() => {
    expect(WebSocketFalso.instancias.length).toBeGreaterThan(0)
  })
  return WebSocketFalso.instancias.at(-1) as WebSocketFalso
}

// --- API simulada ------------------------------------------------------------

function pedido(extra: Partial<PedidoDoPainel> = {}): PedidoDoPainel {
  return {
    id: '00000000-0000-7000-8000-000000000001',
    number: 1,
    status: 'RECEIVED',
    fulfillment: 'DELIVERY',
    customer: { id: 'c', name: 'Maria Oliveira', phone: '5511987654321' },
    address: {
      postalCode: '01452000',
      street: 'Rua dos Ipês',
      number: '450',
      complement: 'apto 12',
      neighborhood: 'Jardim Paulista',
      city: 'São Paulo',
      reference: 'Portão azul',
    },
    deliveryRegionName: null,
    payment: { code: 'CASH', name: 'Dinheiro', kind: 'CASH', changeForInCents: 5000 },
    notes: 'Interfone quebrado',
    subtotalInCents: 3600,
    deliveryFeeInCents: 500,
    totalInCents: 4100,
    cancellationReason: null,
    items: [
      {
        id: 'i1',
        productName: 'X-Salada',
        productType: 'SIMPLE',
        unitPriceInCents: 3100,
        quantity: 1,
        totalInCents: 3100,
        notes: 'sem cebola',
        comboComponents: null,
        options: [{ groupName: 'Adicionais', optionName: 'Bacon', priceDeltaInCents: 500 }],
      },
    ],
    createdAt: '2026-09-29T15:00:00.000Z',
    statusChangedAt: '2026-09-29T15:00:00.000Z',
    ...extra,
  }
}

function plano(extra: Partial<UsoDoPlano['orders']>): UsoDoPlano {
  return {
    plan: { code: 'FREE', name: 'Gratuito' },
    orders: { used: 10, limit: 100, ceiling: 110, state: 'LIVRE', ...extra },
    users: { active: 1, limit: 2 },
  }
}
const LIVRE = plano({})

const SESSAO = {
  accessToken: 'token-de-acesso',
  user: {
    id: 'u',
    tenantId: 't',
    name: 'Zé',
    email: 'ze@exemplo.com',
    permissions: ['orders:read', 'orders:update'],
  },
}

interface Api {
  pedidos: PedidoDoPainel[]
  plano?: UsoDoPlano
  login?: { status: number; corpo: unknown }
  /** Respostas da lista, na ordem; a última se repete. */
  listas?: { status: number; corpo: unknown }[]
}

function mockarApi(api: Api) {
  let chamadasDaLista = 0
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET'
    let resposta: { status: number; corpo: unknown } = { status: 200, corpo: cardapioDoZe() }
    if (url.endsWith('/auth/login')) resposta = api.login ?? { status: 200, corpo: SESSAO }
    else if (url.endsWith('/auth/refresh')) resposta = { status: 200, corpo: SESSAO }
    else if (url.endsWith('/admin/plan')) resposta = { status: 200, corpo: api.plano ?? LIVRE }
    else if (url.includes('/admin/orders') && metodo === 'GET') {
      const listas = api.listas ?? [{ status: 200, corpo: api.pedidos }]
      resposta = listas[Math.min(chamadasDaLista, listas.length - 1)] ?? resposta
      chamadasDaLista += 1
    } else if (url.includes('/status') && metodo === 'PATCH') {
      resposta = { status: 200, corpo: api.pedidos[0] }
    }
    return Promise.resolve({
      ok: resposta.status < 400,
      status: resposta.status,
      json: () => Promise.resolve(resposta.corpo),
    })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const chamadas = (fetch: ReturnType<typeof mockarApi>, trecho: string, metodo = 'GET') =>
  fetch.mock.calls.filter(
    ([url, init]) => url.includes(trecho) && (init?.method ?? 'GET') === metodo,
  )

function logar() {
  useSessaoStore.getState().guardar('lanchonete-do-ze', SESSAO)
}

async function abrirPainel(api: Api) {
  logar()
  const fetch = mockarApi(api)
  abrir('/lanchonete-do-ze/admin/pedidos')
  await screen.findByRole('heading', { level: 1, name: 'Pedidos' })
  return fetch
}

beforeEach(() => {
  localStorage.clear()
  useSessaoStore.setState({ slug: null, usuario: null, accessToken: null })
  WebSocketFalso.instancias = []
  vi.stubGlobal('WebSocket', WebSocketFalso)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// --- Testes ------------------------------------------------------------------

describe('login do painel', () => {
  it('e-mail ou senha errados dizem isso', async () => {
    mockarApi({ pedidos: [], login: { status: 401, corpo: { error: { code: 'UNAUTHORIZED' } } } })
    abrir('/lanchonete-do-ze/admin')

    fireEvent.change(await screen.findByLabelText('E-mail'), {
      target: { value: 'ze@exemplo.com' },
    })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'errada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha não conferem.')
  })

  it('entra, vai para os pedidos, e nenhum token fica guardado no navegador', async () => {
    const fetch = mockarApi({ pedidos: [] })
    abrir('/lanchonete-do-ze/admin')

    fireEvent.change(await screen.findByLabelText('E-mail'), {
      target: { value: 'ze@exemplo.com' },
    })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'cardapio123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Pedidos' })).toBeInTheDocument()
    const [login] = chamadas(fetch, '/auth/login', 'POST')
    expect(JSON.parse(login?.[1]?.body as string)).toEqual({
      tenantSlug: 'lanchonete-do-ze',
      email: 'ze@exemplo.com',
      password: 'cardapio123',
    })
    // O refresh token fica no cookie httpOnly, que a API define — e que o
    // login precisa aceitar (`credentials: 'include'`).
    expect(login?.[1]?.credentials).toBe('include')
    const guardado = localStorage.getItem('painel') ?? ''
    expect(guardado).toContain('lanchonete-do-ze')
    expect(guardado).not.toContain('token-de-acesso')
  })

  it('sem sessão, o painel manda para o login', async () => {
    mockarApi({ pedidos: [] })
    abrir('/lanchonete-do-ze/admin/pedidos')
    expect(await screen.findByRole('heading', { name: 'Painel do estabelecimento' })).toBeVisible()
  })

  it('sessão de outro estabelecimento não abre este painel', async () => {
    useSessaoStore.getState().guardar('pizzaria-da-esquina', SESSAO)
    mockarApi({ pedidos: [] })
    abrir('/lanchonete-do-ze/admin/pedidos')
    expect(await screen.findByRole('heading', { name: 'Painel do estabelecimento' })).toBeVisible()
  })
})

describe('lista de pedidos', () => {
  it('mostra os pedidos em andamento, e o novo já aberto com o endereço completo', async () => {
    await abrirPainel({
      pedidos: [
        pedido(),
        pedido({
          id: 'p2',
          number: 2,
          status: 'COMPLETED',
          customer: { id: 'c2', name: 'João', phone: '1' },
        }),
      ],
    })

    const novo = await screen.findByRole('article', { name: 'Pedido #1' })
    expect(
      within(novo).getByText(
        'Rua dos Ipês, 450, apto 12 — Jardim Paulista, São Paulo — CEP 01452-000 (Portão azul)',
      ),
    ).toBeVisible()
    expect(within(novo).getByText('Obs.: sem cebola')).toBeVisible()
    expect(within(novo).getByText('Bacon')).toBeVisible()
    expect(within(novo).getByText('Interfone quebrado')).toBeVisible()
    expect(screen.queryByRole('article', { name: 'Pedido #2' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Encerrados' }))
    expect(screen.getByRole('article', { name: 'Pedido #2' })).toBeVisible()
  })

  it('o título da aba conta os pedidos que esperam ser aceitos', async () => {
    await abrirPainel({ pedidos: [pedido(), pedido({ id: 'p3', number: 3 })] })
    await screen.findByRole('article', { name: 'Pedido #1' })
    expect(document.title).toBe('(2) Pedidos novos')
  })

  it('os botões seguem o caminho do status: retirada não tem "saiu para entrega"', () => {
    expect(acoesDoPedido({ status: 'READY', fulfillment: 'PICKUP' })).toEqual(['COMPLETED'])
    expect(acoesDoPedido({ status: 'READY', fulfillment: 'DELIVERY' })).toEqual([
      'OUT_FOR_DELIVERY',
      'COMPLETED',
    ])
    expect(acoesDoPedido({ status: 'CANCELLED', fulfillment: 'DELIVERY' })).toEqual([])
  })

  it('"Aceitar" muda o status pela API e relê a lista', async () => {
    const fetch = await abrirPainel({ pedidos: [pedido()] })
    const card = await screen.findByRole('article', { name: 'Pedido #1' })

    fireEvent.click(within(card).getByRole('button', { name: 'Aceitar' }))

    await waitFor(() => {
      expect(chamadas(fetch, '/status', 'PATCH')).toHaveLength(1)
    })
    const [url, init] = chamadas(fetch, '/status', 'PATCH')[0] ?? []
    expect(url).toContain('/api/v1/admin/orders/00000000-0000-7000-8000-000000000001/status')
    expect(JSON.parse(init?.body as string)).toEqual({ status: 'ACCEPTED' })
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer token-de-acesso')
    await waitFor(() => {
      expect(chamadas(fetch, '/admin/orders').length).toBeGreaterThan(1)
    })
  })

  it('cancelar pede um motivo antes de enviar', async () => {
    const fetch = await abrirPainel({ pedidos: [pedido()] })
    const card = await screen.findByRole('article', { name: 'Pedido #1' })

    fireEvent.click(within(card).getByRole('button', { name: 'Cancelar' }))
    const janela = screen.getByRole('dialog', { name: 'Cancelar o pedido #1' })
    const confirmar = within(janela).getByRole('button', { name: 'Cancelar o pedido' })
    expect(confirmar).toBeDisabled()

    fireEvent.change(within(janela).getByLabelText('Motivo'), {
      target: { value: 'Cliente desistiu' },
    })
    fireEvent.click(confirmar)

    await waitFor(() => {
      expect(chamadas(fetch, '/status', 'PATCH')).toHaveLength(1)
    })
    expect(JSON.parse(chamadas(fetch, '/status', 'PATCH')[0]?.[1]?.body as string)).toEqual({
      status: 'CANCELLED',
      reason: 'Cliente desistiu',
    })
  })
})

describe('pedidos ao vivo', () => {
  it('autentica pela primeira mensagem, fica "Ao vivo" e relê a lista a cada aviso', async () => {
    const fetch = await abrirPainel({
      pedidos: [],
      listas: [
        { status: 200, corpo: [] },
        { status: 200, corpo: [] },
        { status: 200, corpo: [pedido({ number: 7 })] },
      ],
    })

    const socket = await ultimoSocket()
    expect(socket.url).toBe('ws://localhost:3333/api/v1/admin/orders/stream')
    socket.abrir()
    expect(JSON.parse(socket.enviados[0] ?? '{}')).toEqual({
      type: 'auth',
      token: 'token-de-acesso',
    })

    socket.receber({ type: 'ready' })
    expect(screen.getByRole('status')).toHaveTextContent('Ao vivo')

    socket.receber({ type: 'order.created', orderId: 'x', number: 7 })
    expect(await screen.findByRole('article', { name: 'Pedido #7' })).toBeVisible()
    expect(chamadas(fetch, '/admin/orders').length).toBeGreaterThanOrEqual(3)
  })

  it('sessão expirada (4001) renova o token e reconecta', async () => {
    const fetch = await abrirPainel({ pedidos: [] })
    const primeiro = await ultimoSocket()
    primeiro.abrir()
    primeiro.fechar(4001)

    expect(screen.getByRole('status')).toHaveTextContent('Reconectando…')
    await waitFor(() => {
      expect(WebSocketFalso.instancias).toHaveLength(2)
    })
    expect(chamadas(fetch, '/auth/refresh', 'POST')).toHaveLength(1)
  })

  it('sem permissão (4003) não tenta de novo e avisa', async () => {
    await abrirPainel({ pedidos: [] })
    const socket = await ultimoSocket()
    socket.abrir()
    socket.fechar(4003)

    expect(screen.getByRole('status')).toHaveTextContent('Sem atualização ao vivo')
    expect(screen.getByText(/a lista é atualizada a cada minuto/)).toBeVisible()
    await new Promise((r) => setTimeout(r, 50))
    expect(WebSocketFalso.instancias).toHaveLength(1)
  })

  it('sair fecha a conexão e volta ao login', async () => {
    const fetch = await abrirPainel({ pedidos: [] })
    const socket = await ultimoSocket()

    fireEvent.click(screen.getByRole('button', { name: 'Sair' }))

    expect(await screen.findByRole('heading', { name: 'Painel do estabelecimento' })).toBeVisible()
    expect(socket.fechadoPeloPainel).toBe(true)
    expect(useSessaoStore.getState().slug).toBeNull()
    // O logout leva o cookie, para a API revogar e apagá-lo.
    const [logout] = chamadas(fetch, '/auth/logout', 'POST')
    expect(logout?.[1]?.credentials).toBe('include')
  })
})

describe('sessão', () => {
  it('apaga o refresh token que versões antigas guardavam no navegador', () => {
    localStorage.setItem('sessao-do-painel', '{"state":{"refreshToken":"antigo"}}')
    apagarSessaoAntiga()
    expect(localStorage.getItem('sessao-do-painel')).toBeNull()
  })

  it('um 401 renova a sessão uma vez e repete a chamada', async () => {
    logar()
    let lista = 0
    // `_init` declarado para o teste poder ler as opções da chamada.
    const fetch = vi.fn((url: string, _init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(SESSAO) })
      }
      lista += 1
      const status = lista === 1 ? 401 : 200
      return Promise.resolve({
        ok: status < 400,
        status,
        json: () => Promise.resolve(status === 401 ? { error: { code: 'UNAUTHORIZED' } } : []),
      })
    })
    vi.stubGlobal('fetch', fetch)

    await expect(comSessao('/api/v1/admin/orders')).resolves.toEqual([])
    const renovacoes = fetch.mock.calls.filter(([u]) => u.endsWith('/auth/refresh'))
    expect(renovacoes).toHaveLength(1)
    // Sem corpo: o refresh token vai no cookie.
    expect(renovacoes[0]?.[1]).toMatchObject({ method: 'POST', credentials: 'include' })
    expect(renovacoes[0]?.[1]).not.toHaveProperty('body')
  })

  it('chamadas simultâneas sem token dividem uma renovação só', async () => {
    logar()
    useSessaoStore.setState({ accessToken: null })
    const fetch = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(url.endsWith('/auth/refresh') ? SESSAO : []),
      }),
    )
    vi.stubGlobal('fetch', fetch)

    await Promise.all([comSessao('/a'), comSessao('/b'), comSessao('/c')])
    // Duas renovações com o mesmo refresh token o servidor trataria como roubo.
    expect(fetch.mock.calls.filter(([u]) => u.endsWith('/auth/refresh'))).toHaveLength(1)
  })

  it('refresh recusado encerra a sessão', async () => {
    logar()
    useSessaoStore.setState({ accessToken: null })
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED' } }),
        }),
      ),
    )

    await expect(comSessao('/a')).rejects.toThrow()
    expect(useSessaoStore.getState().slug).toBeNull()
  })
})

describe('aviso do plano', () => {
  it('um nível para cada situação, e nada quando está livre ou é ilimitado', () => {
    expect(avisoDoPlano(LIVRE)).toBeNull()
    expect(avisoDoPlano(plano({ limit: null, ceiling: null, used: 5000 }))).toBeNull()
    expect(avisoDoPlano({ ...LIVRE, plan: null })).toBeNull()

    expect(avisoDoPlano(plano({ used: 85, state: 'PERTO_DO_LIMITE' }))).toEqual({
      nivel: 'atencao',
      texto: 'Você recebeu 85 de 100 pedidos deste mês no plano Gratuito.',
    })
    expect(avisoDoPlano(plano({ used: 104, state: 'NA_TOLERANCIA' }))?.texto).toContain(
      'continua recebendo até 110 pedidos',
    )
    const bloqueado = avisoDoPlano(plano({ used: 110, state: 'BLOQUEADO' }))
    expect(bloqueado?.nivel).toBe('alerta')
    expect(bloqueado?.texto).toContain('O cardápio parou de receber pedidos')
  })

  it('o painel mostra o aviso quando o plano está no limite', async () => {
    await abrirPainel({ pedidos: [], plano: plano({ used: 110, state: 'BLOQUEADO' }) })
    expect(await screen.findByRole('note')).toHaveTextContent('O cardápio parou de receber pedidos')
  })

  it('um pedido novo manda reler o uso do plano', async () => {
    const fetch = await abrirPainel({ pedidos: [] })
    const socket = await ultimoSocket()
    socket.abrir()
    socket.receber({ type: 'ready' })
    await waitFor(() => {
      expect(chamadas(fetch, '/admin/plan').length).toBeGreaterThan(0)
    })
    const antes = chamadas(fetch, '/admin/plan').length

    socket.receber({ type: 'order.created', orderId: 'x', number: 9 })

    await waitFor(() => {
      expect(chamadas(fetch, '/admin/plan').length).toBeGreaterThan(antes)
    })
  })
})
