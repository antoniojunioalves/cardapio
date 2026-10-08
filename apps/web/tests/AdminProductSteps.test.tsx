import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  maisAdiante,
  passoAberto,
  passoAnterior,
  passoDisponivel,
  passosAlcancaveis,
  passosDe,
  passoSeguinte,
} from '../src/features/admin/product-steps'
import { useSessaoStore } from '../src/features/admin/session'
import {
  abrirNoCardapio,
  ADMIN,
  ATENDENTE,
  conflito,
  GRUPOS,
  plano,
  PRODUTOS,
} from './helpers/cardapio-admin'
import { buscaAtual, localAtual, pararConexaoAoVivo } from './helpers/pagina'

const abrir = abrirNoCardapio

const escrever = (rotulo: string, valor: string) => {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } })
}
const clicar = (nome: string | RegExp) => {
  fireEvent.click(screen.getByRole('button', { name: nome }))
}
/** O botão de um passo, no cabeçalho: "Passo 1: Produto". */
const passo = (numero: number, nome: string) =>
  screen.getByRole('button', { name: new RegExp(`^Passo ${String(numero)}: ${nome}`) })
/** Os passos do cabeçalho, como o leitor de tela os diz. */
const passosNaTela = () =>
  within(screen.getByRole('navigation', { name: 'Passos' }))
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label'))
/** O cabeçalho de uma categoria na lista do cardápio, que abre e recolhe. */
const cabecalho = (nome: string) => screen.getByRole('button', { name: new RegExp(`^${nome},`) })
/** Uma seção do passo pelo título — esperando a página carregar. */
const secaoDe = async (titulo: string) => {
  const h2 = await screen.findByRole('heading', { level: 2, name: titulo })
  return within(h2.closest('section') as HTMLElement)
}
/** Os grupos do produto, na ordem em que o passo dos opcionais os mostra. */
const gruposNaTela = () => {
  const titulo = screen.getByRole('heading', { level: 2, name: 'Opcionais' })
  return within(within(titulo.closest('section') as HTMLElement).getByRole('list'))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('p')?.textContent)
}
const enviosDe = (enviados: { metodo: string; caminho: string }[]) =>
  enviados.map((e) => `${e.metodo} ${e.caminho}`)
const png = () => new File(['png'], 'foto.png', { type: 'image/png' })
/** O navegador liberando o endereço de uma prévia que saiu da tela. */
const liberarPrevia = vi.fn()
/** O X-Burger com foto. */
const COM_FOTO = PRODUTOS.map((p) =>
  p.id === 'p-xburger' ? { ...p, imageUrl: 'http://api/uploads/xburger.webp' } : p,
)

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useSessaoStore.setState({ slug: null, estabelecimento: null, usuario: null, accessToken: null })
  pararConexaoAoVivo()
  // O jsdom não cria endereços para arquivos: a prévia da foto escolhida precisa deles.
  liberarPrevia.mockClear()
  Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:previa'),
    revokeObjectURL: liberarPrevia,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// --- Regras sem tela ---------------------------------------------------------------

describe('os passos, sem tela', () => {
  const simples = passosDe('SIMPLE')
  const combo = passosDe('COMBO')

  it('o produto tem dois passos; o combo, um a mais, para os itens', () => {
    expect(simples).toEqual(['produto', 'opcionais'])
    expect(combo).toEqual(['produto', 'itens', 'opcionais'])
  })

  it('sem produto criado, só o passo dele abre', () => {
    expect(combo.filter((p) => passoDisponivel(p, false))).toEqual(['produto'])
    expect(combo.filter((p) => passoDisponivel(p, true))).toEqual(combo)
  })

  it('o passo do endereço abre se existe para o produto e já dá para ir a ele', () => {
    expect(passoAberto('opcionais', simples, true)).toBe('opcionais')
    expect(passoAberto(null, simples, true)).toBe('produto')
    expect(passoAberto('qualquer-coisa', simples, true)).toBe('produto')
    // O produto comum não tem o passo dos itens.
    expect(passoAberto('itens', simples, true)).toBe('produto')
    expect(passoAberto('itens', combo, true)).toBe('itens')
    // Ainda não criado: os opcionais não abrem.
    expect(passoAberto('opcionais', simples, false)).toBe('produto')
  })

  it('editando, todos os passos podem ser abertos', () => {
    expect(
      passosAlcancaveis(combo, { cadastrando: false, produtoCriado: true, ate: 'produto' }),
    ).toEqual(combo)
  })

  it('cadastrando, só até onde o cadastro já chegou', () => {
    const cadastro = { cadastrando: true, produtoCriado: true }

    expect(passosAlcancaveis(combo, { ...cadastro, ate: 'itens' })).toEqual(['produto', 'itens'])
    expect(passosAlcancaveis(combo, { ...cadastro, ate: 'opcionais' })).toEqual(combo)
    expect(
      passosAlcancaveis(simples, { cadastrando: true, produtoCriado: false, ate: 'opcionais' }),
    ).toEqual(['produto'])
  })

  it('o seguinte, o anterior e o mais adiante', () => {
    expect(passoSeguinte(combo, 'produto')).toBe('itens')
    expect(passoSeguinte(simples, 'produto')).toBe('opcionais')
    expect(passoSeguinte(simples, 'opcionais')).toBeUndefined()
    expect(passoAnterior(simples, 'produto')).toBeUndefined()
    expect(passoAnterior(combo, 'opcionais')).toBe('itens')
    expect(maisAdiante(combo, 'opcionais', 'produto')).toBe('opcionais')
    expect(maisAdiante(combo, 'produto', 'itens')).toBe('itens')
    expect(maisAdiante(combo, undefined, 'produto')).toBe('produto')
  })
})

// --- O cadastro ---------------------------------------------------------------------

describe('o cadastro em passos', () => {
  it('do zero: categoria nova na janela, produto com foto, um grupo criado na janela, e salvar', async () => {
    const enviados = abrir('')
    await screen.findByRole('region', { name: 'Lanches' })

    // A categoria, numa janela sobre a lista.
    clicar('Nova categoria')
    const daCategoria = within(await screen.findByRole('dialog', { name: 'Nova categoria' }))
    fireEvent.change(daCategoria.getByLabelText('Nome da categoria'), {
      target: { value: 'Porções' },
    })
    fireEvent.click(daCategoria.getByRole('button', { name: 'Criar categoria' }))
    await screen.findByText('Categoria “Porções” criada.')
    fireEvent.click(screen.getByRole('link', { name: 'Novo produto em Porções' }))

    // Passo 1: o produto, com a categoria já escolhida no seletor.
    const escolherFoto = await screen.findByLabelText('Escolher foto')
    expect(screen.getByRole('heading', { level: 1, name: 'Novo produto' })).toBeVisible()
    expect(passosNaTela()).toEqual(['Passo 1: Produto', 'Passo 2: Opcionais'])
    expect(passo(1, 'Produto')).toHaveAttribute('aria-current', 'step')
    expect(passo(2, 'Opcionais')).toBeDisabled()
    expect(screen.getByText(/Passo 1 de 2/)).toHaveTextContent('Passo 1 de 2 · Produto')
    expect(screen.getByLabelText('Categoria')).toHaveValue('c-nova-1')
    fireEvent.change(escolherFoto, { target: { files: [png()] } })
    expect(await screen.findByRole('img', { name: 'Foto atual' })).toHaveAttribute(
      'src',
      'blob:previa',
    )
    escrever('Nome', 'Batata frita')
    escrever('Preço (R$)', '18')
    clicar('Salvar e continuar')

    // Passo 2: os opcionais, já no endereço do produto criado.
    const opcionais = await secaoDe('Opcionais')
    expect(
      await opcionais.findByText('Este produto não tem opcionais: o cliente pede como ele está.'),
    ).toBeVisible()
    expect(localAtual()).toBe(`${ADMIN}/cardapio/produtos/p-novo-2`)
    expect(buscaAtual()).toBe('?passo=opcionais')
    expect(screen.getByRole('heading', { level: 1, name: 'Novo produto' })).toBeVisible()
    expect(passosNaTela()).toEqual(['Passo 1: Produto, feito', 'Passo 2: Opcionais'])
    clicar('Criar um grupo novo')
    const janela = within(await screen.findByRole('dialog', { name: 'Novo grupo de opcionais' }))
    fireEvent.change(janela.getByLabelText('Nome do grupo'), { target: { value: 'Molhos' } })
    fireEvent.change(
      within(janela.getByRole('group', { name: 'Opção 1' })).getByLabelText('Nome'),
      { target: { value: 'Barbecue' } },
    )
    fireEvent.click(janela.getByRole('button', { name: 'Criar grupo' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    // Criar o grupo não encerra o cadastro: a pessoa continua no passo, com ele na lista.
    expect(localAtual()).toBe(`${ADMIN}/cardapio/produtos/p-novo-2`)
    expect(gruposNaTela()).toEqual(['Molhos'])
    // O último passo não tem para onde continuar: é "Salvar".
    expect(screen.queryByRole('button', { name: 'Salvar e continuar' })).toBeNull()
    clicar('Salvar')

    // De volta à lista, com a categoria do produto aberta.
    expect(await screen.findByText('Produto “Batata frita” cadastrado.')).toHaveAttribute(
      'role',
      'status',
    )
    expect(localAtual()).toBe(`${ADMIN}/cardapio`)
    expect(cabecalho('Porções')).toHaveAttribute('aria-expanded', 'true')
    expect(enviosDe(enviados)).toEqual([
      'POST /categories',
      'POST /products',
      'PUT /products/p-novo-2/image',
      'POST /option-groups',
      'PUT /products/p-novo-2/option-groups',
    ])
    expect(enviados[1]?.corpo).toEqual({
      type: 'SIMPLE',
      categoryId: 'c-nova-1',
      name: 'Batata frita',
      description: null,
      priceInCents: 1800,
      isAvailable: true,
    })
    expect(enviados[4]?.corpo).toEqual({ groupIds: ['g-novo-3'] })
  })

  it('"+ Novo produto" de uma categoria abre o passo do produto com ela no seletor', async () => {
    const enviados = abrir('')
    await screen.findByRole('region', { name: 'Bebidas' })
    fireEvent.click(screen.getByRole('link', { name: 'Novo produto em Bebidas' }))

    expect(await screen.findByLabelText('Categoria')).toHaveValue('c-bebidas')
    expect(buscaAtual()).toBe('?categoria=c-bebidas')
    escrever('Nome', 'Suco de laranja')
    escrever('Preço (R$)', '9,5')
    clicar('Salvar e continuar')

    await secaoDe('Opcionais')
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

  it('trocar a categoria no seletor cria o produto na outra', async () => {
    const enviados = abrir('/produtos/novo?categoria=c-bebidas')
    await screen.findByLabelText('Preço (R$)')

    escrever('Categoria', 'c-lanches')
    escrever('Nome', 'X-Tudo')
    escrever('Preço (R$)', '32')
    clicar('Salvar e continuar')

    await secaoDe('Opcionais')
    expect(enviados[0]?.corpo).toMatchObject({ categoryId: 'c-lanches', name: 'X-Tudo' })
  })

  it('sem categoria no endereço, o seletor começa na primeira do cardápio', async () => {
    abrir('/produtos/novo')

    expect(await screen.findByLabelText('Categoria')).toHaveValue('c-lanches')
  })

  it('salvar o último passo sem opcionais não grava nada a mais, e volta à lista', async () => {
    const enviados = abrir('/produtos/novo?categoria=c-bebidas')
    await screen.findByLabelText('Preço (R$)')
    escrever('Nome', 'Suco de laranja')
    escrever('Preço (R$)', '9,5')
    clicar('Salvar e continuar')
    await secaoDe('Opcionais')

    clicar('Salvar')

    expect(await screen.findByText('Produto “Suco de laranja” cadastrado.')).toBeVisible()
    expect(cabecalho('Bebidas')).toHaveAttribute('aria-expanded', 'true')
    expect(enviosDe(enviados)).toEqual(['POST /products'])
  })

  it('o último passo tem "Voltar"; o primeiro, não', async () => {
    abrir('/produtos/novo?categoria=c-bebidas')
    await screen.findByLabelText('Preço (R$)')
    // O primeiro passo não tem para onde voltar.
    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull()
    escrever('Nome', 'Suco')
    escrever('Preço (R$)', '9')
    clicar('Salvar e continuar')
    await secaoDe('Opcionais')

    clicar('Voltar')

    expect(await screen.findByLabelText('Preço (R$)')).toHaveValue('9,00')
    expect(buscaAtual()).toBe('?passo=produto')
    expect(passo(1, 'Produto')).toHaveAttribute('aria-current', 'step')
  })

  it('de volta ao passo já salvo, sem mudança, o botão só segue adiante', async () => {
    const enviados = abrir('/produtos/novo?categoria=c-bebidas')
    await screen.findByLabelText('Preço (R$)')
    escrever('Nome', 'Suco')
    escrever('Preço (R$)', '9')
    clicar('Salvar e continuar')
    await secaoDe('Opcionais')
    clicar('Voltar')
    await screen.findByLabelText('Preço (R$)')

    clicar('Salvar e continuar')

    await secaoDe('Opcionais')
    expect(enviosDe(enviados)).toEqual(['POST /products'])
  })

  it('antes de criar o produto, os opcionais não abrem — nem pelo endereço', async () => {
    abrir('/produtos/novo?categoria=c-bebidas&passo=opcionais')

    expect(await screen.findByLabelText('Preço (R$)')).toBeVisible()
    expect(passo(1, 'Produto')).toHaveAttribute('aria-current', 'step')
    expect(passo(2, 'Opcionais')).toBeDisabled()
  })

  it('o título do navegador e o da página dizem que é um produto novo', async () => {
    abrir('/produtos/novo')

    expect(await screen.findByRole('heading', { level: 1, name: 'Novo produto' })).toBeVisible()
    expect(document.title).toBe('Novo produto')
  })

  it('sem nenhuma categoria, a página manda criar uma no cardápio antes', async () => {
    abrir('/produtos/novo', { categorias: [], produtos: [] })

    expect(
      await screen.findByRole('link', { name: 'Crie a primeira categoria no cardápio' }),
    ).toHaveAttribute('href', `${ADMIN}/cardapio`)
    expect(screen.queryByLabelText('Nome')).toBeNull()
  })
})

// --- Passo 1: o produto --------------------------------------------------------------

describe('o passo do produto', () => {
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

  it('a categoria é um seletor, com as categorias na ordem do cardápio e a oculta marcada', async () => {
    abrir('/produtos/p-xburger')
    const seletor = await screen.findByLabelText('Categoria')

    expect(seletor.tagName).toBe('SELECT')
    expect(seletor).toHaveValue('c-lanches')
    expect(
      within(seletor)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Lanches', 'Bebidas', 'Sobremesas (oculta)'])
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

    expect(aoLado?.contains(foto)).toBe(false)
    expect(aoLado?.parentElement).toBe(bloco)
    for (const rotulo of ['Categoria', 'Descrição']) {
      expect(bloco?.contains(screen.getByLabelText(rotulo))).toBe(false)
    }
  })

  it('a foto fica numa moldura, com o lápis e a lixeira pequenos logo abaixo dela', async () => {
    abrir('/produtos/p-xburger', { produtos: COM_FOTO })
    const imagem = await screen.findByRole('img', { name: 'Foto atual' })
    // O lápis é o rótulo do campo do arquivo: tocar nele abre a escolha da foto.
    const lapis = screen.getByLabelText('Trocar foto').closest('label') as HTMLElement
    const lixeira = screen.getByRole('button', { name: 'Remover foto' })

    // Os três dentro da mesma moldura, com borda; os ícones, depois da imagem.
    const moldura = screen.getByRole('group', { name: 'Foto' })
    expect(moldura).toHaveClass('border')
    // Sem a palavra "Foto" em cima: o nome da moldura é só para o leitor de tela.
    expect(screen.queryByText('Foto', { exact: true })).toBeNull()
    expect(moldura).toContainElement(imagem)
    expect(moldura).toContainElement(lapis)
    const depois = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(depois(imagem, lapis)).toBe(true)
    expect(depois(lapis, lixeira)).toBe(true)
    // Só ícones: o que cada um faz está no nome, para o leitor de tela, e na cor.
    expect(within(lapis).getByText('Trocar foto')).toHaveClass('sr-only')
    expect(lixeira).toHaveTextContent('')
    expect(lapis).toHaveClass('text-info')
    expect(lixeira).toHaveClass('text-danger')
    // A imagem continua do tamanho de antes.
    expect(imagem.parentElement).toHaveClass('size-40')
  })

  it('a lixeira da foto a remove na hora, e fica só o lápis', async () => {
    const enviados = abrir('/produtos/p-xburger', { produtos: COM_FOTO })
    await screen.findByRole('img', { name: 'Foto atual' })

    clicar('Remover foto')

    expect(await screen.findByLabelText('Enviar foto')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Foto atual' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remover foto' })).toBeNull()
    expect(enviosDe(enviados)).toEqual(['DELETE /products/p-xburger/image'])
  })

  it('cadastrando: não envia sem nome ou com preço que não é valor', async () => {
    const enviados = abrir('/produtos/novo?categoria=c-bebidas')
    await screen.findByLabelText('Preço (R$)')
    escrever('Preço (R$)', 'dez')

    clicar('Salvar e continuar')

    expect(await screen.findByText('Informe o nome do produto.')).toBeVisible()
    expect(screen.getByText('Informe um valor em reais, como 25,90.')).toBeVisible()
    expect(passo(1, 'Produto')).toHaveAttribute('aria-current', 'step')
    expect(enviados).toEqual([])
  })

  it('o limite do plano: aviso na página, e a recusa da API explicada', async () => {
    abrir('/produtos/novo?categoria=c-bebidas', {
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
    clicar('Salvar e continuar')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O plano Grátis permite 20 produtos.',
    )
    expect(passo(1, 'Produto')).toHaveAttribute('aria-current', 'step')
  })

  it('cadastrando: a foto escolhida mostra a prévia e pode ser trocada ou tirada', async () => {
    const enviados = abrir('/produtos/novo?categoria=c-bebidas')
    const campo = await screen.findByLabelText('Escolher foto')
    // Sem foto, não há o que remover: só o lápis.
    expect(screen.queryByRole('button', { name: 'Remover foto' })).toBeNull()

    fireEvent.change(campo, { target: { files: [png()] } })

    expect(await screen.findByRole('img', { name: 'Foto atual' })).toBeVisible()
    expect(screen.getByLabelText('Trocar foto')).toBeInTheDocument()
    clicar('Remover foto')
    expect(screen.queryByRole('img', { name: 'Foto atual' })).toBeNull()
    expect(liberarPrevia).toHaveBeenCalledWith('blob:previa')
    // Nada vai para a API antes de o produto existir.
    expect(enviados).toEqual([])
  })

  it('cadastrando: arquivo que não é imagem, ou grande demais, é recusado antes de enviar', async () => {
    abrir('/produtos/novo?categoria=c-bebidas')
    const campo = await screen.findByLabelText('Escolher foto')

    fireEvent.change(campo, {
      target: { files: [new File(['pdf'], 'cardapio.pdf', { type: 'application/pdf' })] },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Envie uma imagem JPEG, PNG ou WebP.',
    )

    const grande = png()
    Object.defineProperty(grande, 'size', { value: 15 * 1024 * 1024 + 1 })
    fireEvent.change(campo, { target: { files: [grande] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A imagem é grande demais. Envie uma de até 15 MB.',
    )
    expect(screen.queryByRole('img', { name: 'Foto atual' })).toBeNull()

    // Uma imagem que serve tira a recusa.
    fireEvent.change(campo, { target: { files: [png()] } })
    expect(await screen.findByRole('img', { name: 'Foto atual' })).toBeVisible()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('foto recusada pela API: o produto fica criado, o cadastro segue e avisa', async () => {
    const enviados = abrir('/produtos/novo?categoria=c-bebidas', {
      forcar: { 'PUT /products/p-novo-1/image': { status: 422, corpo: {} } },
    })
    fireEvent.change(await screen.findByLabelText('Escolher foto'), { target: { files: [png()] } })
    escrever('Nome', 'Suco de laranja')
    escrever('Preço (R$)', '9,5')
    clicar('Salvar e continuar')

    await secaoDe('Opcionais')
    expect(screen.getByText(/a foto não pôde ser enviada/)).toHaveTextContent(
      'O produto foi criado, mas a foto não pôde ser enviada. Volte ao passo Produto para enviar de novo.',
    )
    expect(localAtual()).toBe(`${ADMIN}/cardapio/produtos/p-novo-1`)
    expect(enviosDe(enviados)).toEqual(['POST /products', 'PUT /products/p-novo-1/image'])

    // No passo do produto, agora que ele existe, a foto se envia na hora — e o aviso some.
    clicar('Voltar')
    expect(await screen.findByLabelText('Enviar foto')).toBeInTheDocument()
    expect(screen.queryByText(/a foto não pôde ser enviada/)).toBeNull()
  })

  it('o tipo se escolhe ao cadastrar — o produto comum vem marcado — e some na edição', async () => {
    abrir('/produtos/novo?categoria=c-bebidas')
    expect(await screen.findByRole('radio', { name: 'Produto' })).toBeChecked()
    escrever('Nome', 'Suco')
    escrever('Preço (R$)', '9')
    clicar('Salvar e continuar')
    await secaoDe('Opcionais')

    clicar('Voltar')

    expect(await screen.findByLabelText('Preço (R$)')).toHaveValue('9,00')
    expect(screen.queryByRole('radio', { name: 'Combo' })).toBeNull()
  })

  it('editando: abre no passo do produto, e os dois passos podem ser clicados', async () => {
    abrir('/produtos/p-xburger')

    expect(await screen.findByLabelText('Preço (R$)')).toHaveValue('25,90')
    expect(screen.getByRole('heading', { level: 1, name: 'Editar produto' })).toBeVisible()
    expect(document.title).toBe('Editar produto')
    // O nome do produto fica à vista em todos os passos.
    expect(screen.getByText('X-Burger', { selector: 'p' })).toBeVisible()
    expect(passosNaTela()).toEqual(['Passo 1: Produto', 'Passo 2: Opcionais'])
    expect(passo(1, 'Produto')).toHaveAttribute('aria-current', 'step')
    expect(passo(2, 'Opcionais')).toBeEnabled()
    // O botão leva adiante: fica ligado mesmo sem nada a salvar.
    expect(screen.getByRole('button', { name: 'Salvar e continuar' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull()
  })

  it('editando: sem mudança, "Salvar e continuar" só segue para os opcionais', async () => {
    const enviados = abrir('/produtos/p-xburger')
    await screen.findByLabelText('Preço (R$)')

    clicar('Salvar e continuar')

    await (await secaoDe('Opcionais')).findByText('Tamanho')
    expect(buscaAtual()).toBe('?passo=opcionais')
    expect(enviados).toEqual([])
  })

  it('editando: "Salvar e continuar" grava os campos, com a categoria, e segue', async () => {
    const enviados = abrir('/produtos/p-xburger')
    await screen.findByLabelText('Preço (R$)')

    escrever('Preço (R$)', '31,90')
    escrever('Categoria', 'c-bebidas')
    fireEvent.click(screen.getByRole('checkbox', { name: /^Disponível/ }))
    clicar('Salvar e continuar')

    await (await secaoDe('Opcionais')).findByText('Tamanho')
    // Sem o tipo, que não muda depois de criado.
    expect(enviados).toEqual([
      {
        metodo: 'PATCH',
        caminho: '/products/p-xburger',
        corpo: {
          categoryId: 'c-bebidas',
          name: 'X-Burger',
          description: null,
          priceInCents: 3190,
          isAvailable: false,
        },
      },
    ])
    // De volta ao passo, os campos mostram o que ficou gravado.
    clicar('Voltar')
    expect(await screen.findByLabelText('Preço (R$)')).toHaveValue('31,90')
    expect(screen.getByLabelText('Categoria')).toHaveValue('c-bebidas')
  })

  it('editando: campo inválido não segue adiante', async () => {
    const enviados = abrir('/produtos/p-xburger')
    await screen.findByLabelText('Preço (R$)')
    escrever('Nome', '')

    clicar('Salvar e continuar')

    expect(await screen.findByText('Informe o nome do produto.')).toBeVisible()
    expect(passo(1, 'Produto')).toHaveAttribute('aria-current', 'step')
    expect(enviados).toEqual([])
  })

  it('editando: falha ao gravar avisa, e a pessoa continua no passo', async () => {
    abrir('/produtos/p-xburger', {
      forcar: { 'PATCH /products/p-xburger': { status: 500, corpo: {} } },
    })
    await screen.findByLabelText('Preço (R$)')
    escrever('Preço (R$)', '31,90')

    clicar('Salvar e continuar')

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar agora.')
    expect(passo(1, 'Produto')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByLabelText('Preço (R$)')).toHaveValue('31,90')
  })

  it('editando: a foto se envia na hora, como multipart, sem mexer no que foi digitado', async () => {
    const enviados = abrir('/produtos/p-xburger')
    const campo = await screen.findByLabelText('Enviar foto')
    escrever('Preço (R$)', '29,90')

    fireEvent.change(campo, { target: { files: [png()] } })

    expect(await screen.findByRole('img', { name: 'Foto atual' })).toHaveAttribute(
      'src',
      'http://api/uploads/foto-nova.webp',
    )
    expect(screen.getByLabelText('Preço (R$)')).toHaveValue('29,90')
    // A foto foi pela rota dela; o preço só vai quando a pessoa salvar.
    expect(enviosDe(enviados)).toEqual(['PUT /products/p-xburger/image'])
    clicar('Salvar e continuar')
    await secaoDe('Opcionais')
    expect(enviados.at(-1)?.corpo).toMatchObject({ priceInCents: 2990 })
  })

  it('editando: foto grande demais é recusada com a explicação', async () => {
    abrir('/produtos/p-xburger', {
      forcar: { 'PUT /products/p-xburger/image': { status: 413, corpo: {} } },
    })

    fireEvent.change(await screen.findByLabelText('Enviar foto'), { target: { files: [png()] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A imagem é grande demais. Envie uma de até 15 MB.',
    )
  })

  it('o endereço de um passo que o produto não tem abre o passo do produto', async () => {
    abrir('/produtos/p-xburger?passo=itens')

    expect(await screen.findByLabelText('Preço (R$)')).toBeVisible()
    expect(passo(1, 'Produto')).toHaveAttribute('aria-current', 'step')
  })

  it('endereço de um produto que não existe avisa', async () => {
    abrir('/produtos/p-nao-existe')

    expect(await screen.findByRole('alert')).toHaveTextContent('Este produto não existe mais.')
  })
})

// --- A saída segurada ----------------------------------------------------------------

describe('sair de um passo com alteração por salvar', () => {
  it('pelo cabeçalho: segura a saída; descartar sai sem gravar, e o campo volta ao que era', async () => {
    const enviados = abrir('/produtos/p-xburger')
    await screen.findByLabelText('Preço (R$)')
    escrever('Preço (R$)', '99')

    fireEvent.click(passo(2, 'Opcionais'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este passo tem alterações por salvar. Salve-as antes de sair dele, ou descarte-as.',
    )
    expect(passo(1, 'Produto')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByLabelText('Preço (R$)')).toHaveValue('99')

    clicar('Descartar e ir para Opcionais')

    await secaoDe('Opcionais')
    expect(buscaAtual()).toBe('?passo=opcionais')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(enviados).toEqual([])
    fireEvent.click(passo(1, 'Produto'))
    expect(await screen.findByLabelText('Preço (R$)')).toHaveValue('25,90')
  })

  it('salvar em vez de descartar grava e segue, sem o aviso', async () => {
    const enviados = abrir('/produtos/p-xburger')
    await screen.findByLabelText('Preço (R$)')
    escrever('Preço (R$)', '99')
    fireEvent.click(passo(2, 'Opcionais'))
    await screen.findByRole('alert')

    clicar('Salvar e continuar')

    await secaoDe('Opcionais')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(enviosDe(enviados)).toEqual(['PATCH /products/p-xburger'])
  })

  it('sem alteração, o passo troca na hora', async () => {
    abrir('/produtos/p-xburger')
    await screen.findByLabelText('Preço (R$)')

    fireEvent.click(passo(2, 'Opcionais'))

    await secaoDe('Opcionais')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('o "Voltar" do último passo também é segurado, com os opcionais mexidos', async () => {
    const enviados = abrir('/produtos/p-xburger?passo=opcionais')
    await (await secaoDe('Opcionais')).findByText('Tamanho')
    clicar('Tirar Tamanho deste produto')

    clicar('Voltar')

    expect(await screen.findByRole('alert')).toHaveTextContent('alterações por salvar')
    expect(passo(2, 'Opcionais')).toHaveAttribute('aria-current', 'step')
    clicar('Descartar e ir para Produto')
    await screen.findByLabelText('Preço (R$)')
    expect(enviados).toEqual([])
    // De volta aos opcionais, o grupo continua no produto.
    fireEvent.click(passo(2, 'Opcionais'))
    expect(await (await secaoDe('Opcionais')).findByText('Tamanho')).toBeVisible()
  })
})

// --- Passo 2: os opcionais -----------------------------------------------------------

describe('o passo dos opcionais', () => {
  const abrirOpcionais = async (produtoId = 'p-xburger', api = {}, sessao?: typeof ATENDENTE) => {
    const enviados = abrir(`/produtos/${produtoId}?passo=opcionais`, api, sessao)
    const opcionais = await secaoDe('Opcionais')
    return { enviados, opcionais }
  }

  it('mostra os grupos do produto na ordem, com a regra e as opções de cada um', async () => {
    const { opcionais } = await abrirOpcionais()
    await opcionais.findByText('Tamanho')

    expect(gruposNaTela()).toEqual(['Tamanho', 'Adicionais'])
    expect(opcionais.getByText('Escolha 1 · obrigatório')).toBeVisible()
    expect(opcionais.getByText('Escolha até 2 · opcional')).toBeVisible()
    expect(opcionais.getByText('Normal, Grande (+R$ 6,00)')).toBeVisible()
    expect(passo(2, 'Opcionais')).toHaveAttribute('aria-current', 'step')
  })

  it('é o último passo: "Salvar" e "Voltar", sem "Salvar e continuar"', async () => {
    const { opcionais } = await abrirOpcionais()
    await opcionais.findByText('Tamanho')

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Salvar e continuar' })).toBeNull()
  })

  it('"Voltar" leva ao passo do produto', async () => {
    const { opcionais } = await abrirOpcionais()
    await opcionais.findByText('Tamanho')

    clicar('Voltar')

    expect(await screen.findByLabelText('Preço (R$)')).toHaveValue('25,90')
    expect(buscaAtual()).toBe('?passo=produto')
  })

  it('tirar, mudar a ordem e acrescentar não gravam nada: vão no "Salvar", a lista inteira', async () => {
    const { enviados, opcionais } = await abrirOpcionais()
    await opcionais.findByText('Tamanho')

    // Tirar é vermelho, como remover: sem a cor do botão comum por baixo.
    const tirar = screen.getByRole('button', { name: 'Tirar Tamanho deste produto' })
    expect(tirar).toHaveClass('text-danger')
    expect(tirar).not.toHaveClass('text-primary')
    clicar('Descer o grupo Tamanho')
    expect(gruposNaTela()).toEqual(['Adicionais', 'Tamanho'])
    clicar('Tirar Tamanho deste produto')
    // Só os que o produto não tem aparecem para escolher — o que acabou de sair volta à lista.
    const seletor = opcionais.getByLabelText('Adicionar um grupo que já existe')
    expect(
      within(seletor)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Escolha um grupo',
      'Retirar — Escolha até 2 · opcional',
      'Tamanho — Escolha 1 · obrigatório',
    ])
    fireEvent.change(seletor, { target: { value: 'g-retirar' } })
    clicar('Adicionar o grupo')
    expect(gruposNaTela()).toEqual(['Adicionais', 'Retirar'])
    expect(enviados).toEqual([])

    clicar('Salvar')

    // É o último passo: grava e volta à lista, com a categoria do produto aberta.
    expect(await screen.findByText('Produto “X-Burger” salvo.')).toHaveAttribute('role', 'status')
    expect(localAtual()).toBe(`${ADMIN}/cardapio`)
    await screen.findByRole('region', { name: 'Lanches' })
    expect(cabecalho('Lanches')).toHaveAttribute('aria-expanded', 'true')
    expect(enviados).toEqual([
      {
        metodo: 'PUT',
        caminho: '/products/p-xburger/option-groups',
        corpo: { groupIds: ['g-adicionais', 'g-retirar'] },
      },
    ])
  })

  it('sem mexer, "Salvar" só encerra: nada é gravado', async () => {
    const { enviados, opcionais } = await abrirOpcionais()
    await opcionais.findByText('Tamanho')

    clicar('Salvar')

    expect(await screen.findByText('Produto “X-Burger” salvo.')).toBeVisible()
    expect(enviados).toEqual([])
  })

  it('desfazer a mudança na mão volta ao que está gravado: nada a gravar', async () => {
    const { enviados, opcionais } = await abrirOpcionais()
    await opcionais.findByText('Tamanho')

    clicar('Descer o grupo Tamanho')
    clicar('Subir o grupo Tamanho')
    clicar('Salvar')

    expect(await screen.findByText('Produto “X-Burger” salvo.')).toBeVisible()
    expect(enviados).toEqual([])
  })

  it('criar um grupo na janela: ele é gravado ali e entra no fim da lista, por salvar', async () => {
    const { enviados, opcionais } = await abrirOpcionais('p-xsalada')
    await opcionais.findByText('Adicionais')
    // Com uma mudança já por salvar no passo, para ver que a janela não a grava junto.
    fireEvent.change(opcionais.getByLabelText('Adicionar um grupo que já existe'), {
      target: { value: 'g-retirar' },
    })
    clicar('Adicionar o grupo')

    clicar('Criar um grupo novo')
    const janela = within(await screen.findByRole('dialog', { name: 'Novo grupo de opcionais' }))
    fireEvent.change(janela.getByLabelText('Nome do grupo'), {
      target: { value: 'Ponto da carne' },
    })
    fireEvent.change(janela.getByLabelText('Mínimo'), { target: { value: '1' } })
    fireEvent.change(
      within(janela.getByRole('group', { name: 'Opção 1' })).getByLabelText('Nome'),
      { target: { value: 'Ao ponto' } },
    )
    fireEvent.click(janela.getByRole('button', { name: 'Criar grupo' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(gruposNaTela()).toEqual(['Adicionais', 'Retirar', 'Ponto da carne'])
    expect(opcionais.getByText('Ao ponto')).toBeVisible()
    // Enviar o formulário da janela não envia o do passo: só o grupo foi gravado.
    expect(enviosDe(enviados)).toEqual(['POST /option-groups'])
    expect(localAtual()).toBe(`${ADMIN}/cardapio/produtos/p-xsalada`)

    clicar('Salvar')

    expect(await screen.findByText('Produto “X-Salada” salvo.')).toBeVisible()
    // O novo vai no fim, depois dos que o produto já tinha.
    expect(enviados.at(-1)).toEqual({
      metodo: 'PUT',
      caminho: '/products/p-xsalada/option-groups',
      corpo: { groupIds: ['g-adicionais', 'g-retirar', 'g-novo-1'] },
    })
  })

  it('fechar a janela sem criar não muda a lista', async () => {
    const { enviados, opcionais } = await abrirOpcionais()
    await opcionais.findByText('Tamanho')

    clicar('Criar um grupo novo')
    const janela = within(await screen.findByRole('dialog'))
    fireEvent.click(janela.getByRole('button', { name: 'Fechar' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(gruposNaTela()).toEqual(['Tamanho', 'Adicionais'])
    expect(enviados).toEqual([])
  })

  it('o lápis de um grupo abre a janela para editar: grava o grupo, e a lista mostra o que mudou', async () => {
    const { enviados, opcionais } = await abrirOpcionais()
    await opcionais.findByText('Tamanho')

    clicar('Editar o grupo Adicionais')
    const janela = within(await screen.findByRole('dialog', { name: 'Editar grupo de opcionais' }))
    expect(janela.getByRole('note')).toHaveTextContent('Este grupo está em X-Burger e X-Salada.')
    fireEvent.change(
      within(janela.getByRole('group', { name: 'Opção 1' })).getByLabelText('A mais (R$)'),
      { target: { value: '7' } },
    )
    fireEvent.click(janela.getByRole('button', { name: 'Salvar alterações' }))

    expect(await opcionais.findByText(/Bacon \(\+R\$ 7,00\)/)).toBeVisible()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(enviosDe(enviados)).toEqual(['PUT /option-groups/g-adicionais'])
    // O grupo mudou; a lista de grupos do produto, não: o passo não tem o que gravar.
    expect(gruposNaTela()).toEqual(['Tamanho', 'Adicionais'])
    clicar('Salvar')
    await screen.findByText('Produto “X-Burger” salvo.')
    expect(enviosDe(enviados)).toEqual(['PUT /option-groups/g-adicionais'])
  })

  it('produto sem grupos explica que o cliente pede como está', async () => {
    const { opcionais } = await abrirOpcionais('p-refri')

    expect(
      await opcionais.findByText('Este produto não tem opcionais: o cliente pede como ele está.'),
    ).toBeVisible()
  })

  it('grupo obrigatório sem opção disponível avisa que o produto fica esgotado', async () => {
    const { opcionais } = await abrirOpcionais('p-xburger', {
      grupos: GRUPOS.map((g) =>
        g.id === 'g-tamanho'
          ? { ...g, options: g.options.map((o) => ({ ...o, isAvailable: false })) }
          : g,
      ),
    })

    expect(await opcionais.findByText(/o produto aparece esgotado no cardápio/)).toBeVisible()
  })

  it('falha ao gravar avisa, e a pessoa continua no passo, com a mudança na tela', async () => {
    const { enviados, opcionais } = await abrirOpcionais('p-xburger', {
      forcar: { 'PUT /products/p-xburger/option-groups': { status: 500, corpo: {} } },
    })
    await opcionais.findByText('Tamanho')

    clicar('Tirar Tamanho deste produto')
    clicar('Salvar')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível salvar agora. Tente de novo.',
    )
    expect(enviados).toHaveLength(1)
    expect(localAtual()).toBe(`${ADMIN}/cardapio/produtos/p-xburger`)
    expect(gruposNaTela()).toEqual(['Adicionais'])
  })

  it('o atendente vê os opcionais do produto, sem mexer', async () => {
    const { opcionais } = await abrirOpcionais('p-xburger', {}, ATENDENTE)
    await opcionais.findByText('Tamanho')

    expect(
      screen.queryByRole('button', {
        name: /Tirar|Subir|Descer|Adicionar|Editar|Criar|Salvar|Voltar/,
      }),
    ).toBeNull()
    expect(opcionais.queryByLabelText('Adicionar um grupo que já existe')).toBeNull()
  })
})

// --- Combos -------------------------------------------------------------------------

describe('o combo', () => {
  it('escolher "Combo" põe o passo dos itens no cadastro; o fim avisa que é um combo', async () => {
    const enviados = abrir('/produtos/novo?categoria=c-lanches')
    await screen.findByLabelText('Preço (R$)')
    expect(passosNaTela()).toHaveLength(2)

    fireEvent.click(screen.getByRole('radio', { name: 'Combo' }))
    await waitFor(() => {
      expect(passosNaTela()).toEqual([
        'Passo 1: Produto',
        'Passo 2: Itens do combo',
        'Passo 3: Opcionais',
      ])
    })
    escrever('Nome', 'Combo da casa')
    escrever('Preço (R$)', '35')
    clicar('Salvar e continuar')

    // Passo 2: os itens. É do meio: continua adiante, e dá para voltar.
    const itens = await secaoDe('Itens do combo')
    expect(buscaAtual()).toBe('?passo=itens')
    expect(await itens.findByText(/Sem itens, o combo aparece esgotado/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeEnabled()
    fireEvent.change(itens.getByLabelText('Adicionar um produto'), {
      target: { value: 'p-xburger' },
    })
    clicar('Adicionar ao combo')
    clicar('Salvar e continuar')

    // Passo 3: os opcionais — o combo também pode ter.
    await secaoDe('Opcionais')
    expect(buscaAtual()).toBe('?passo=opcionais')
    clicar('Salvar')

    expect(await screen.findByText('Combo “Combo da casa” cadastrado.')).toBeVisible()
    expect(enviosDe(enviados)).toEqual(['POST /products', 'PUT /products/p-novo-1/combo-items'])
    expect(enviados[0]?.corpo).toMatchObject({ type: 'COMBO', name: 'Combo da casa' })
    expect(enviados[1]?.corpo).toEqual({ items: [{ productId: 'p-xburger', quantity: 1 }] })
  })

  it('cadastrando, dá para seguir sem itens — com o aviso de que o combo fica esgotado', async () => {
    const enviados = abrir('/produtos/novo?categoria=c-lanches')
    fireEvent.click(await screen.findByRole('radio', { name: 'Combo' }))
    escrever('Nome', 'Combo da casa')
    escrever('Preço (R$)', '35')
    clicar('Salvar e continuar')
    const itens = await secaoDe('Itens do combo')
    await itens.findByText(/Sem itens, o combo aparece esgotado/)

    clicar('Salvar e continuar')

    await secaoDe('Opcionais')
    expect(enviosDe(enviados)).toEqual(['POST /products'])
  })

  it('editando: mostra os itens, quanto custariam separados e o preço do combo', async () => {
    abrir('/produtos/p-combo?passo=itens')
    const itens = await secaoDe('Itens do combo')

    expect(passosNaTela()).toEqual([
      'Passo 1: Produto',
      'Passo 2: Itens do combo',
      'Passo 3: Opcionais',
    ])
    expect(await itens.findByRole('group', { name: 'X-Burger' })).toBeVisible()
    expect(itens.getByRole('group', { name: 'Refrigerante' })).toBeVisible()
    expect(itens.getByText(/Separados, os itens custam/)).toHaveTextContent(
      'Separados, os itens custam R$ 31,90. O combo sai por R$ 39,90: não sai mais barato que os itens separados.',
    )
  })

  it('editando: muda a quantidade, acrescenta e tira; grava a lista inteira e segue', async () => {
    const enviados = abrir('/produtos/p-combo?passo=itens')
    const itens = await secaoDe('Itens do combo')
    await itens.findByRole('group', { name: 'X-Burger' })

    clicar('Aumentar X-Burger')
    expect(itens.getByText(/o cliente economiza R\$ 17,90/)).toBeVisible()
    // Só produtos simples, e não os que já estão no combo.
    const seletor = itens.getByLabelText('Adicionar um produto')
    expect(
      within(seletor)
        .getAllByRole('option')
        // O preço vem com o espaço que não quebra linha, como toda moeda formatada.
        .map((o) => o.textContent?.replace(/\s/g, ' ')),
    ).toEqual(['Escolha um produto', 'X-Salada — R$ 27,90'])
    fireEvent.change(seletor, { target: { value: 'p-xsalada' } })
    clicar('Adicionar ao combo')
    expect(screen.getByText(/X-Salada está esgotado/)).toBeVisible()
    clicar('Tirar Refrigerante do combo')
    clicar('Salvar e continuar')

    await secaoDe('Opcionais')
    expect(enviados).toEqual([
      {
        metodo: 'PUT',
        caminho: '/products/p-combo/combo-items',
        corpo: {
          items: [
            { productId: 'p-xburger', quantity: 2 },
            { productId: 'p-xsalada', quantity: 1 },
          ],
        },
      },
    ])
  })

  it('tirando todos os itens, não grava nem segue, e diz por quê', async () => {
    const enviados = abrir('/produtos/p-combo?passo=itens')
    const itens = await secaoDe('Itens do combo')
    await itens.findByRole('group', { name: 'X-Burger' })

    clicar('Tirar X-Burger do combo')
    clicar('Tirar Refrigerante do combo')
    clicar('Salvar e continuar')

    expect(itens.getByText('Escolha ao menos um produto para salvar.')).toBeVisible()
    expect(buscaAtual()).toBe('?passo=itens')
    expect(enviados).toEqual([])
  })

  it('o atendente vê os itens e as quantidades, sem mexer', async () => {
    abrir('/produtos/p-combo?passo=itens', {}, ATENDENTE)
    const itens = await secaoDe('Itens do combo')

    expect(
      within(await itens.findByRole('group', { name: 'X-Burger' })).getByText('1x'),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: /Aumentar|Tirar|Salvar|Voltar/ })).toBeNull()
  })
})

// --- Excluir e somente leitura --------------------------------------------------------

describe('excluir o produto, pelos passos', () => {
  it('exclui depois de confirmar, e volta à lista com a categoria aberta', async () => {
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

  it('no meio do cadastro, não há "Excluir": o produto acabou de nascer', async () => {
    abrir('/produtos/novo?categoria=c-bebidas')
    await screen.findByLabelText('Preço (R$)')
    escrever('Nome', 'Suco')
    escrever('Preço (R$)', '9')
    clicar('Salvar e continuar')
    await secaoDe('Opcionais')

    expect(screen.queryByRole('button', { name: 'Excluir produto' })).toBeNull()
  })
})

describe('quem só pode ver', () => {
  it('percorre os passos de um produto sem nada para gravar', async () => {
    abrir('/produtos/p-xburger', {}, ATENDENTE)

    expect(await screen.findByLabelText('Preço (R$)')).toBeDisabled()
    expect(screen.getByLabelText('Categoria')).toBeDisabled()
    expect(screen.getByRole('note')).toHaveTextContent('o seu perfil não permite alterá-lo')
    expect(screen.queryByRole('button', { name: /Salvar|Excluir|Voltar/ })).toBeNull()
    expect(screen.queryByLabelText('Enviar foto')).toBeNull()

    // Sem os botões do passo, é pelo cabeçalho que se vai de um a outro.
    fireEvent.click(passo(2, 'Opcionais'))
    expect(await (await secaoDe('Opcionais')).findByText('Tamanho')).toBeVisible()
  })
})
