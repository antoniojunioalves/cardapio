import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSessaoStore } from '../src/features/admin/session'
import {
  formularioSchema,
  fusosParaEscolher,
  paraFormulario,
  type Configuracoes,
} from '../src/features/admin/settings'
import { abrir, pararConexaoAoVivo, type Resposta } from './helpers/pagina'

const CONFIGURACOES: Configuracoes = {
  name: 'Lanchonete do Zé',
  slug: 'lanchonete-do-ze',
  timezone: 'America/Sao_Paulo',
  description: 'Os melhores lanches do bairro',
  logoUrl: null,
  coverUrl: 'http://api/uploads/capa.webp',
  whatsappPhone: '5511987654321',
  contactPhone: null,
  contactEmail: null,
  addressStreet: 'Rua das Flores',
  addressNumber: '123',
  addressComplement: null,
  addressNeighborhood: 'Centro',
  addressCity: 'São Paulo',
  addressState: 'SP',
  addressPostalCode: '01310100',
  prepTimeMinMinutes: 20,
  prepTimeMaxMinutes: 40,
  minimumOrderInCents: 2000,
  isAcceptingOrders: true,
}

const sessao = (permissions: string[]) => ({
  accessToken: 'token-de-acesso',
  user: { id: 'u', tenantId: 't', name: 'Zé', email: 'ze@exemplo.com', permissions },
  establishment: { id: 't', slug: 'lanchonete-do-ze', name: 'Lanchonete do Zé', status: 'ACTIVE' },
})
const DONO = sessao(['settings:read', 'settings:update'])
const SO_LEITURA = sessao(['settings:read'])

interface Api {
  configuracoes?: Configuracoes
  /** A resposta do `PATCH`. Sem ela, devolve as configurações com o que foi enviado por cima. */
  salvar?: Resposta
  logo?: Resposta
}

/** O painel em Configurações, com a API simulada. Devolve o mock, para conferir o que foi enviado. */
async function abrirConfiguracoes(api: Api = {}, comSessao = DONO) {
  const atuais = api.configuracoes ?? CONFIGURACOES
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET'
    let resposta: Resposta = { status: 200, corpo: {} }
    if (url.endsWith('/admin/settings') && metodo === 'GET') {
      resposta = { status: 200, corpo: atuais }
    } else if (url.endsWith('/admin/settings') && metodo === 'PATCH') {
      const enviado = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as object
      resposta = api.salvar ?? { status: 200, corpo: { ...atuais, ...enviado } }
    } else if (url.endsWith('/admin/settings/logo')) {
      resposta =
        api.logo ??
        (metodo === 'DELETE'
          ? { status: 200, corpo: { logoUrl: null, coverUrl: atuais.coverUrl } }
          : {
              status: 200,
              corpo: { logoUrl: 'http://api/uploads/logo-novo.webp', coverUrl: atuais.coverUrl },
            })
    }
    if (resposta === 'falha-de-rede') return Promise.reject(new Error('conexão recusada'))
    return Promise.resolve({
      ok: resposta.status < 400,
      status: resposta.status,
      json: () => Promise.resolve(resposta.corpo),
    })
  })
  vi.stubGlobal('fetch', fetch)
  useSessaoStore.getState().guardar(comSessao)
  abrir('/lanchonete-do-ze/admin/configuracoes')
  await screen.findByLabelText('Nome')
  return fetch
}

const escrever = (rotulo: string, valor: string) => {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } })
}
/**
 * A mensagem saiu da tela e continua fora. Olhar uma vez só engana: o formulário
 * confere de novo depois de cada mudança, e pode pôr a mensagem de volta.
 */
async function sumiuDeVez(texto: string) {
  await waitFor(() => {
    expect(screen.queryByText(texto)).toBeNull()
  })
  await act(() => new Promise<void>((resolver) => setTimeout(resolver, 100)))
  expect(screen.queryByText(texto)).toBeNull()
}
const salvar = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
}
const enviados = (fetch: Awaited<ReturnType<typeof abrirConfiguracoes>>, metodo: string) =>
  fetch.mock.calls.filter(([, init]) => init?.method === metodo)

beforeEach(() => {
  localStorage.clear()
  useSessaoStore.setState({ slug: null, estabelecimento: null, usuario: null, accessToken: null })
  pararConexaoAoVivo()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('do banco para os campos, e de volta', () => {
  it('mostra telefone, CEP e dinheiro como a pessoa os digita', () => {
    expect(paraFormulario(CONFIGURACOES)).toMatchObject({
      whatsappPhone: '(11) 98765-4321',
      contactPhone: '',
      addressPostalCode: '01310-100',
      minimumOrderInCents: '20,00',
      prepTimeMinMinutes: '20',
      addressComplement: '',
    })
  })

  it('entrega à API só dígitos, centavos e nulo no que ficou em branco', () => {
    const dados = formularioSchema.parse({
      ...paraFormulario(CONFIGURACOES),
      whatsappPhone: '(11) 98888-7777',
      contactPhone: '(11) 3333-4444',
      addressPostalCode: '04538-133',
      minimumOrderInCents: '35,5',
      description: '   ',
      prepTimeMinMinutes: '',
    })

    expect(dados).toMatchObject({
      whatsappPhone: '5511988887777',
      contactPhone: '551133334444',
      addressPostalCode: '04538133',
      minimumOrderInCents: 3550,
      description: null,
      prepTimeMinMinutes: null,
    })
  })

  it('pedido mínimo em branco é zero, e não erro', () => {
    const dados = formularioSchema.parse({
      ...paraFormulario(CONFIGURACOES),
      minimumOrderInCents: '',
    })

    expect(dados.minimumOrderInCents).toBe(0)
  })

  it('o fuso do estabelecimento entra no seletor mesmo fora da lista do Brasil', () => {
    expect(fusosParaEscolher('America/Sao_Paulo').map((f) => f.valor)).not.toContain(
      'Europe/Lisbon',
    )
    expect(fusosParaEscolher('Europe/Lisbon').at(-1)).toEqual({
      valor: 'Europe/Lisbon',
      rotulo: 'Europe/Lisbon',
    })
  })
})

describe('tela de configurações', () => {
  it('está no menu, e mostra o que está gravado', async () => {
    await abrirConfiguracoes()

    expect(screen.getByRole('heading', { level: 1, name: 'Configurações' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Configurações' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    // Configurações não é tela do dia a dia: fica no fim do menu, abaixo de "Ver cardápio".
    const verCardapio = screen.getByRole('link', { name: 'Ver cardápio' })
    const configuracoes = screen.getByRole('link', { name: 'Configurações' })
    const inicio = screen.getByRole('link', { name: 'Início' })
    const vemDepois = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(vemDepois(inicio, verCardapio)).toBe(true)
    expect(vemDepois(verCardapio, configuracoes)).toBe(true)
    expect(vemDepois(configuracoes, screen.getByRole('button', { name: 'Sair' }))).toBe(true)

    expect(screen.getByLabelText('Nome')).toHaveValue('Lanchonete do Zé')
    expect(screen.getByLabelText('WhatsApp')).toHaveValue('(11) 98765-4321')
    expect(screen.getByLabelText('CEP')).toHaveValue('01310-100')
    expect(screen.getByLabelText('Estado')).toHaveValue('SP')
    expect(screen.getByLabelText('Pedido mínimo (R$)')).toHaveValue('20,00')
    expect(screen.getByLabelText(/Recebendo pedidos/)).toBeChecked()
    // O endereço do cardápio é só leitura: é o link que já foi divulgado.
    expect(screen.getByRole('link', { name: /\/lanchonete-do-ze$/ })).toHaveAttribute(
      'href',
      '/lanchonete-do-ze',
    )
    expect(document.title).toBe('Configurações')
  })

  it('salva tudo de uma vez, no formato da API, e o menu passa a mostrar o nome novo', async () => {
    const fetch = await abrirConfiguracoes()
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled()

    escrever('Nome', 'Lanchonete Nova')
    escrever('WhatsApp', '11988887777')
    escrever('Pedido mínimo (R$)', '35,50')
    escrever('Complemento', 'Loja 2')
    fireEvent.change(screen.getByLabelText('Fuso horário'), { target: { value: 'America/Manaus' } })
    fireEvent.click(screen.getByLabelText(/Recebendo pedidos/))
    salvar()

    expect(await screen.findByText('Configurações salvas.')).toBeVisible()
    const [, init] = enviados(fetch, 'PATCH')[0] ?? []
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '{}')).toMatchObject({
      name: 'Lanchonete Nova',
      timezone: 'America/Manaus',
      whatsappPhone: '5511988887777',
      minimumOrderInCents: 3550,
      addressComplement: 'Loja 2',
      addressPostalCode: '01310100',
      contactPhone: null,
      isAcceptingOrders: false,
    })
    expect(useSessaoStore.getState().estabelecimento).toBe('Lanchonete Nova')
    // Gravado: não há mais o que salvar até a pessoa mexer de novo.
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled()
  })

  it('o telefone ganha a máscara enquanto é digitado', async () => {
    await abrirConfiguracoes()

    escrever('WhatsApp', '11988887777')

    expect(screen.getByLabelText('WhatsApp')).toHaveValue('(11) 98888-7777')
  })

  it('não envia com campo inválido, e diz qual é o problema em cada um', async () => {
    const fetch = await abrirConfiguracoes()

    escrever('Nome', '   ')
    escrever('WhatsApp', '1234')
    escrever('CEP', '123')
    escrever('Tempo de preparo mínimo (min)', '60')
    escrever('Tempo de preparo máximo (min)', '30')
    salvar()

    expect(await screen.findByText('Informe o nome do estabelecimento.')).toBeVisible()
    expect(screen.getByText('Informe um telefone com DDD, como (11) 98765-4321.')).toBeVisible()
    expect(screen.getByText('Informe um CEP com 8 dígitos, como 01310-100.')).toBeVisible()
    expect(screen.getByText('O tempo máximo não pode ser menor que o mínimo.')).toBeVisible()
    expect(screen.getByLabelText('Nome')).toHaveAttribute('aria-invalid', 'true')
    expect(enviados(fetch, 'PATCH')).toHaveLength(0)
  })

  it('corrigir o tempo mínimo tira o erro que estava no máximo', async () => {
    await abrirConfiguracoes()
    const ERRO = 'O tempo máximo não pode ser menor que o mínimo.'

    escrever('Tempo de preparo mínimo (min)', '60')
    salvar()
    await screen.findByText(ERRO)
    escrever('Tempo de preparo mínimo (min)', '15')

    await sumiuDeVez(ERRO)
  })

  it('recusa da API aparece no campo que ela apontou', async () => {
    await abrirConfiguracoes({
      salvar: {
        status: 400,
        corpo: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dados inválidos.',
            details: [{ instancePath: '/contactEmail', message: 'E-mail recusado pelo servidor.' }],
          },
        },
      },
    })

    escrever('E-mail de contato', 'contato@exemplo.com')
    salvar()

    expect(await screen.findByText('E-mail recusado pelo servidor.')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Confira os campos marcados')
    expect(screen.queryByText('Configurações salvas.')).not.toBeInTheDocument()
  })

  it('servidor fora do ar: avisa e mantém o que a pessoa digitou', async () => {
    await abrirConfiguracoes({ salvar: 'falha-de-rede' })

    escrever('Nome', 'Lanchonete Nova')
    salvar()

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar agora.')
    expect(screen.getByLabelText('Nome')).toHaveValue('Lanchonete Nova')
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeEnabled()
  })

  it('quem só pode ver não altera: campos desligados, sem salvar nem enviar imagem', async () => {
    await abrirConfiguracoes({}, SO_LEITURA)

    expect(screen.getByRole('note')).toHaveTextContent('o seu perfil não permite alterá-las')
    expect(screen.getByLabelText('Nome')).toBeDisabled()
    expect(screen.getByLabelText('Fuso horário')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Enviar logo')).not.toBeInTheDocument()
  })

  it('quem só pausa: só o "Recebendo pedidos" está ligado, e só ele é enviado', async () => {
    const fetch = await abrirConfiguracoes({}, sessao(['settings:read', 'orders:pause']))

    expect(screen.getByRole('note')).toHaveTextContent(
      'O seu perfil permite só pausar e retomar o recebimento de pedidos.',
    )
    expect(screen.getByLabelText('Nome')).toBeDisabled()
    expect(screen.getByLabelText('Pedido mínimo (R$)')).toBeDisabled()
    expect(screen.queryByLabelText('Enviar logo')).not.toBeInTheDocument()
    const recebendo = screen.getByLabelText('Recebendo pedidos')
    expect(recebendo).toBeEnabled()
    expect(recebendo).toBeChecked()

    fireEvent.click(recebendo)
    salvar()

    expect(await screen.findByText('Configurações salvas.')).toBeVisible()
    expect(enviados(fetch, 'PATCH')).toHaveLength(1)
    expect(JSON.parse(enviados(fetch, 'PATCH')[0]?.[1]?.body as string)).toEqual({
      isAcceptingOrders: false,
    })
    expect(screen.getByLabelText('Recebendo pedidos')).not.toBeChecked()
  })

  it('quem altera as configurações também pausa, e envia o formulário inteiro', async () => {
    const fetch = await abrirConfiguracoes()

    expect(screen.queryByRole('note')).toBeNull()
    fireEvent.click(screen.getByLabelText('Recebendo pedidos'))
    salvar()

    await screen.findByText('Configurações salvas.')
    const corpo = JSON.parse(enviados(fetch, 'PATCH')[0]?.[1]?.body as string) as object
    expect(corpo).toMatchObject({ isAcceptingOrders: false, name: CONFIGURACOES.name })
  })

  it('quem só vê as configurações não pausa', async () => {
    await abrirConfiguracoes({}, SO_LEITURA)

    expect(screen.getByLabelText('Recebendo pedidos')).toBeDisabled()
  })

  it('falha ao carregar avisa, sem mostrar um formulário vazio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })),
    )
    useSessaoStore.getState().guardar(DONO)
    abrir('/lanchonete-do-ze/admin/configuracoes')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar as configurações.',
    )
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument()
  })
})

describe('imagens do estabelecimento', () => {
  const foto = () => new File(['conteúdo'], 'IMG_0001.JPG', { type: 'image/jpeg' })

  it('envia o arquivo na hora, como multipart, e mostra a imagem guardada', async () => {
    const fetch = await abrirConfiguracoes()
    expect(screen.getByRole('img', { name: 'Capa atual' })).toHaveAttribute(
      'src',
      'http://api/uploads/capa.webp',
    )
    expect(screen.queryByRole('img', { name: 'Logo atual' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Enviar logo'), { target: { files: [foto()] } })

    expect(await screen.findByRole('img', { name: 'Logo atual' })).toHaveAttribute(
      'src',
      'http://api/uploads/logo-novo.webp',
    )
    const [url, init] = enviados(fetch, 'PUT')[0] ?? []
    expect(url).toMatch(/\/admin\/settings\/logo$/)
    expect(init?.body).toBeInstanceOf(FormData)
    expect((init?.body as FormData).get('file')).toBeInstanceOf(File)
    // Sem `Content-Type` à mão: é o navegador que põe a fronteira das partes.
    expect(init?.headers).not.toHaveProperty('content-type')
    // A capa, que não foi tocada, continua lá.
    expect(screen.getByRole('img', { name: 'Capa atual' })).toBeVisible()
  })

  it('remove a imagem', async () => {
    const fetch = await abrirConfiguracoes({
      configuracoes: { ...CONFIGURACOES, logoUrl: 'http://api/uploads/logo.webp' },
    })
    const logo = within(screen.getByText('Logo').closest('div') as HTMLElement)

    fireEvent.click(logo.getByRole('button', { name: 'Remover' }))

    await waitFor(() => {
      expect(screen.queryByRole('img', { name: 'Logo atual' })).not.toBeInTheDocument()
    })
    expect(enviados(fetch, 'DELETE')).toHaveLength(1)
  })

  it.each([
    [413, {}, 'A imagem é grande demais. Envie uma de até 15 MB.'],
    [415, {}, 'Envie uma imagem JPEG, PNG ou WebP.'],
    [
      422,
      {
        error: {
          code: 'UNREADABLE_IMAGE',
          message: 'Não foi possível ler esta imagem. Tente outra foto.',
        },
      },
      'Não foi possível ler esta imagem. Tente outra foto.',
    ],
    [500, {}, 'Não foi possível enviar a imagem agora. Tente de novo.'],
  ])('recusa %i diz o que houve', async (status, corpo, mensagem) => {
    await abrirConfiguracoes({ logo: { status, corpo } })

    fireEvent.change(screen.getByLabelText('Enviar logo'), { target: { files: [foto()] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(mensagem)
    expect(screen.queryByRole('img', { name: 'Logo atual' })).not.toBeInTheDocument()
  })
})
