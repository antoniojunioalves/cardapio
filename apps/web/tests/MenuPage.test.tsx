import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cardapioDoZe } from './helpers/cardapio'
import { abrir, abrirCardapio, mockarApi } from './helpers/pagina'

// O jsdom não implementa rolagem.
const rolarAte = vi.fn()

beforeEach(() => {
  rolarAte.mockClear()
  Element.prototype.scrollIntoView = rolarAte
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cardápio público', () => {
  it('busca o cardápio pelo slug da URL', async () => {
    const { fetch } = await abrirCardapio()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/public/lanchonete-do-ze/menu'),
      expect.anything(),
    )
  })

  it('mostra o estabelecimento e o status; as condições de entrega ficam na janela "Info"', async () => {
    await abrirCardapio()

    expect(screen.getByText('Os melhores lanches do bairro')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Aberto agora')
    expect(screen.getByRole('status')).toHaveTextContent('Fecha às 02:00')
    expect(screen.queryByText('Entrega R$ 5,00')).not.toBeInTheDocument()
    expect(screen.queryByText('Pedido mínimo R$ 20,00')).not.toBeInTheDocument()
    expect(document.title).toBe('Lanchonete do Zé — Cardápio')
  })

  it('mostra quando abre, se estiver fechado', async () => {
    await abrirCardapio({
      ...cardapioDoZe(),
      status: {
        aberto: false,
        motivo: 'FORA_DO_HORARIO',
        proximaAbertura: { dayOfWeek: 2, opensAt: '18:00:00', emDias: 1 },
      },
    })

    expect(screen.getByRole('status')).toHaveTextContent('Fechado')
    expect(screen.getByRole('status')).toHaveTextContent('Abre amanhã às 18:00')
  })

  it('lista as categorias como seções e na navegação', async () => {
    await abrirCardapio()

    const nav = screen.getByRole('navigation', { name: 'Categorias' })
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Hambúrgueres', 'Combos', 'Bebidas'])
    expect(screen.getByRole('heading', { level: 2, name: 'Combos' })).toBeInTheDocument()
  })

  it('a faixa de categorias fica no mesmo contêiner que o cardápio, para continuar fixa', async () => {
    await abrirCardapio()

    // O jsdom não calcula layout, então o teste trava a causa: um elemento
    // `sticky` só fica preso enquanto o pai está na tela. Se a faixa for
    // envolvida num elemento da altura dela, ela volta a sumir ao rolar.
    const nav = screen.getByRole('navigation', { name: 'Categorias' })
    expect(nav).toHaveClass('sticky')
    expect(nav.parentElement).toContainElement(screen.getByRole('main'))
  })

  it('com capa, o cartão do estabelecimento fica por cima dela', async () => {
    await abrirCardapio({
      ...cardapioDoZe(),
      establishment: { ...cardapioDoZe().establishment, coverUrl: 'http://api/capa.jpg' },
    })

    // O jsdom não calcula layout, então o teste trava a causa: o cartão sobe
    // sobre a capa (margem negativa) e só fica por cima dela se for
    // posicionado. Sem isso, a <img> da capa cobre o fundo do cartão.
    const nome = screen.getByRole('heading', { level: 1, name: 'Lanchonete do Zé' })
    const cartao = nome.closest('.-mt-10')
    expect(cartao).toHaveClass('relative')
    expect(document.querySelector('header img')).toHaveAttribute('src', 'http://api/capa.jpg')
  })

  it('tocar numa categoria rola até ela e a destaca', async () => {
    await abrirCardapio()

    const botao = screen.getByRole('button', { name: 'Bebidas' })
    fireEvent.click(botao)

    expect(rolarAte).toHaveBeenCalled()
    expect(botao).toHaveAttribute('aria-current', 'true')
  })

  it('produto esgotado aparece com o selo', async () => {
    await abrirCardapio()

    const xBacon = screen.getByRole('article', { name: 'X-Bacon' })
    expect(within(xBacon).getByText('Esgotado')).toBeInTheDocument()
    expect(
      within(screen.getByRole('article', { name: 'X-Salada' })).queryByText('Esgotado'),
    ).not.toBeInTheDocument()
  })

  it('combo mostra os itens e quanto se economiza', async () => {
    await abrirCardapio()

    const combo = screen.getByRole('article', { name: 'Combo X-Salada' })
    expect(within(combo).getByText('X-Salada + Batata frita + Refrigerante lata')).toBeVisible()
    expect(within(combo).getByText('Economize R$ 7,00')).toBeInTheDocument()
    expect(within(combo).getByText('R$ 39,90')).toBeInTheDocument()
  })

  it('a busca filtra sem se importar com acento', async () => {
    await abrirCardapio()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar no cardápio' }), {
      target: { value: 'acai' },
    })

    expect(screen.getByRole('article', { name: 'Açaí na tigela' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'X-Salada' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Combos' })).not.toBeInTheDocument()
  })

  it('a busca sem resultado diz o que foi buscado', async () => {
    await abrirCardapio()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar no cardápio' }), {
      target: { value: 'sushi' },
    })

    expect(screen.getByText('Nenhum produto encontrado para “sushi”.')).toBeInTheDocument()
  })

  it('"Info", ao lado do status, abre a janela com entrega, horários, endereço e pagamento', async () => {
    await abrirCardapio()
    // As informações não ocupam mais o fim da página: só aparecem na janela.
    expect(screen.queryByText('Horário de funcionamento')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Informações do estabelecimento' }))

    const info = screen.getByRole('dialog', { name: 'Informações' })
    expect(within(info).getByText('Entrega R$ 5,00')).toBeInTheDocument()
    expect(within(info).getByText('Pedido mínimo R$ 20,00')).toBeInTheDocument()
    expect(within(info).getByText('18:00 às 02:00')).toBeInTheDocument()
    expect(within(info).getByText('Rua das Flores, 123 — Centro, São Paulo/SP')).toBeInTheDocument()
    expect(within(info).getByText('Pix')).toBeInTheDocument()
    expect(within(info).getByText('Dinheiro')).toBeInTheDocument()

    fireEvent.click(within(info).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('o botão diz "Info" e fica fora do anúncio de status', async () => {
    await abrirCardapio()
    const botao = screen.getByRole('button', { name: 'Informações do estabelecimento' })

    expect(botao).toHaveTextContent('Info')
    expect(screen.getByRole('status')).not.toContainElement(botao)
    expect(screen.getByRole('status')).not.toHaveTextContent('Info')
  })

  it('o endereço com ?info já abre a janela, e Esc a fecha', async () => {
    await abrirCardapio(cardapioDoZe(), '?info')
    expect(screen.getByRole('dialog', { name: 'Informações' })).toBeVisible()

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('tem o menu de baixo com Início, Histórico e Perfil — por ora só o visual', async () => {
    await abrirCardapio()
    const menu = within(screen.getByRole('navigation', { name: 'Menu do cardápio' }))

    expect(menu.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Início',
      'Histórico',
      'Perfil',
    ])
    // O cardápio é o Início; os outros dois ainda não levam a lugar nenhum.
    expect(menu.getByRole('button', { name: 'Início' })).toHaveAttribute('aria-current', 'page')
    expect(menu.getByRole('button', { name: 'Histórico' })).toHaveAttribute('aria-disabled', 'true')
    expect(menu.getByRole('button', { name: 'Perfil' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('cardápio sem nenhuma categoria avisa que está sendo preparado', async () => {
    await abrirCardapio({ ...cardapioDoZe(), categories: [] })
    expect(screen.getByText('O cardápio ainda está sendo preparado. Volte em breve.')).toBeVisible()
  })
})

describe('estados da página', () => {
  it('mostra o carregamento enquanto a API não responde', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    )
    abrir('/lanchonete-do-ze')
    expect(screen.getByRole('status')).toHaveTextContent('Carregando o cardápio…')
  })

  it('estabelecimento inexistente mostra não encontrado, sem tentar de novo', async () => {
    const fetch = mockarApi({
      status: 404,
      corpo: { error: { code: 'NOT_FOUND', message: 'Estabelecimento não encontrado.' } },
    })
    abrir('/nao-existe')

    expect(await screen.findByRole('heading', { name: 'Não encontrado' })).toBeInTheDocument()
    expect(
      screen.getByText('Não encontramos este estabelecimento. Confira o endereço.'),
    ).toBeVisible()
    // Genérica: vale para qualquer endereço, sem dizer se este espera confirmação.
    expect(screen.getByText(/depois que você confirmar o e-mail/)).toBeVisible()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('falha de rede oferece tentar de novo, e tentar de novo funciona', async () => {
    mockarApi('falha-de-rede')
    abrir('/lanchonete-do-ze')

    const botao = await screen.findByRole('button', { name: 'Tentar de novo' })

    mockarApi({ status: 200, corpo: cardapioDoZe() })
    fireEvent.click(botao)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lanchonete do Zé' }),
    ).toBeInTheDocument()
  })

  it('endereço com mais de um segmento cai no não encontrado', () => {
    mockarApi({ status: 200, corpo: cardapioDoZe() })
    abrir('/lanchonete-do-ze/qualquer-coisa')
    expect(screen.getByRole('heading', { name: 'Não encontrado' })).toBeInTheDocument()
  })
})
