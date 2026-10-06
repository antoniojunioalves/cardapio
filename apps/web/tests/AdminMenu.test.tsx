import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  agruparPorCategoria,
  formularioDeProdutoSchema,
  moverNaLista,
  produtoNovo,
} from '../src/features/admin/catalog'
import { cardapioNoPlano } from '../src/features/admin/plan'
import { useSessaoStore } from '../src/features/admin/session'
import {
  abrirNoCardapio,
  ADMIN,
  ATENDENTE,
  CATEGORIAS,
  categoria,
  conflito,
  DONO,
  plano,
  PRODUTOS,
  sessao,
  simularApi,
} from './helpers/cardapio-admin'
import { abrirComLocal, localAtual, mockarRotas, pararConexaoAoVivo } from './helpers/pagina'

const abrir = abrirNoCardapio

const secao = (nome: string) => screen.getByRole('region', { name: nome })
/** O cabeçalho da categoria, que abre e recolhe: "Lanches, 3 produtos · 1 esgotado". */
const cabecalho = (nome: string) => screen.getByRole('button', { name: new RegExp(`^${nome},`) })
const abrirCategoria = (nome: string) => {
  fireEvent.click(cabecalho(nome))
}
/** Os nomes das categorias, na ordem da tela. */
const nomesDasCategorias = () =>
  screen
    .getAllByRole('region')
    .map((r) => document.getElementById(r.getAttribute('aria-labelledby') ?? '')?.textContent)
const escrever = (rotulo: string, valor: string) => {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } })
}
const clicar = (nome: string | RegExp) => {
  fireEvent.click(screen.getByRole('button', { name: nome }))
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useSessaoStore.setState({ slug: null, estabelecimento: null, usuario: null, accessToken: null })
  pararConexaoAoVivo()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// --- Regras sem tela ---------------------------------------------------------------

describe('a lista, sem tela', () => {
  it('agrupa os produtos por categoria, na ordem do cardápio', () => {
    const grupos = agruparPorCategoria(CATEGORIAS, PRODUTOS)

    expect(grupos.map(({ categoria: c, produtos: ps }) => [c.name, ps.map((p) => p.name)])).toEqual(
      [
        ['Lanches', ['X-Burger', 'X-Salada', 'Combo do Zé']],
        ['Bebidas', ['Refrigerante']],
        ['Sobremesas', []],
      ],
    )
  })

  it('no empate de posição, ordena pelo nome', () => {
    const empatadas = [
      categoria({ id: 'b', name: 'Bebidas' }),
      categoria({ id: 'a', name: 'Açaí' }),
    ]

    expect(agruparPorCategoria(empatadas, []).map((g) => g.categoria.name)).toEqual([
      'Açaí',
      'Bebidas',
    ])
  })

  it('subir e descer trocam com o vizinho; nas pontas, nada muda', () => {
    expect(moverNaLista(['a', 'b', 'c'], 1, 'subir')).toEqual(['b', 'a', 'c'])
    expect(moverNaLista(['a', 'b', 'c'], 1, 'descer')).toEqual(['a', 'c', 'b'])
    expect(moverNaLista(['a', 'b', 'c'], 0, 'subir')).toEqual(['a', 'b', 'c'])
    expect(moverNaLista(['a', 'b', 'c'], 2, 'descer')).toEqual(['a', 'b', 'c'])
  })

  it('o uso do plano em uma frase, e quando o limite chegou', () => {
    expect(cardapioNoPlano(plano([4, 20], [3, 10]))).toEqual({
      texto: '4 de 20 produtos e 3 de 10 categorias do plano Grátis.',
      produtosNoLimite: false,
      categoriasNoLimite: false,
    })
    expect(cardapioNoPlano(plano([20, 20], [10, 10]))).toMatchObject({
      produtosNoLimite: true,
      categoriasNoLimite: true,
    })
    // Plano que não limita o cardápio não tem o que dizer.
    expect(cardapioNoPlano(plano([40, null], [12, null]))).toBeNull()
  })
})

describe('o preço do produto', () => {
  const precoDe = (valor: string) =>
    formularioDeProdutoSchema.safeParse({ ...produtoNovo('c'), name: 'X', priceInCents: valor })

  it('vai em centavos, do jeito que a pessoa digitar', () => {
    expect(precoDe('25,9').data?.priceInCents).toBe(2590)
    expect(precoDe('R$ 1.234,56').data?.priceInCents).toBe(123456)
    expect(precoDe('0').data?.priceInCents).toBe(0)
  })

  it('é obrigatório, tem de ser um valor e tem teto', () => {
    const mensagem = (valor: string) => precoDe(valor).error?.issues[0]?.message
    expect(mensagem('')).toBe('Informe o preço, como 25,90.')
    expect(mensagem('vinte')).toBe('Informe um valor em reais, como 25,90.')
    expect(mensagem('100.000,01')).toBe(
      'O preço passa de R$ 100.000,00. Confira se não sobrou um zero.',
    )
  })

  it('descrição em branco vai nula', () => {
    expect(precoDe('10').data?.description).toBeNull()
  })
})

// --- A lista -----------------------------------------------------------------------

describe('a tela do cardápio', () => {
  it('está no menu, e mostra as categorias na ordem, cada uma com os seus produtos', async () => {
    abrir('')
    const lanches = within(await screen.findByRole('region', { name: 'Lanches' }))
    abrirCategoria('Lanches')
    abrirCategoria('Sobremesas')

    expect(screen.getByRole('heading', { level: 1, name: 'Cardápio' })).toBeVisible()
    expect(
      within(screen.getByRole('navigation', { name: 'Painel' })).getByRole('link', {
        name: 'Cardápio',
      }),
    ).toHaveAttribute('aria-current', 'page')
    expect(nomesDasCategorias()).toEqual(['Lanches', 'Bebidas', 'Sobremesas'])
    expect(lanches.getAllByRole('link', { name: /^(X-|Combo)/ }).map((l) => l.textContent)).toEqual(
      ['X-Burger', 'X-Salada', 'Combo do Zé'],
    )
    expect(lanches.getByText('R$ 25,90')).toBeVisible()
    expect(lanches.getByText('Combo')).toBeVisible()
    expect(lanches.getByText('Esgotado')).toBeVisible()
    expect(lanches.getByLabelText('Disponível: X-Burger')).toBeChecked()
    expect(lanches.getByLabelText('Disponível: X-Salada')).not.toBeChecked()
    expect(within(secao('Sobremesas')).getByText('Oculta no cardápio')).toBeVisible()
    expect(within(secao('Sobremesas')).getByText('Nenhum produto nesta categoria.')).toBeVisible()
    expect(screen.getByText('4 de 20 produtos e 3 de 10 categorias do plano Grátis.')).toBeVisible()
    expect(document.title).toBe('Cardápio')
  })

  it('as categorias começam recolhidas, com o resumo à vista', async () => {
    abrir('')
    await screen.findByRole('region', { name: 'Lanches' })

    expect(cabecalho('Lanches')).toHaveAttribute('aria-expanded', 'false')
    expect(cabecalho('Lanches')).toHaveAccessibleName('Lanches, 3 produtos · 1 esgotado')
    expect(cabecalho('Sobremesas')).toHaveAccessibleName(
      'Sobremesas, 0 produtos, oculta no cardápio',
    )
    expect(screen.queryByRole('link', { name: 'X-Burger' })).toBeNull()
    expect(screen.queryByLabelText('Disponível: X-Burger')).not.toBeVisible()
  })

  it('"Novo produto" fica no alto da categoria, com texto, mesmo recolhida', async () => {
    abrir('')
    await screen.findByRole('region', { name: 'Lanches' })
    const lanches = within(secao('Lanches'))

    const novo = lanches.getByRole('link', { name: 'Novo produto em Lanches' })
    expect(cabecalho('Lanches')).toHaveAttribute('aria-expanded', 'false')
    expect(novo).toBeVisible()
    expect(novo).toHaveTextContent('Novo produto')
    expect(novo).toHaveAttribute('href', `${ADMIN}/cardapio/produtos/novo?categoria=c-lanches`)

    // Depois do lápis e da lixeira, e antes dos produtos — não mais no rodapé.
    abrirCategoria('Lanches')
    const depois = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(depois(lanches.getByRole('button', { name: 'Excluir a categoria Lanches' }), novo)).toBe(
      true,
    )
    expect(depois(novo, lanches.getByRole('link', { name: 'X-Burger' }))).toBe(true)
    expect(lanches.getAllByText('Novo produto')).toHaveLength(1)
  })

  it('o cabeçalho abre e recolhe a categoria, e só ela', async () => {
    abrir('')
    await screen.findByRole('region', { name: 'Lanches' })

    abrirCategoria('Lanches')

    expect(cabecalho('Lanches')).toHaveAttribute('aria-expanded', 'true')
    expect(within(secao('Lanches')).getByRole('link', { name: 'X-Burger' })).toBeVisible()
    expect(
      within(secao('Lanches')).getByRole('link', { name: 'Novo produto em Lanches' }),
    ).toBeVisible()
    expect(cabecalho('Bebidas')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Refrigerante' })).toBeNull()

    abrirCategoria('Lanches')

    expect(cabecalho('Lanches')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'X-Burger' })).toBeNull()
  })

  it('"Abrir todas" e "Recolher todas"', async () => {
    abrir('')
    await screen.findByRole('region', { name: 'Lanches' })

    clicar('Abrir todas')
    for (const nome of ['Lanches', 'Bebidas', 'Sobremesas']) {
      expect(cabecalho(nome)).toHaveAttribute('aria-expanded', 'true')
    }

    clicar('Recolher todas')
    for (const nome of ['Lanches', 'Bebidas', 'Sobremesas']) {
      expect(cabecalho(nome)).toHaveAttribute('aria-expanded', 'false')
    }
    expect(screen.getByRole('button', { name: 'Abrir todas' })).toBeVisible()
  })

  it('com uma categoria só, não há "Abrir todas"', async () => {
    abrir('', { categorias: CATEGORIAS.filter((c) => c.id === 'c-bebidas') })
    await screen.findByRole('region', { name: 'Bebidas' })

    expect(screen.queryByRole('button', { name: /Abrir todas|Recolher todas/ })).toBeNull()
  })

  it('a categoria aberta continua aberta depois de ir a um produto e voltar', async () => {
    abrir('')
    await screen.findByRole('region', { name: 'Lanches' })
    abrirCategoria('Lanches')
    abrirCategoria('Bebidas')

    fireEvent.click(screen.getByRole('link', { name: 'Refrigerante' }))
    await screen.findByLabelText('Preço (R$)')
    fireEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Cardápio' }))

    await screen.findByRole('region', { name: 'Lanches' })
    expect(cabecalho('Lanches')).toHaveAttribute('aria-expanded', 'true')
    expect(cabecalho('Bebidas')).toHaveAttribute('aria-expanded', 'true')
    expect(cabecalho('Sobremesas')).toHaveAttribute('aria-expanded', 'false')
  })

  it('voltar de um produto aberto pelo endereço abre a categoria dele', async () => {
    abrir('/produtos/p-refri')
    await screen.findByLabelText('Preço (R$)')

    fireEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Cardápio' }))

    await screen.findByRole('region', { name: 'Bebidas' })
    expect(cabecalho('Bebidas')).toHaveAttribute('aria-expanded', 'true')
    expect(cabecalho('Lanches')).toHaveAttribute('aria-expanded', 'false')
  })

  it('produto que mudou de categoria: voltar abre a categoria nova', async () => {
    abrir('/produtos/p-refri')
    await screen.findByLabelText('Preço (R$)')

    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'c-lanches' } })
    clicar('Salvar alterações')
    await screen.findByText('Produto salvo.')
    fireEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Cardápio' }))

    await screen.findByRole('region', { name: 'Lanches' })
    expect(cabecalho('Lanches')).toHaveAttribute('aria-expanded', 'true')
    expect(within(secao('Lanches')).getByRole('link', { name: 'Refrigerante' })).toBeVisible()
  })

  it('sem armazenamento no navegador, a lista funciona do mesmo jeito', async () => {
    const bloqueado = () => {
      throw new Error('armazenamento bloqueado')
    }
    vi.stubGlobal('sessionStorage', { getItem: bloqueado, setItem: bloqueado })
    abrir('')
    await screen.findByRole('region', { name: 'Lanches' })

    abrirCategoria('Lanches')

    expect(within(secao('Lanches')).getByRole('link', { name: 'X-Burger' })).toBeVisible()
  })

  it('o lápis ao lado do nome do produto leva à edição, como o próprio nome', async () => {
    abrir('')
    await screen.findByRole('region', { name: 'Lanches' })
    abrirCategoria('Lanches')
    const lanches = within(secao('Lanches'))

    const lapis = lanches.getByRole('link', { name: 'Editar X-Burger' })
    expect(lapis).toHaveAttribute('href', `${ADMIN}/cardapio/produtos/p-xburger`)
    expect(lanches.getByRole('link', { name: 'X-Burger' })).toHaveAttribute(
      'href',
      `${ADMIN}/cardapio/produtos/p-xburger`,
    )
    // O lápis e a lixeira vêm logo depois do nome, antes do preço.
    const lixeira = lanches.getByRole('button', { name: 'Excluir X-Burger' })
    const depois = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(depois(lanches.getByRole('link', { name: 'X-Burger' }), lapis)).toBe(true)
    expect(depois(lapis, lixeira)).toBe(true)
    expect(depois(lixeira, lanches.getByText('R$ 25,90'))).toBe(true)

    // Lápis azul, lixeira vermelha: as cores do tema para informação e perigo.
    expect(lapis).toHaveClass('text-info')
    expect(lixeira).toHaveClass('text-danger')

    fireEvent.click(lapis)
    expect(await screen.findByLabelText('Preço (R$)')).toHaveValue('25,90')
  })

  it('a lixeira do produto pergunta antes, exclui e a lista avisa', async () => {
    const enviados = abrir('')
    await screen.findByRole('region', { name: 'Bebidas' })
    abrirCategoria('Bebidas')

    clicar('Excluir Refrigerante')
    const janela = within(
      await screen.findByRole('dialog', { name: 'Excluir o produto “Refrigerante”?' }),
    )
    expect(janela.getByText(/Os pedidos já feitos continuam/)).toBeVisible()
    expect(enviados).toEqual([])
    fireEvent.click(janela.getByRole('button', { name: 'Excluir produto' }))

    expect(await screen.findByText('Produto “Refrigerante” excluído.')).toHaveAttribute(
      'role',
      'status',
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(secao('Bebidas')).getByText('Nenhum produto nesta categoria.')).toBeVisible()
    expect(enviados).toEqual([{ metodo: 'DELETE', caminho: '/products/p-refri', corpo: undefined }])
  })

  it('excluir pela lixeira manda reler o uso do plano', async () => {
    abrir('')
    await screen.findByRole('region', { name: 'Bebidas' })
    await screen.findByText(/do plano/)
    const leiturasDoPlano = () =>
      vi
        .mocked(globalThis.fetch)
        .mock.calls.filter(([url]) => typeof url === 'string' && url.endsWith('/admin/plan')).length
    const antes = leiturasDoPlano()
    abrirCategoria('Bebidas')

    clicar('Excluir Refrigerante')
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir produto' }),
    )
    await screen.findByText('Produto “Refrigerante” excluído.')

    await waitFor(() => {
      expect(leiturasDoPlano()).toBe(antes + 1)
    })
  })

  it('fechar a janela não exclui nada', async () => {
    const enviados = abrir('')
    await screen.findByRole('region', { name: 'Bebidas' })
    abrirCategoria('Bebidas')

    clicar('Excluir Refrigerante')
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Fechar' }),
    )

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(secao('Bebidas')).getByRole('link', { name: 'Refrigerante' })).toBeVisible()
    expect(enviados).toEqual([])
  })

  it('produto que está num combo: a janela diz em qual, e ele fica', async () => {
    abrir('', {
      forcar: {
        'DELETE /products/p-xburger': conflito(
          'PRODUCT_IN_COMBO',
          'O produto faz parte de: Combo do Zé. Tire-o desses combos antes.',
        ),
      },
    })
    await screen.findByRole('region', { name: 'Lanches' })
    abrirCategoria('Lanches')

    clicar('Excluir X-Burger')
    const janela = within(await screen.findByRole('dialog'))
    fireEvent.click(janela.getByRole('button', { name: 'Excluir produto' }))

    expect(await janela.findByRole('alert')).toHaveTextContent(
      'O produto faz parte de: Combo do Zé.',
    )
    expect(within(secao('Lanches')).getByRole('link', { name: 'X-Burger' })).toBeInTheDocument()
  })

  it('o lápis da categoria está ao lado do nome, mesmo com ela recolhida', async () => {
    abrir('')
    await screen.findByRole('region', { name: 'Lanches' })

    const lapis = within(secao('Lanches')).getByRole('link', { name: 'Editar a categoria Lanches' })
    expect(cabecalho('Lanches')).toHaveAttribute('aria-expanded', 'false')
    expect(
      Boolean(
        cabecalho('Lanches').compareDocumentPosition(lapis) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true)
    // O link de texto "Editar categoria" do rodapé saiu: o lápis faz o mesmo.
    abrirCategoria('Lanches')
    expect(within(secao('Lanches')).queryByText('Editar categoria')).toBeNull()

    fireEvent.click(lapis)
    expect(await screen.findByLabelText('Nome')).toHaveValue('Lanches')
  })

  it('clicar no nome da categoria continua só abrindo e recolhendo', async () => {
    abrir('')
    await screen.findByRole('region', { name: 'Lanches' })

    abrirCategoria('Lanches')

    expect(localAtual()).toBe(`${ADMIN}/cardapio`)
    expect(cabecalho('Lanches')).toHaveAttribute('aria-expanded', 'true')
  })

  it('a lixeira da categoria vazia pergunta antes, exclui e a lista avisa', async () => {
    const enviados = abrir('')
    await screen.findByRole('region', { name: 'Sobremesas' })

    clicar('Excluir a categoria Sobremesas')
    const janela = within(
      await screen.findByRole('dialog', { name: 'Excluir a categoria “Sobremesas”?' }),
    )
    fireEvent.click(janela.getByRole('button', { name: 'Excluir categoria' }))

    expect(await screen.findByText('Categoria “Sobremesas” excluída.')).toHaveAttribute(
      'role',
      'status',
    )
    expect(screen.queryByRole('region', { name: 'Sobremesas' })).toBeNull()
    expect(enviados).toEqual([
      { metodo: 'DELETE', caminho: '/categories/c-sobremesas', corpo: undefined },
    ])
  })

  it('a lixeira de uma categoria com produtos explica o que fazer, sem excluir', async () => {
    const enviados = abrir('')
    await screen.findByRole('region', { name: 'Lanches' })

    clicar('Excluir a categoria Lanches')

    const janela = within(
      await screen.findByRole('dialog', { name: 'Não dá para excluir a categoria “Lanches”' }),
    )
    expect(janela.getByText(/A categoria tem 3 produtos/)).toBeVisible()
    expect(janela.queryByRole('button', { name: 'Excluir categoria' })).toBeNull()
    expect(enviados).toEqual([])
  })

  it('cada ícone só aparece para quem pode: alterar sem excluir mostra só o lápis', async () => {
    abrir(
      '',
      {},
      sessao(['categories:read', 'categories:update', 'products:read', 'products:update']),
    )
    await screen.findByRole('region', { name: 'Lanches' })
    abrirCategoria('Lanches')

    expect(screen.getByRole('link', { name: 'Editar a categoria Lanches' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Editar X-Burger' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^Excluir/ })).toBeNull()
  })

  it('o atendente não vê lápis nem lixeira, mas o nome do produto abre a página só para ver', async () => {
    abrir('', {}, ATENDENTE)
    await screen.findByRole('region', { name: 'Lanches' })
    abrirCategoria('Lanches')

    expect(screen.queryByRole('link', { name: /^Editar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Excluir/ })).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'X-Burger' }))
    expect(await screen.findByLabelText('Preço (R$)')).toBeDisabled()
  })

  it('o estabelecimento novo vê o cardápio vazio e por onde começar', async () => {
    abrir('', { categorias: [], produtos: [] })

    expect(await screen.findByText('O cardápio ainda está vazio')).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: 'Criar a primeira categoria' }))
    await waitFor(() => {
      expect(localAtual()).toBe(`${ADMIN}/cardapio/categorias/nova`)
    })
  })

  it('marcar como esgotado grava na hora, só a disponibilidade', async () => {
    const enviados = abrir('')
    await screen.findByRole('region', { name: 'Lanches' })
    abrirCategoria('Lanches')

    fireEvent.click(screen.getByLabelText('Disponível: X-Burger'))

    await waitFor(() => {
      expect(screen.getByLabelText('Disponível: X-Burger')).not.toBeChecked()
    })
    expect(within(secao('Lanches')).getAllByText('Esgotado')).toHaveLength(2)
    // O resumo da categoria acompanha, para quem a recolher.
    expect(cabecalho('Lanches')).toHaveTextContent('3 produtos · 2 esgotados')
    expect(enviados).toEqual([
      { metodo: 'PATCH', caminho: '/products/p-xburger', corpo: { isAvailable: false } },
    ])
  })

  it('a caixa muda na hora, antes de a API responder', async () => {
    const enviados = simularApi()
    // Segura o PATCH até o teste soltar: como uma rede lenta.
    const daApi = globalThis.fetch
    let soltar = () => {}
    const segura = new Promise<void>((resolver) => {
      soltar = resolver
    })
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
      init?.method === 'PATCH' ? segura.then(() => daApi(url, init)) : daApi(url, init),
    )
    useSessaoStore.getState().guardar(DONO)
    abrirComLocal(`${ADMIN}/cardapio`)
    await screen.findByRole('region', { name: 'Lanches' })
    abrirCategoria('Lanches')

    fireEvent.click(screen.getByLabelText('Disponível: X-Burger'))

    await waitFor(() => {
      expect(screen.getByLabelText('Disponível: X-Burger')).not.toBeChecked()
    })
    expect(enviados).toEqual([])
    soltar()
    await waitFor(() => {
      expect(enviados).toHaveLength(1)
    })
    expect(screen.getByLabelText('Disponível: X-Burger')).not.toBeChecked()
  })

  it('falha ao marcar avisa na linha do produto, e a caixa volta ao que era', async () => {
    abrir('', { forcar: { 'PATCH /products/p-refri': 'falha-de-rede' } })
    await screen.findByRole('region', { name: 'Bebidas' })
    abrirCategoria('Bebidas')

    fireEvent.click(screen.getByLabelText('Disponível: Refrigerante'))

    expect(await within(secao('Bebidas')).findByRole('alert')).toHaveTextContent(
      'Não foi possível mudar a disponibilidade.',
    )
    expect(screen.getByLabelText('Disponível: Refrigerante')).toBeChecked()
  })

  it('desce uma categoria: a lista completa vai na ordem nova', async () => {
    const enviados = abrir('')
    await screen.findByRole('region', { name: 'Lanches' })

    expect(screen.getByRole('button', { name: 'Subir a categoria Lanches' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Descer a categoria Sobremesas' })).toBeDisabled()
    // Com as categorias recolhidas: a ordem delas se muda sem abrir nenhuma.
    clicar('Descer a categoria Lanches')

    await waitFor(() => {
      expect(nomesDasCategorias()).toEqual(['Bebidas', 'Lanches', 'Sobremesas'])
    })
    expect(cabecalho('Lanches')).toHaveAttribute('aria-expanded', 'false')
    expect(enviados).toEqual([
      {
        metodo: 'PUT',
        caminho: '/categories/order',
        corpo: { ids: ['c-bebidas', 'c-lanches', 'c-sobremesas'] },
      },
    ])
  })

  it('sobe um produto dentro da categoria', async () => {
    const enviados = abrir('')
    await screen.findByRole('region', { name: 'Lanches' })
    abrirCategoria('Lanches')

    clicar('Subir Combo do Zé')

    await waitFor(() => {
      expect(
        within(secao('Lanches'))
          .getAllByRole('link', { name: /^(X-|Combo)/ })
          .map((l) => l.textContent),
      ).toEqual(['X-Burger', 'Combo do Zé', 'X-Salada'])
    })
    expect(enviados).toEqual([
      {
        metodo: 'PUT',
        caminho: '/products/order',
        corpo: { categoryId: 'c-lanches', ids: ['p-xburger', 'p-combo', 'p-xsalada'] },
      },
    ])
  })

  it('falha ao reordenar avisa', async () => {
    abrir('', { forcar: { 'PUT /categories/order': { status: 500, corpo: {} } } })
    await screen.findByRole('region', { name: 'Lanches' })

    clicar('Descer a categoria Lanches')

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível mudar a ordem.')
  })

  it('no limite de produtos do plano, "Novo produto" se desliga e a tela diz por quê', async () => {
    abrir('', { plano: plano([20, 20], [3, 10]) })
    await screen.findByRole('region', { name: 'Lanches' })
    clicar('Abrir todas')

    expect(await screen.findByText(/chegou ao limite de produtos do plano/)).toBeVisible()
    for (const botao of screen.getAllByRole('button', { name: 'Novo produto' })) {
      expect(botao).toBeDisabled()
    }
    expect(screen.queryByRole('link', { name: /Novo produto em/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Nova categoria' })).toBeVisible()
  })

  it('no limite de categorias, "Nova categoria" se desliga', async () => {
    abrir('', { plano: plano([4, 20], [10, 10]) })
    await screen.findByText(/chegou ao limite de categorias do plano/)
    abrirCategoria('Lanches')

    expect(screen.getByRole('button', { name: 'Nova categoria' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Novo produto em Lanches' })).toBeVisible()
  })

  it('o atendente vê o cardápio e o que esgotou, sem alterar nada', async () => {
    abrir('', {}, ATENDENTE)
    const lanches = within(await screen.findByRole('region', { name: 'Lanches' }))
    // Recolher e abrir é só olhar: o atendente também pode.
    clicar('Abrir todas')

    expect(screen.getByRole('note')).toHaveTextContent('só quem administra o estabelecimento')
    expect(lanches.getByText('Esgotado')).toBeVisible()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /Subir|Descer/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Nova categoria|Novo produto|Editar/ })).toBeNull()
  })

  it('falha ao carregar avisa, sem mostrar um cardápio vazio', async () => {
    abrir('', { forcar: { 'GET /products': { status: 500, corpo: {} } } })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o cardápio.',
    )
    expect(screen.queryByText('O cardápio ainda está vazio')).toBeNull()
  })

  it('a lista do Início leva ao cardápio para cadastrar produtos', async () => {
    mockarRotas((url) =>
      url.endsWith('/admin/setup-checklist')
        ? { status: 200, corpo: { ready: false, steps: [{ key: 'products', done: false }] } }
        : {
            status: 200,
            corpo: url.endsWith('/admin/categories') || url.endsWith('/admin/products') ? [] : {},
          },
    )
    useSessaoStore.getState().guardar(DONO)
    abrirComLocal(ADMIN)

    fireEvent.click(await screen.findByRole('link', { name: 'Abrir o cardápio' }))

    expect(await screen.findByText('O cardápio ainda está vazio')).toBeVisible()
  })
})

// --- Categoria ---------------------------------------------------------------------

describe('categoria', () => {
  it('cria pelo botão da lista e volta à lista com ela', async () => {
    const enviados = abrir('')
    fireEvent.click(await screen.findByRole('link', { name: 'Nova categoria' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Nova categoria' })).toBeVisible()
    expect(screen.getByLabelText('Mostrar no cardápio')).toBeChecked()
    escrever('Nome', '  Porções ')
    clicar('Criar categoria')

    expect(await screen.findByText('Categoria “Porções” criada.')).toHaveAttribute('role', 'status')
    expect(localAtual()).toBe(`${ADMIN}/cardapio`)
    expect(screen.getByRole('region', { name: 'Porções' })).toBeVisible()
    // Chega aberta, pronta para o primeiro produto; as outras continuam recolhidas.
    expect(cabecalho('Porções')).toHaveAttribute('aria-expanded', 'true')
    expect(
      within(secao('Porções')).getByRole('link', { name: 'Novo produto em Porções' }),
    ).toBeVisible()
    expect(cabecalho('Lanches')).toHaveAttribute('aria-expanded', 'false')
    expect(enviados).toEqual([
      {
        metodo: 'POST',
        caminho: '/categories',
        corpo: { name: 'Porções', description: null, isActive: true },
      },
    ])
  })

  it('nome em branco não é enviado', async () => {
    const enviados = abrir('/categorias/nova')

    await screen.findByRole('button', { name: 'Criar categoria' })
    clicar('Criar categoria')
    expect(await screen.findByText('Informe o nome da categoria.')).toBeVisible()
    expect(enviados).toEqual([])
  })

  it('nome repetido aparece no campo', async () => {
    abrir('/categorias/nova', {
      forcar: {
        'POST /categories': conflito(
          'CATEGORY_NAME_TAKEN',
          'Já existe uma categoria com esse nome.',
        ),
      },
    })

    await screen.findByLabelText('Nome')
    escrever('Nome', 'bebidas')
    clicar('Criar categoria')

    expect(await screen.findByText('Já existe uma categoria com esse nome.')).toBeVisible()
    expect(screen.getByLabelText('Nome')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Confira os campos marcados')
  })

  it('o limite do plano é explicado com a frase da API', async () => {
    abrir('/categorias/nova', {
      forcar: {
        'POST /categories': conflito(
          'PLAN_CATEGORY_LIMIT',
          'O plano Grátis permite 10 categorias. Exclua uma categoria para abrir vaga, ou mude de plano.',
        ),
      },
    })

    await screen.findByLabelText('Nome')
    escrever('Nome', 'Porções')
    clicar('Criar categoria')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O plano Grátis permite 10 categorias.',
    )
  })

  it('edita: esconde do cardápio e salva', async () => {
    const enviados = abrir('')
    await screen.findByRole('region', { name: 'Lanches' })
    abrirCategoria('Lanches')
    fireEvent.click(screen.getByRole('link', { name: 'Editar a categoria Lanches' }))

    expect(await screen.findByLabelText('Nome')).toHaveValue('Lanches')
    expect(screen.getByLabelText('Descrição')).toHaveValue('Na chapa')
    fireEvent.click(screen.getByLabelText('Mostrar no cardápio'))
    clicar('Salvar alterações')

    expect(await screen.findByText('Categoria salva.')).toBeVisible()
    expect(enviados).toEqual([
      {
        metodo: 'PATCH',
        caminho: '/categories/c-lanches',
        corpo: { name: 'Lanches', description: 'Na chapa', isActive: false },
      },
    ])
  })

  it('com produtos dentro, não se exclui, e a tela diz o que fazer', async () => {
    abrir('/categorias/c-lanches')

    expect(await screen.findByRole('button', { name: 'Excluir categoria' })).toBeDisabled()
    expect(screen.getByText(/A categoria tem 3 produtos/)).toBeVisible()
  })

  it('vazia, exclui depois de confirmar, e volta à lista', async () => {
    const enviados = abrir('/categorias/c-sobremesas')

    await screen.findByRole('button', { name: 'Excluir categoria' })
    clicar('Excluir categoria')
    const janela = within(
      await screen.findByRole('dialog', { name: 'Excluir a categoria “Sobremesas”?' }),
    )
    expect(enviados).toEqual([])
    fireEvent.click(janela.getByRole('button', { name: 'Excluir categoria' }))

    expect(await screen.findByText('Categoria “Sobremesas” excluída.')).toHaveAttribute(
      'role',
      'status',
    )
    expect(localAtual()).toBe(`${ADMIN}/cardapio`)
    expect(screen.queryByRole('region', { name: 'Sobremesas' })).toBeNull()
    expect(enviados).toEqual([
      { metodo: 'DELETE', caminho: '/categories/c-sobremesas', corpo: undefined },
    ])
  })

  it('endereço de uma categoria que não existe avisa', async () => {
    abrir('/categorias/c-nao-existe')

    expect(await screen.findByRole('alert')).toHaveTextContent('Esta categoria não existe mais.')
  })
})

// --- Produto -----------------------------------------------------------------------

describe('produto', () => {
  it('cria a partir da categoria, e vai para a página dele, onde se envia a foto', async () => {
    const enviados = abrir('')
    await screen.findByRole('region', { name: 'Bebidas' })
    abrirCategoria('Bebidas')
    fireEvent.click(screen.getByRole('link', { name: 'Novo produto em Bebidas' }))

    expect(await screen.findByLabelText('Categoria')).toHaveValue('c-bebidas')
    // As categorias aparecem na ordem do cardápio; a oculta, marcada.
    expect(
      within(screen.getByLabelText('Categoria'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Lanches', 'Bebidas', 'Sobremesas (oculta)'])
    expect(screen.getByText('Você envia a foto logo depois de criar o produto.')).toBeVisible()
    escrever('Nome', 'Suco de laranja')
    escrever('Preço (R$)', '9,5')
    clicar('Criar produto')

    expect(
      await screen.findByText(
        'Produto criado. Agora você pode enviar a foto e escolher as opções.',
      ),
    ).toHaveAttribute('role', 'status')
    expect(localAtual()).toBe(`${ADMIN}/cardapio/produtos/p-novo-1`)
    expect(screen.getByRole('heading', { level: 1, name: 'Editar produto' })).toBeVisible()
    expect(screen.getByLabelText('Enviar foto')).toBeInTheDocument()
    expect(enviados).toEqual([
      {
        metodo: 'POST',
        caminho: '/products',
        corpo: {
          type: 'SIMPLE',
          categoryId: 'c-bebidas',
          name: 'Suco de laranja',
          description: null,
          priceInCents: 950,
          isAvailable: true,
        },
      },
    ])
  })

  it('não envia sem nome ou com preço que não é valor', async () => {
    const enviados = abrir('/produtos/novo')

    await screen.findByLabelText('Preço (R$)')
    escrever('Preço (R$)', 'dez')
    clicar('Criar produto')

    expect(await screen.findByText('Informe o nome do produto.')).toBeVisible()
    expect(screen.getByText('Informe um valor em reais, como 25,90.')).toBeVisible()
    expect(enviados).toEqual([])
  })

  it('o limite do plano: aviso na página, e a recusa da API explicada', async () => {
    abrir('/produtos/novo', {
      plano: plano([20, 20], [3, 10]),
      forcar: {
        'POST /products': conflito(
          'PLAN_PRODUCT_LIMIT',
          'O plano Grátis permite 20 produtos. Exclua um produto para abrir vaga, ou mude de plano.',
        ),
      },
    })

    expect(await screen.findByText(/chegou ao limite de produtos do plano/)).toBeVisible()
    escrever('Nome', 'Pastel')
    escrever('Preço (R$)', '8')
    clicar('Criar produto')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O plano Grátis permite 20 produtos.',
    )
  })

  it('sem nenhuma categoria, a página manda criar uma antes', async () => {
    abrir('/produtos/novo', { categorias: [], produtos: [] })

    expect(await screen.findByRole('link', { name: 'Crie a primeira categoria' })).toBeVisible()
    expect(screen.queryByLabelText('Nome')).toBeNull()
  })

  it('edita preço e categoria, e salva só com o que mudou no formulário', async () => {
    const enviados = abrir('')
    await screen.findByRole('region', { name: 'Lanches' })
    abrirCategoria('Lanches')
    fireEvent.click(screen.getByRole('link', { name: 'X-Burger' }))

    expect(await screen.findByLabelText('Preço (R$)')).toHaveValue('25,90')
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled()
    escrever('Preço (R$)', '27,90')
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'c-bebidas' } })
    clicar('Salvar alterações')

    expect(await screen.findByText('Produto salvo.')).toBeVisible()
    expect(screen.getByLabelText('Preço (R$)')).toHaveValue('27,90')
    expect(enviados).toEqual([
      {
        metodo: 'PATCH',
        caminho: '/products/p-xburger',
        corpo: {
          categoryId: 'c-bebidas',
          name: 'X-Burger',
          description: null,
          priceInCents: 2790,
          isAvailable: true,
        },
      },
    ])
  })

  it('a foto é a primeira coisa do quadro do produto, antes dos campos', async () => {
    abrir('/produtos/p-xburger')
    const foto = await screen.findByLabelText('Enviar foto')

    const antes = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    const quadro = screen.getByRole('heading', { level: 2, name: 'Produto' })
    expect(antes(quadro, foto)).toBe(true)
    expect(antes(foto, screen.getByLabelText('Nome'))).toBe(true)
    // Um quadro só: a foto não tem mais seção própria.
    expect(screen.queryByRole('heading', { level: 2, name: 'Foto' })).toBeNull()
  })

  it('os campos vêm na ordem: nome, preço, disponível, categoria e descrição', async () => {
    abrir('/produtos/p-xburger')
    await screen.findByLabelText('Enviar foto')

    const campos: [string, HTMLElement][] = [
      ['Categoria', screen.getByLabelText('Categoria')],
      ['Descrição', screen.getByLabelText('Descrição')],
      ['Disponível', screen.getByRole('checkbox', { name: /^Disponível/ })],
      ['Nome', screen.getByLabelText('Nome')],
      ['Preço', screen.getByLabelText('Preço (R$)')],
    ]
    const naTela = campos
      .sort(([, a], [, b]) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      )
      .map(([rotulo]) => rotulo)
    expect(naTela).toEqual(['Nome', 'Preço', 'Disponível', 'Categoria', 'Descrição'])
  })

  it('a foto, o nome, o preço e o "Disponível" formam um bloco; categoria e descrição ficam fora', async () => {
    abrir('/produtos/p-xburger')
    const foto = await screen.findByLabelText('Enviar foto')

    // O menor elemento que contém todos: em tela grande, o CSS põe o bloco em duas colunas.
    const juntos = (...elementos: HTMLElement[]) => {
      let no = elementos[0]?.parentElement
      while (no && !elementos.every((elemento) => no?.contains(elemento))) no = no.parentElement
      return no
    }
    const nome = screen.getByLabelText('Nome')
    const preco = screen.getByLabelText('Preço (R$)')
    const disponivel = screen.getByRole('checkbox', { name: /^Disponível/ })
    const aoLado = juntos(nome, preco, disponivel)
    const bloco = juntos(foto, nome, preco, disponivel)

    // A foto fica de um lado e os três campos do outro.
    expect(aoLado?.contains(foto)).toBe(false)
    expect(aoLado?.parentElement).toBe(bloco)
    for (const rotulo of ['Categoria', 'Descrição']) {
      expect(bloco?.contains(screen.getByLabelText(rotulo))).toBe(false)
    }
  })

  it('no produto novo, o lugar da foto também vem primeiro, explicando quando enviar', async () => {
    abrir('/produtos/novo')
    const aviso = await screen.findByText('Você envia a foto logo depois de criar o produto.')

    expect(
      Boolean(
        aviso.compareDocumentPosition(screen.getByLabelText('Nome')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true)
    expect(screen.queryByLabelText('Enviar foto')).toBeNull()
  })

  it('enviar a foto não apaga o que foi digitado e ainda não foi salvo', async () => {
    const enviados = abrir('/produtos/p-xburger')
    const campo = await screen.findByLabelText('Enviar foto')

    escrever('Preço (R$)', '29,90')
    fireEvent.change(campo, {
      target: { files: [new File(['png'], 'foto.png', { type: 'image/png' })] },
    })
    await screen.findByRole('img', { name: 'Foto atual' })

    expect(screen.getByLabelText('Preço (R$)')).toHaveValue('29,90')
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeEnabled()
    // A foto foi pela rota dela; o preço só vai quando a pessoa salvar.
    expect(enviados.map((e) => `${e.metodo} ${e.caminho}`)).toEqual([
      'PUT /products/p-xburger/image',
    ])
    clicar('Salvar alterações')
    await screen.findByText('Produto salvo.')
    expect(enviados.at(-1)?.corpo).toMatchObject({ priceInCents: 2990 })
  })

  it('envia a foto na hora, como multipart', async () => {
    const enviados = abrir('/produtos/p-xburger')
    const campo = await screen.findByLabelText('Enviar foto')
    expect(screen.getAllByText('Foto', { exact: true })).toHaveLength(1)

    fireEvent.change(campo, {
      target: { files: [new File(['png'], 'foto.png', { type: 'image/png' })] },
    })

    expect(await screen.findByRole('img', { name: 'Foto atual' })).toHaveAttribute(
      'src',
      'http://api/uploads/foto-nova.webp',
    )
    expect(enviados.map((e) => `${e.metodo} ${e.caminho}`)).toEqual([
      'PUT /products/p-xburger/image',
    ])
  })

  it('foto grande demais é recusada com a explicação', async () => {
    abrir('/produtos/p-xburger', {
      forcar: { 'PUT /products/p-xburger/image': { status: 413, corpo: {} } },
    })
    const campo = await screen.findByLabelText('Enviar foto')

    fireEvent.change(campo, {
      target: { files: [new File(['x'], 'grande.jpg', { type: 'image/jpeg' })] },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A imagem é grande demais. Envie uma de até 15 MB.',
    )
  })

  it('exclui depois de confirmar, e volta à lista', async () => {
    const enviados = abrir('/produtos/p-refri')

    await screen.findByRole('button', { name: 'Excluir produto' })
    clicar('Excluir produto')
    const janela = within(
      await screen.findByRole('dialog', { name: 'Excluir o produto “Refrigerante”?' }),
    )
    expect(janela.getByText(/Os pedidos já feitos continuam/)).toBeVisible()
    fireEvent.click(janela.getByRole('button', { name: 'Excluir produto' }))

    expect(await screen.findByText('Produto “Refrigerante” excluído.')).toHaveAttribute(
      'role',
      'status',
    )
    expect(localAtual()).toBe(`${ADMIN}/cardapio`)
    const bebidas = within(await screen.findByRole('region', { name: 'Bebidas' }))
    expect(bebidas.getByText('Nenhum produto nesta categoria.')).toBeVisible()
    expect(cabecalho('Bebidas')).toHaveAttribute('aria-expanded', 'true')
    expect(enviados).toEqual([{ metodo: 'DELETE', caminho: '/products/p-refri', corpo: undefined }])
  })

  it('produto que está num combo não se exclui, e a janela diz em qual', async () => {
    abrir('/produtos/p-xburger', {
      forcar: {
        'DELETE /products/p-xburger': conflito(
          'PRODUCT_IN_COMBO',
          'O produto faz parte de: Combo do Zé. Tire-o desses combos antes.',
        ),
      },
    })

    await screen.findByRole('button', { name: 'Excluir produto' })
    clicar('Excluir produto')
    const janela = within(await screen.findByRole('dialog'))
    fireEvent.click(janela.getByRole('button', { name: 'Excluir produto' }))

    expect(await janela.findByRole('alert')).toHaveTextContent(
      'O produto faz parte de: Combo do Zé.',
    )
    expect(localAtual()).toBe(`${ADMIN}/cardapio/produtos/p-xburger`)
  })

  it('endereço de um produto que não existe avisa', async () => {
    abrir('/produtos/p-nao-existe')

    expect(await screen.findByRole('alert')).toHaveTextContent('Este produto não existe mais.')
  })

  it('o atendente abre o produto só para ver', async () => {
    abrir('/produtos/p-xburger', {}, ATENDENTE)

    expect(await screen.findByLabelText('Preço (R$)')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Salvar|Excluir/ })).toBeNull()
    expect(screen.queryByLabelText('Enviar foto')).toBeNull()
  })
})
