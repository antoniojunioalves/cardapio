import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Checklist } from '../src/features/admin/checklist'
import { itensDoMenu } from '../src/features/admin/menu'
import { acoesDoPedido } from '../src/features/admin/orders'
import { avisoDoPlano, type UsoDoPlano } from '../src/features/admin/plan'
import { comSessao, useSessaoStore } from '../src/features/admin/session'
import type { ResumoDosPedidos } from '../src/features/admin/summary'
import type { PedidoDoPainel } from '../src/features/admin/types'
import { cardapioDoZe } from './helpers/cardapio'
import { abrir, abrirComLocal, localAtual, mockarRotas, type Resposta } from './helpers/pagina'

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
  establishment: { id: 't', slug: 'lanchonete-do-ze', name: 'Lanchonete do Zé', status: 'ACTIVE' },
}

/** O resumo que a API devolveria para estes pedidos. */
function resumoDe(pedidos: PedidoDoPainel[]): ResumoDosPedidos {
  const contar = (...status: PedidoDoPainel['status'][]) =>
    pedidos.filter((p) => status.includes(p.status)).length
  return {
    new: contar('RECEIVED'),
    inProgress: contar('ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'),
    completedToday: contar('COMPLETED'),
  }
}

interface Api {
  pedidos: PedidoDoPainel[]
  plano?: UsoDoPlano
  login?: { status: number; corpo: unknown }
  /** Respostas da lista, na ordem; a última se repete. */
  listas?: { status: number; corpo: unknown }[]
  /** Respostas do resumo, na ordem; a última se repete. Sem elas, o resumo sai de `pedidos`. */
  resumos?: { status: number; corpo: unknown }[]
  /** A lista "o que falta para receber pedidos". Sem ela, está tudo feito. */
  checklist?: Checklist
}

const TUDO_FEITO: Checklist = { ready: true, steps: [] }

/** A lista de pedidos, e não o resumo, que mora debaixo do mesmo endereço. */
const LISTA = '/admin/orders?'
const RESUMO = '/admin/orders/summary'

function mockarApi(api: Api) {
  let chamadasDaLista = 0
  let chamadasDoResumo = 0
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET'
    let resposta: { status: number; corpo: unknown } = { status: 200, corpo: cardapioDoZe() }
    if (url.endsWith('/auth/login')) resposta = api.login ?? { status: 200, corpo: SESSAO }
    else if (url.endsWith('/auth/refresh')) resposta = { status: 200, corpo: SESSAO }
    else if (url.endsWith('/admin/plan')) resposta = { status: 200, corpo: api.plano ?? LIVRE }
    else if (url.endsWith('/admin/setup-checklist')) {
      resposta = { status: 200, corpo: api.checklist ?? TUDO_FEITO }
    } else if (url.endsWith(RESUMO)) {
      const resumos = api.resumos ?? [{ status: 200, corpo: resumoDe(api.pedidos) }]
      resposta = resumos[Math.min(chamadasDoResumo, resumos.length - 1)] ?? resposta
      chamadasDoResumo += 1
    } else if (url.includes(LISTA) && metodo === 'GET') {
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
  useSessaoStore.getState().guardar(SESSAO)
}

async function abrirPainel(api: Api) {
  logar()
  const fetch = mockarApi(api)
  abrir('/lanchonete-do-ze/admin/pedidos')
  await screen.findByRole('heading', { level: 1, name: 'Pedidos' })
  return fetch
}

/** O Início do painel, em `/lanchonete-do-ze/admin`, com o marcador do endereço. */
async function abrirInicio(api: Api, sessao = SESSAO) {
  useSessaoStore.getState().guardar(sessao)
  const fetch = mockarApi(api)
  abrirComLocal('/lanchonete-do-ze/admin')
  await screen.findByRole('heading', { level: 1, name: 'Olá, Zé' })
  return fetch
}

/** Quem atende sem ver pedidos: nenhuma permissão do painel. */
const SEM_PEDIDOS = { ...SESSAO, user: { ...SESSAO.user, permissions: [] as string[] } }

beforeEach(() => {
  localStorage.clear()
  useSessaoStore.setState({ slug: null, estabelecimento: null, usuario: null, accessToken: null })
  WebSocketFalso.instancias = []
  vi.stubGlobal('WebSocket', WebSocketFalso)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// --- Testes ------------------------------------------------------------------

describe('login do painel', () => {
  function preencher(email: string, senha: string) {
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: senha } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
  }

  it('e-mail ou senha errados dizem isso', async () => {
    mockarApi({ pedidos: [], login: { status: 401, corpo: { error: { code: 'UNAUTHORIZED' } } } })
    abrirComLocal('/entrar')

    preencher('ze@exemplo.com', 'errada')

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha não conferem.')
    expect(localAtual()).toBe('/entrar')
  })

  it('entra só com e-mail e senha, e vai para o painel do estabelecimento que a API devolveu', async () => {
    const fetch = mockarApi({ pedidos: [] })
    abrirComLocal('/entrar')

    preencher(' ze@exemplo.com ', 'cardapio123')

    expect(await screen.findByRole('heading', { level: 1, name: 'Olá, Zé' })).toBeInTheDocument()
    expect(localAtual()).toBe('/lanchonete-do-ze/admin')

    // Nenhum endereço de estabelecimento vai na requisição: quem diz é a API.
    const [login] = chamadas(fetch, '/auth/login', 'POST')
    expect(JSON.parse(login?.[1]?.body as string)).toEqual({
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

  it.each([
    ['Este estabelecimento está suspenso. Fale com o suporte.'],
    ['Esta conta está desativada. Fale com o administrador.'],
  ])('com a senha certa, diz por que não entra: %s', async (mensagem) => {
    mockarApi({
      pedidos: [],
      login: { status: 403, corpo: { error: { code: 'FORBIDDEN', message: mensagem } } },
    })
    abrirComLocal('/entrar')

    preencher('ze@exemplo.com', 'cardapio123')

    expect(await screen.findByRole('alert')).toHaveTextContent(mensagem)
    expect(localAtual()).toBe('/entrar')
  })

  it('muitas tentativas pedem para esperar', async () => {
    mockarApi({ pedidos: [], login: { status: 429, corpo: { error: { code: 'RATE_LIMITED' } } } })
    abrirComLocal('/entrar')

    preencher('ze@exemplo.com', 'cardapio123')

    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas.')
  })

  it('quem já entrou neste aparelho vai direto para o painel, sem digitar nada', async () => {
    logar()
    mockarApi({ pedidos: [] })
    abrirComLocal('/entrar')

    expect(await screen.findByRole('heading', { level: 1, name: 'Olá, Zé' })).toBeInTheDocument()
    expect(localAtual()).toBe('/lanchonete-do-ze/admin')
  })

  it.each(['/lanchonete-do-ze/admin', '/lanchonete-do-ze/admin/pedidos'])(
    'sem sessão, %s manda para o login, sem pedir nada à API',
    async (caminho) => {
      const fetch = mockarApi({ pedidos: [] })
      abrirComLocal(caminho)

      expect(await screen.findByRole('heading', { name: 'Entrar no painel' })).toBeVisible()
      expect(localAtual()).toBe('/entrar')
      expect(fetch).not.toHaveBeenCalled()
      expect(WebSocketFalso.instancias).toHaveLength(0)
    },
  )

  it('sessão de outro estabelecimento não abre este painel: a pessoa cai no dela', async () => {
    useSessaoStore.getState().guardar({
      ...SESSAO,
      establishment: { ...SESSAO.establishment, slug: 'pizzaria-da-esquina' },
    })
    mockarApi({ pedidos: [] })
    abrirComLocal('/lanchonete-do-ze/admin/pedidos')

    expect(await screen.findByRole('heading', { level: 1, name: 'Olá, Zé' })).toBeInTheDocument()
    expect(localAtual()).toBe('/pizzaria-da-esquina/admin')
  })
})

describe('menu do painel', () => {
  it('cada pessoa recebe só os itens que a permissão dela alcança', () => {
    expect(itensDoMenu(['orders:read']).map((item) => item.rotulo)).toEqual(['Início', 'Pedidos'])
    expect(itensDoMenu(['settings:read']).map((item) => item.rotulo)).toEqual([
      'Início',
      'Configurações',
    ])
    expect(itensDoMenu([]).map((item) => item.rotulo)).toEqual(['Início'])
  })

  it('mostra o estabelecimento, os itens, o cardápio e quem está logado', async () => {
    await abrirInicio({ pedidos: [] })
    const menu = within(screen.getByRole('navigation', { name: 'Painel' }))

    expect(menu.getByRole('link', { name: 'Início' })).toHaveAttribute(
      'href',
      '/lanchonete-do-ze/admin',
    )
    expect(menu.getByRole('link', { name: 'Pedidos' })).toHaveAttribute(
      'href',
      '/lanchonete-do-ze/admin/pedidos',
    )
    expect(menu.getByRole('link', { name: 'Início' })).toHaveAttribute('aria-current', 'page')
    expect(menu.getByRole('link', { name: 'Pedidos' })).not.toHaveAttribute('aria-current')

    const cardapio = screen.getByRole('link', { name: 'Ver cardápio' })
    expect(cardapio).toHaveAttribute('href', '/lanchonete-do-ze')
    expect(cardapio).toHaveAttribute('target', '_blank')
    expect(screen.getAllByText('Lanchonete do Zé').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Sair' })).toBeVisible()
  })

  it('o número de pedidos novos aparece ao lado de "Pedidos" e no botão do menu', async () => {
    await abrirInicio({ pedidos: [pedido(), pedido({ id: 'p2', number: 2 })] })

    expect(await screen.findByRole('link', { name: 'Pedidos, 2 novos' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Menu, 2 pedidos novos' })).toBeVisible()
  })

  it('"Pedidos" leva à tela de pedidos sem abrir outra conexão ao vivo', async () => {
    await abrirInicio({ pedidos: [pedido()] })
    await ultimoSocket()

    fireEvent.click(screen.getByRole('link', { name: /^Pedidos/ }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Pedidos' })).toBeVisible()
    expect(localAtual()).toBe('/lanchonete-do-ze/admin/pedidos')
    expect(screen.getByRole('link', { name: /^Pedidos/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Início' })).not.toHaveAttribute('aria-current')
    // A conexão é da moldura: trocar de tela não a derruba nem abre outra.
    expect(WebSocketFalso.instancias).toHaveLength(1)
    expect(WebSocketFalso.instancias[0]?.fechadoPeloPainel).toBe(false)
  })

  it('em tela pequena, "Menu" abre a gaveta; Esc, o fundo e a escolha de um item fecham', async () => {
    await abrirInicio({ pedidos: [] })
    const botao = screen.getByRole('button', { name: 'Menu' })
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    expect(botao).toHaveAttribute('aria-controls', 'menu-do-painel')

    fireEvent.click(botao)
    expect(botao).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    expect(botao).toHaveFocus()

    fireEvent.click(botao)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar o menu' }))
    expect(botao).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(botao)
    fireEvent.click(screen.getByRole('link', { name: 'Pedidos' }))
    expect(botao).toHaveAttribute('aria-expanded', 'false')
  })

  it('quem não vê pedidos não tem o item, o resumo nem o número', async () => {
    const fetch = await abrirInicio({ pedidos: [pedido()] }, SEM_PEDIDOS)

    expect(screen.getByRole('link', { name: 'Início' })).toBeVisible()
    expect(screen.queryByRole('link', { name: /Pedidos/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Concluídos hoje')).not.toBeInTheDocument()
    expect(chamadas(fetch, RESUMO)).toHaveLength(0)
  })

  it('endereço desconhecido debaixo do painel não é tela do painel', async () => {
    logar()
    mockarApi({ pedidos: [] })
    abrir('/lanchonete-do-ze/admin/nao-existe')

    expect(await screen.findByRole('heading', { level: 1, name: 'Não encontrado' })).toBeVisible()
    expect(screen.queryByRole('navigation', { name: 'Painel' })).not.toBeInTheDocument()
  })
})

describe('início do painel', () => {
  const numero = (rotulo: string) => screen.getByText(rotulo).nextElementSibling

  it('mostra os pedidos novos, em andamento e concluídos hoje, com o atalho para os pedidos', async () => {
    await abrirInicio({
      pedidos: [],
      resumos: [{ status: 200, corpo: { new: 2, inProgress: 3, completedToday: 14 } }],
    })

    await waitFor(() => {
      expect(numero('Novos')).toHaveTextContent('2')
    })
    expect(numero('Em andamento')).toHaveTextContent('3')
    expect(numero('Concluídos hoje')).toHaveTextContent('14')
    expect(screen.getByRole('link', { name: 'Ver pedidos' })).toHaveAttribute(
      'href',
      '/lanchonete-do-ze/admin/pedidos',
    )
    expect(document.title).toBe('(2) Início')
  })

  it('mostra o uso do plano no mês', async () => {
    await abrirInicio({ pedidos: [], plano: plano({ used: 37 }) })

    expect(
      await screen.findByText('Pedidos neste mês: 37 de 100, no plano Gratuito.'),
    ).toBeVisible()
  })

  it('pedido novo chegando atualiza o número do menu, o resumo e o título da aba', async () => {
    const fetch = await abrirInicio({
      pedidos: [],
      resumos: [
        { status: 200, corpo: { new: 0, inProgress: 0, completedToday: 0 } },
        { status: 200, corpo: { new: 0, inProgress: 0, completedToday: 0 } },
        { status: 200, corpo: { new: 1, inProgress: 0, completedToday: 0 } },
      ],
    })
    const socket = await ultimoSocket()
    socket.abrir()
    socket.receber({ type: 'ready' })
    await waitFor(() => {
      expect(chamadas(fetch, RESUMO).length).toBeGreaterThanOrEqual(2)
    })
    expect(document.title).toBe('Início')

    socket.receber({ type: 'order.created', orderId: 'x', number: 7 })

    expect(await screen.findByRole('link', { name: 'Pedidos, 1 novo' })).toBeVisible()
    expect(numero('Novos')).toHaveTextContent('1')
    expect(document.title).toBe('(1) Início')
  })

  it('com o som ligado, o pedido novo toca fora da tela de pedidos', async () => {
    const tocados: number[] = []
    class AudioContextFalso {
      currentTime = 0
      destination = {}
      createOscillator() {
        return {
          frequency: { value: 0 },
          connect: (destino: unknown) => destino,
          start: (quando: number) => tocados.push(quando),
          stop: () => undefined,
        }
      }
      createGain() {
        return {
          gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
          connect: (destino: unknown) => destino,
        }
      }
    }
    vi.stubGlobal('AudioContext', AudioContextFalso)

    await abrirInicio({ pedidos: [] })
    const socket = await ultimoSocket()
    socket.abrir()
    socket.receber({ type: 'ready' })

    // Sem o som ligado, nada toca.
    socket.receber({ type: 'order.created', orderId: 'x', number: 7 })
    expect(tocados).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Ligar som' }))
    expect(screen.getByRole('button', { name: 'Som ligado' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const aoLigar = tocados.length
    expect(aoLigar).toBeGreaterThan(0)

    socket.receber({ type: 'order.created', orderId: 'y', number: 8 })
    expect(tocados.length).toBeGreaterThan(aoLigar)
  })

  it('resumo fora do ar avisa, sem derrubar o resto do Início', async () => {
    await abrirInicio({ pedidos: [], resumos: [{ status: 500, corpo: {} }] })

    expect(await screen.findByText(/Não foi possível carregar o resumo/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Ver pedidos' })).toBeVisible()
  })
})

describe('o que falta para receber pedidos', () => {
  const CONFIGURA = {
    ...SESSAO,
    user: { ...SESSAO.user, permissions: ['orders:read', 'settings:read', 'settings:update'] },
  }
  const FALTANDO: Checklist = {
    ready: false,
    steps: [
      { key: 'emailConfirmed', done: true },
      { key: 'whatsapp', done: false },
      { key: 'businessHours', done: false },
      { key: 'fulfillment', done: true },
      { key: 'paymentMethods', done: false },
      { key: 'products', done: false },
    ],
  }

  it('mostra o que está feito, o que falta e onde resolver', async () => {
    await abrirInicio({ pedidos: [], checklist: FALTANDO }, CONFIGURA)

    const lista = within(
      await screen.findByRole('region', { name: 'O que falta para receber pedidos' }),
    )
    expect(lista.getByText('2 de 6 passos feitos.')).toBeVisible()
    expect(lista.getByText('Confirmar o e-mail')).toHaveTextContent('feito')
    expect(lista.getByText('Informar o WhatsApp do estabelecimento')).toHaveTextContent('falta')
    expect(lista.getByText('É para ele que o cliente envia o pedido.')).toBeVisible()
    // O WhatsApp se resolve na tela de configurações, que já existe.
    expect(lista.getByRole('link', { name: 'Abrir as configurações' })).toHaveAttribute(
      'href',
      '/lanchonete-do-ze/admin/configuracoes',
    )
  })

  it('com tudo feito, a lista some', async () => {
    const fetch = await abrirInicio({ pedidos: [] }, CONFIGURA)
    await waitFor(() => {
      expect(chamadas(fetch, '/admin/setup-checklist')).toHaveLength(1)
    })

    expect(
      screen.queryByRole('region', { name: 'O que falta para receber pedidos' }),
    ).not.toBeInTheDocument()
  })

  it('quem não cuida das configurações não vê a lista nem a consulta', async () => {
    const fetch = await abrirInicio({ pedidos: [], checklist: FALTANDO })

    expect(
      screen.queryByRole('region', { name: 'O que falta para receber pedidos' }),
    ).not.toBeInTheDocument()
    expect(chamadas(fetch, '/admin/setup-checklist')).toHaveLength(0)
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
    await waitFor(() => {
      expect(document.title).toBe('(2) Pedidos')
    })
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
    expect(chamadas(fetch, LISTA).length).toBeGreaterThanOrEqual(3)
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

    expect(await screen.findByRole('heading', { name: 'Entrar no painel' })).toBeVisible()
    expect(socket.fechadoPeloPainel).toBe(true)
    expect(useSessaoStore.getState().slug).toBeNull()
    // O logout leva o cookie, para a API revogar e apagá-lo.
    const [logout] = chamadas(fetch, '/auth/logout', 'POST')
    expect(logout?.[1]?.credentials).toBe('include')
  })
})

describe('sessão', () => {
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

describe('aviso de confirmação do cadastro', () => {
  const DONO = {
    ...SESSAO,
    user: {
      ...SESSAO.user,
      permissions: ['orders:read', 'orders:update', 'settings:read', 'settings:update'],
    },
  }

  /** O Início do painel do dono, com a confirmação respondendo na ordem; a última se repete. */
  async function abrirComConfirmacao(
    situacoes: Resposta[],
    reenvio: Resposta = { status: 202, corpo: { email: 'ze@exemplo.com' } },
    sessao = DONO,
  ) {
    let consultas = 0
    const fetch = mockarRotas((url, metodo) => {
      if (url.endsWith('/admin/email-confirmation/resend') && metodo === 'POST') return reenvio
      if (url.endsWith('/admin/email-confirmation')) {
        const resposta = situacoes[Math.min(consultas, situacoes.length - 1)]
        consultas += 1
        return resposta ?? 'falha-de-rede'
      }
      if (url.endsWith('/admin/plan')) return { status: 200, corpo: LIVRE }
      if (url.endsWith('/admin/setup-checklist')) return { status: 200, corpo: TUDO_FEITO }
      if (url.endsWith(RESUMO)) return { status: 200, corpo: resumoDe([]) }
      if (url.includes(LISTA)) return { status: 200, corpo: [] }
      return { status: 200, corpo: cardapioDoZe() }
    })
    useSessaoStore.getState().guardar(sessao)
    abrir('/lanchonete-do-ze/admin')
    await screen.findByRole('heading', { level: 1, name: 'Olá, Zé' })
    return fetch
  }

  const PENDENTE: Resposta = { status: 200, corpo: { status: 'PENDING', email: 'ze@exemplo.com' } }
  const CONFIRMADO: Resposta = {
    status: 200,
    corpo: { status: 'CONFIRMED', email: 'ze@exemplo.com' },
  }
  const titulo = 'Seu cardápio ainda não está no ar'

  it('enquanto o e-mail não é confirmado, o aviso diz para onde foi o link e reenvia', async () => {
    const fetch = await abrirComConfirmacao([PENDENTE])

    expect(await screen.findByRole('heading', { name: titulo })).toBeVisible()
    expect(screen.getByText('ze@exemplo.com')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Reenviar e-mail' }))

    expect(await screen.findByText('Enviamos um novo link para ze@exemplo.com.')).toBeVisible()
    expect(chamadas(fetch, '/email-confirmation/resend', 'POST')).toHaveLength(1)
  })

  it('reenviar cedo demais mostra a espera que a API pede', async () => {
    await abrirComConfirmacao([PENDENTE], {
      status: 429,
      corpo: {
        error: {
          code: 'RESEND_TOO_SOON',
          message: 'Aguarde 42 segundos para pedir outro e-mail.',
        },
      },
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Reenviar e-mail' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Aguarde 42 segundos para pedir outro e-mail.',
    )
  })

  it('cadastro confirmado: nenhum aviso', async () => {
    const fetch = await abrirComConfirmacao([CONFIRMADO])

    await waitFor(() => {
      expect(chamadas(fetch, '/admin/email-confirmation')).toHaveLength(1)
    })
    expect(screen.queryByRole('heading', { name: titulo })).not.toBeInTheDocument()
  })

  it('atendente, sem acesso às configurações, nem consulta', async () => {
    const fetch = await abrirComConfirmacao([PENDENTE], undefined, SESSAO)

    await waitFor(() => {
      expect(chamadas(fetch, '/admin/orders').length).toBeGreaterThan(0)
    })
    expect(chamadas(fetch, '/admin/email-confirmation')).toHaveLength(0)
    expect(screen.queryByRole('heading', { name: titulo })).not.toBeInTheDocument()
  })

  it('confirmado em outro lugar: o reenvio recusado faz o aviso sumir', async () => {
    await abrirComConfirmacao([PENDENTE, CONFIRMADO], {
      status: 409,
      corpo: {
        error: {
          code: 'ALREADY_CONFIRMED',
          message: 'O e-mail já foi confirmado, e o cardápio está publicado.',
        },
      },
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Reenviar e-mail' }))

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: titulo })).not.toBeInTheDocument()
    })
  })
})
