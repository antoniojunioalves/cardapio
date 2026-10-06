import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  formularioDoGrupoSchema,
  GRUPO_NOVO,
  listaEmPalavras,
  opcoesEmPalavras,
  porQueNaoExcluirGrupo,
  precoAvulso,
  produtosParaOCombo,
  regraDigitada,
  regraEmPalavras,
  type Opcao,
} from '../src/features/admin/option-groups'
import { useSessaoStore } from '../src/features/admin/session'
import {
  abrirNoCardapio,
  ADMIN,
  ATENDENTE,
  GRUPOS,
  PRODUTOS,
  produto,
} from './helpers/cardapio-admin'
import { localAtual, pararConexaoAoVivo } from './helpers/pagina'

const abrir = abrirNoCardapio
const escrever = (campo: HTMLElement, valor: string) => {
  fireEvent.change(campo, { target: { value: valor } })
}
const clicar = (nome: string | RegExp) => {
  fireEvent.click(screen.getByRole('button', { name: nome }))
}
const opcao = (indice: number) =>
  within(screen.getByRole('group', { name: `Opção ${String(indice)}` }))
/** Uma seção da página pelo título — esperando a página carregar. */
const secaoDe = async (titulo: string) => {
  const h2 = await screen.findByRole('heading', { level: 2, name: titulo })
  return within(h2.closest('section') as HTMLElement)
}
/** As opções do produto, dentro do quadro dele — esperando a página carregar. */
const opcoesDoProduto = async () => within(await screen.findByRole('region', { name: 'Opções' }))
/** O "Salvar" da página do produto: o dos campos e das opções. */
const salvarOProduto = () => screen.getByRole('button', { name: 'Salvar alterações' })
/** O cartão de um grupo na lista, pelo nome. */
const cartaoDoGrupo = (nome: string) =>
  within(screen.getByRole('heading', { level: 2, name: nome }).closest('li') as HTMLElement)

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

describe('em palavras', () => {
  it('a regra do grupo, como o cliente vê, e se é obrigatória', () => {
    expect(regraEmPalavras({ minSelections: 1, maxSelections: 1 })).toBe('Escolha 1 · obrigatório')
    expect(regraEmPalavras({ minSelections: 0, maxSelections: 3 })).toBe('Escolha até 3 · opcional')
    expect(regraEmPalavras({ minSelections: 1, maxSelections: 2 })).toBe(
      'Escolha de 1 a 2 · obrigatório',
    )
  })

  it('as opções, com o acréscimo e o que esgotou', () => {
    const opcoes = GRUPOS.find((g) => g.id === 'g-adicionais')?.options as Opcao[]

    expect(opcoesEmPalavras(opcoes)).toBe(
      'Bacon (+R$ 5,00), Cheddar (+R$ 4,00), Ovo (+R$ 3,00, esgotado)',
    )
  })

  it('a lista de produtos, com "e" no fim', () => {
    expect(listaEmPalavras(['X-Burger'])).toBe('X-Burger')
    expect(listaEmPalavras(['X-Burger', 'X-Salada'])).toBe('X-Burger e X-Salada')
    expect(listaEmPalavras(['A', 'B', 'C'])).toBe('A, B e C')
  })

  it('a regra digitada, enquanto a pessoa preenche', () => {
    expect(regraDigitada('0', '3')).toBe('Escolha até 3 · opcional')
    expect(regraDigitada('2', '1')).toBeNull()
    expect(regraDigitada('', '1')).toBeNull()
  })

  it('o grupo em uso não se exclui, e a frase diz onde ele está', () => {
    expect(porQueNaoExcluirGrupo({ products: [] })).toBeNull()
    expect(porQueNaoExcluirGrupo({ products: [{ id: 'a', name: 'X-Burger' }] })).toBe(
      'O grupo está em X-Burger. Para excluí-lo, tire-o desse produto antes, na página dele.',
    )
  })
})

describe('o formulário do grupo', () => {
  const op = (name: string, priceDeltaInCents = '') => ({
    name,
    priceDeltaInCents,
    isAvailable: true,
  })
  const erros = (valores: object) =>
    formularioDoGrupoSchema
      .safeParse({ ...GRUPO_NOVO, name: 'Tamanho', ...valores })
      .error?.issues.map((i) => [i.path.join('.'), i.message])

  it('entrega à API números, centavos e nulo na descrição em branco', () => {
    const dados = formularioDoGrupoSchema.parse({
      ...GRUPO_NOVO,
      name: ' Tamanho ',
      minSelections: '1',
      maxSelections: '1',
      options: [op('Normal'), op('Grande', '6')],
    })

    expect(dados).toEqual({
      name: 'Tamanho',
      description: null,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { name: 'Normal', priceDeltaInCents: 0, isAvailable: true },
        { name: 'Grande', priceDeltaInCents: 600, isAvailable: true },
      ],
    })
  })

  it('cada regra põe o erro no campo dela, com as palavras da API', () => {
    expect(erros({ minSelections: '2', maxSelections: '2', options: [op('Única')] })).toEqual([
      [
        'minSelections',
        'O grupo pede 2 escolhas, mas tem 1 opção: o produto ficaria impossível de pedir.',
      ],
      ['maxSelections', 'O máximo de escolhas (2) passa do número de opções (1).'],
    ])
    expect(erros({ minSelections: '2', maxSelections: '1', options: [op('A'), op('B')] })).toEqual([
      ['maxSelections', 'O mínimo de escolhas não pode ser maior que o máximo.'],
    ])
    expect(erros({ options: [] })).toEqual([['options', 'Cadastre ao menos uma opção.']])
    expect(erros({ maxSelections: '2', options: [op('Bacon'), op(' bacon ')] })).toEqual([
      ['options.1.name', 'Já existe uma opção com este nome.'],
    ])
  })

  it('uma regra roda com os campos dela válidos, mesmo que outro esteja errado', () => {
    expect(erros({ minSelections: 'um', maxSelections: '5', options: [op('A')] })).toEqual([
      ['minSelections', 'Informe um número de 0 a 50.'],
      ['maxSelections', 'O máximo de escolhas (5) passa do número de opções (1).'],
    ])
  })
})

describe('itens do combo, sem tela', () => {
  it('só produtos simples entram, sem repetir, em ordem alfabética', () => {
    expect(produtosParaOCombo(PRODUTOS, ['p-refri']).map((p) => p.name)).toEqual([
      'X-Burger',
      'X-Salada',
    ])
  })

  it('o preço separado soma cada item pela quantidade', () => {
    expect(
      precoAvulso(
        [
          { productId: 'p-xburger', quantity: 2 },
          { productId: 'p-refri', quantity: 1 },
        ],
        PRODUTOS,
      ),
    ).toBe(2590 * 2 + 600)
  })
})

// --- Abas e lista dos grupos ---------------------------------------------------------

describe('as abas do cardápio', () => {
  it('Produtos e Opções e adicionais, cada uma no seu endereço', async () => {
    abrir('/opcoes')
    await screen.findByText('Adicionais')

    const abas = within(screen.getByRole('navigation', { name: 'Cardápio' }))
    expect(abas.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Produtos', `${ADMIN}/cardapio`],
      ['Opções e adicionais', `${ADMIN}/cardapio/opcoes`],
    ])
    expect(abas.getByRole('link', { name: 'Opções e adicionais' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Cardápio' })).toBeVisible()
    // O item do menu continua marcado.
    expect(
      within(screen.getByRole('navigation', { name: 'Painel' })).getByRole('link', {
        name: 'Cardápio',
      }),
    ).toHaveAttribute('aria-current', 'page')
  })
})

describe('a lista dos grupos', () => {
  it('mostra cada grupo com a regra, as opções e onde ele é usado', async () => {
    abrir('/opcoes')
    await screen.findByText('Adicionais')

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Adicionais',
      'Retirar',
      'Tamanho',
    ])
    const adicionais = cartaoDoGrupo('Adicionais')
    expect(adicionais.getByText('Escolha até 2 · opcional')).toBeVisible()
    expect(
      adicionais.getByText('Bacon (+R$ 5,00), Cheddar (+R$ 4,00), Ovo (+R$ 3,00, esgotado)'),
    ).toBeVisible()
    expect(adicionais.getByText('Em X-Burger e X-Salada.')).toBeVisible()
    expect(screen.getByText('Ainda não está em nenhum produto.')).toBeVisible()
  })

  it('o estabelecimento novo vê exemplos e por onde começar', async () => {
    abrir('/opcoes', { grupos: [] })

    expect(await screen.findByText('Nenhum grupo de opções ainda')).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: 'Criar o primeiro grupo' }))
    await waitFor(() => {
      expect(localAtual()).toBe(`${ADMIN}/cardapio/opcoes/novo`)
    })
  })

  it('a lixeira de um grupo sem uso pergunta, exclui e a lista avisa', async () => {
    const enviados = abrir('/opcoes')
    await screen.findByText('Retirar')

    clicar('Excluir o grupo Retirar')
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: 'Excluir o grupo “Retirar”?' })).getByRole(
        'button',
        { name: 'Excluir grupo' },
      ),
    )

    expect(await screen.findByText('Grupo “Retirar” excluído.')).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('heading', { level: 2, name: 'Retirar' })).toBeNull()
    expect(enviados).toEqual([
      { metodo: 'DELETE', caminho: '/option-groups/g-retirar', corpo: undefined },
    ])
  })

  it('a lixeira de um grupo em uso diz onde ele está, sem excluir', async () => {
    const enviados = abrir('/opcoes')
    await screen.findByText('Adicionais')

    clicar('Excluir o grupo Adicionais')

    const janela = within(
      await screen.findByRole('dialog', { name: 'Não dá para excluir o grupo “Adicionais”' }),
    )
    expect(janela.getByText(/O grupo está em X-Burger e X-Salada/)).toBeVisible()
    expect(janela.queryByRole('button', { name: 'Excluir grupo' })).toBeNull()
    expect(enviados).toEqual([])
  })

  it('o atendente vê os grupos, sem criar, editar nem excluir', async () => {
    abrir('/opcoes', {}, ATENDENTE)
    await screen.findByText('Adicionais')

    expect(screen.getByRole('note')).toHaveTextContent('só quem administra o estabelecimento')
    expect(screen.queryByRole('link', { name: /Novo grupo|^Editar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Excluir/ })).toBeNull()
  })
})

// --- A página do grupo -------------------------------------------------------------

describe('criar um grupo', () => {
  it('nome, como o cliente escolhe e as opções; volta à lista com ele', async () => {
    const enviados = abrir('')
    fireEvent.click(await screen.findByRole('link', { name: 'Opções e adicionais' }))
    fireEvent.click(await screen.findByRole('link', { name: 'Novo grupo' }))

    // O primeiro "Nome" é o do grupo; cada opção tem o seu.
    const [nome] = await screen.findAllByLabelText('Nome')
    escrever(nome as HTMLElement, 'Molhos')
    escrever(screen.getByLabelText('Mínimo'), '0')
    escrever(screen.getByLabelText('Máximo'), '2')
    expect(screen.getByText('Escolha até 2 · opcional')).toBeVisible()
    escrever(opcao(1).getByLabelText('Nome'), 'Barbecue')
    clicar('Adicionar opção')
    escrever(opcao(2).getByLabelText('Nome'), 'Mostarda e mel')
    escrever(opcao(2).getByLabelText('A mais (R$)'), '1,5')
    clicar('Criar grupo')

    expect(await screen.findByText('Grupo “Molhos” criado.')).toHaveAttribute('role', 'status')
    expect(localAtual()).toBe(`${ADMIN}/cardapio/opcoes`)
    expect(await screen.findByRole('heading', { level: 2, name: 'Molhos' })).toBeVisible()
    expect(enviados).toEqual([
      {
        metodo: 'POST',
        caminho: '/option-groups',
        corpo: {
          name: 'Molhos',
          description: null,
          minSelections: 0,
          maxSelections: 2,
          options: [
            { name: 'Barbecue', priceDeltaInCents: 0, isAvailable: true },
            { name: 'Mostarda e mel', priceDeltaInCents: 150, isAvailable: true },
          ],
        },
      },
    ])
  })

  it('um grupo impossível de pedir não é enviado, e o erro diz por quê', async () => {
    const enviados = abrir('/opcoes/novo')
    const [nome] = await screen.findAllByLabelText('Nome')

    escrever(nome as HTMLElement, 'Escolha duas')
    escrever(screen.getByLabelText('Mínimo'), '2')
    escrever(screen.getByLabelText('Máximo'), '2')
    escrever(opcao(1).getByLabelText('Nome'), 'Única')
    clicar('Criar grupo')

    expect(
      await screen.findByText(
        'O grupo pede 2 escolhas, mas tem 1 opção: o produto ficaria impossível de pedir.',
      ),
    ).toBeVisible()
    expect(screen.getByLabelText('Mínimo')).toHaveAttribute('aria-invalid', 'true')
    expect(enviados).toEqual([])
  })

  it('acrescentar a opção que faltava tira o erro na hora', async () => {
    abrir('/opcoes/novo')
    const [nome] = await screen.findAllByLabelText('Nome')
    escrever(nome as HTMLElement, 'Tamanho')
    escrever(screen.getByLabelText('Mínimo'), '1')
    escrever(screen.getByLabelText('Máximo'), '2')
    escrever(opcao(1).getByLabelText('Nome'), 'Pequeno')
    clicar('Criar grupo')
    const ERRO = 'O máximo de escolhas (2) passa do número de opções (1).'
    await screen.findByText(ERRO)

    clicar('Adicionar opção')

    await waitFor(() => {
      expect(screen.queryByText(ERRO)).toBeNull()
    })
  })

  it('criado a partir de um produto, já entra nele e a página volta para o produto', async () => {
    const enviados = abrir('/produtos/p-xsalada')
    fireEvent.click(
      await screen.findByRole('link', { name: 'Criar um grupo novo para este produto' }),
    )

    expect(await screen.findByRole('link', { name: 'Produto' })).toHaveAttribute(
      'href',
      `${ADMIN}/cardapio/produtos/p-xsalada`,
    )
    const [nome] = screen.getAllByLabelText('Nome')
    escrever(nome as HTMLElement, 'Ponto da carne')
    escrever(screen.getByLabelText('Mínimo'), '1')
    escrever(opcao(1).getByLabelText('Nome'), 'Ao ponto')
    clicar('Criar grupo')

    expect(
      await screen.findByText('Grupo “Ponto da carne” criado e adicionado ao produto.'),
    ).toHaveAttribute('role', 'status')
    expect(localAtual()).toBe(`${ADMIN}/cardapio/produtos/p-xsalada`)
    expect(enviados.map((e) => `${e.metodo} ${e.caminho}`)).toEqual([
      'POST /option-groups',
      'PUT /products/p-xsalada/option-groups',
    ])
    // O novo vai no fim, depois dos que o produto já tinha.
    expect(enviados[1]?.corpo).toEqual({ groupIds: ['g-adicionais', 'g-novo-1'] })
    expect(
      await (await opcoesDoProduto()).findByRole('link', { name: 'Ponto da carne' }),
    ).toBeVisible()
  })
})

describe('editar um grupo', () => {
  it('avisa em quais produtos ele está, antes de a pessoa mudar', async () => {
    abrir('/opcoes/g-adicionais')

    expect(await screen.findByRole('note')).toHaveTextContent(
      'Este grupo está em X-Burger e X-Salada. O que você mudar aqui vale para todos eles.',
    )
    expect(screen.getAllByLabelText('Nome')[0]).toHaveValue('Adicionais')
    expect(opcao(1).getByLabelText('A mais (R$)')).toHaveValue('5,00')
    expect(opcao(3).getByLabelText('Disponível')).not.toBeChecked()
  })

  it('muda o preço, a ordem e o que está disponível; manda as opções com os ids', async () => {
    const enviados = abrir('/opcoes/g-adicionais')
    await screen.findByRole('note')

    escrever(opcao(1).getByLabelText('A mais (R$)'), '6')
    fireEvent.click(opcao(3).getByLabelText('Disponível'))
    clicar('Subir a opção 2')
    clicar('Remover a opção 3')
    clicar('Adicionar opção')
    escrever(opcao(3).getByLabelText('Nome'), 'Catupiry')
    escrever(opcao(3).getByLabelText('A mais (R$)'), '4')
    clicar('Salvar alterações')

    expect(await screen.findByText('Grupo salvo.')).toBeVisible()
    expect(enviados[0]).toEqual({
      metodo: 'PUT',
      caminho: '/option-groups/g-adicionais',
      corpo: {
        name: 'Adicionais',
        description: 'Capriche no seu lanche',
        minSelections: 0,
        maxSelections: 2,
        options: [
          { id: 'o-cheddar', name: 'Cheddar', priceDeltaInCents: 400, isAvailable: true },
          { id: 'o-bacon', name: 'Bacon', priceDeltaInCents: 600, isAvailable: true },
          { name: 'Catupiry', priceDeltaInCents: 400, isAvailable: true },
        ],
      },
    })
  })

  it('em uso, não se exclui, e a página diz o que fazer', async () => {
    abrir('/opcoes/g-adicionais')

    expect(await screen.findByRole('button', { name: 'Excluir grupo' })).toBeDisabled()
    expect(screen.getByText(/tire-o desses produtos antes/)).toBeVisible()
  })

  it('sem uso, exclui depois de confirmar e volta à lista', async () => {
    const enviados = abrir('/opcoes/g-retirar')

    await screen.findByRole('button', { name: 'Excluir grupo' })
    clicar('Excluir grupo')
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir grupo' }),
    )

    expect(await screen.findByText('Grupo “Retirar” excluído.')).toHaveAttribute('role', 'status')
    expect(localAtual()).toBe(`${ADMIN}/cardapio/opcoes`)
    expect(enviados).toEqual([
      { metodo: 'DELETE', caminho: '/option-groups/g-retirar', corpo: undefined },
    ])
  })

  it('endereço de um grupo que não existe avisa', async () => {
    abrir('/opcoes/g-nao-existe')

    expect(await screen.findByRole('alert')).toHaveTextContent('Este grupo não existe mais.')
  })
})

// --- As opções do produto ------------------------------------------------------------

describe('as opções na página do produto', () => {
  it('ficam dentro do quadro do produto, depois dos campos e antes do "Salvar"', async () => {
    abrir('/produtos/p-xburger')
    const titulo = await screen.findByRole('heading', { level: 3, name: 'Opções' })

    const quadro = screen.getByRole('heading', { level: 2, name: 'Produto' }).closest('section')
    expect(quadro).toContainElement(titulo)
    const depois = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(depois(screen.getByLabelText('Descrição'), titulo)).toBe(true)
    expect(depois(titulo, salvarOProduto())).toBe(true)
    // Um quadro só: as opções não têm mais seção própria.
    expect(screen.queryByRole('heading', { level: 2, name: 'Opções' })).toBeNull()
  })

  it('mostra os grupos do produto na ordem, com a regra de cada um', async () => {
    abrir('/produtos/p-xburger')
    const opcoes = await opcoesDoProduto()

    expect(
      (await opcoes.findAllByRole('link', { name: /Tamanho|Adicionais/ })).map(
        (l) => l.textContent,
      ),
    ).toEqual(['Tamanho', 'Adicionais'])
    expect(opcoes.getByText('Escolha 1 · obrigatório')).toBeVisible()
    expect(opcoes.getByText('Escolha até 2 · opcional')).toBeVisible()
  })

  it('tirar, mudar a ordem e acrescentar não gravam nada: vão no "Salvar", a lista inteira', async () => {
    const enviados = abrir('/produtos/p-xburger')
    const opcoes = await opcoesDoProduto()
    await opcoes.findByRole('link', { name: 'Tamanho' })
    expect(salvarOProduto()).toBeDisabled()
    const gruposNaTela = () =>
      within(opcoes.getByRole('list'))
        .getAllByRole('link')
        .map((l) => l.textContent)

    // Tirar é vermelho, como remover: sem a cor do botão comum por baixo.
    const tirar = screen.getByRole('button', { name: 'Tirar Tamanho deste produto' })
    expect(tirar).toHaveClass('text-danger')
    expect(tirar).not.toHaveClass('text-primary')
    clicar('Descer o grupo Tamanho')
    expect(gruposNaTela()).toEqual(['Adicionais', 'Tamanho'])
    expect(salvarOProduto()).toBeEnabled()
    clicar('Tirar Tamanho deste produto')
    // Só os que o produto não tem aparecem para escolher — o que acabou de sair volta à lista.
    const seletor = opcoes.getByLabelText('Adicionar um grupo')
    expect(
      within(seletor)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Escolha um grupo',
      'Retirar — Escolha até 2 · opcional',
      'Tamanho — Escolha 1 · obrigatório',
    ])
    escrever(seletor, 'g-retirar')
    clicar('Adicionar o grupo')
    expect(gruposNaTela()).toEqual(['Adicionais', 'Retirar'])
    expect(enviados).toEqual([])

    fireEvent.click(salvarOProduto())

    expect(await screen.findByText('Produto salvo.')).toHaveAttribute('role', 'status')
    // Só as opções mudaram: os campos não são regravados.
    expect(enviados.map((e) => `${e.metodo} ${e.caminho}`)).toEqual([
      'PUT /products/p-xburger/option-groups',
    ])
    expect(enviados[0]?.corpo).toEqual({ groupIds: ['g-adicionais', 'g-retirar'] })
    expect(salvarOProduto()).toBeDisabled()
    expect(gruposNaTela()).toEqual(['Adicionais', 'Retirar'])
  })

  it('campos e opções vão no mesmo "Salvar": primeiro os campos, depois as opções', async () => {
    const enviados = abrir('/produtos/p-xburger')
    await (await opcoesDoProduto()).findByRole('link', { name: 'Tamanho' })

    escrever(screen.getByLabelText('Preço (R$)'), '31,90')
    clicar('Tirar Tamanho deste produto')
    fireEvent.click(salvarOProduto())

    expect(await screen.findByText('Produto salvo.')).toBeVisible()
    expect(enviados.map((e) => `${e.metodo} ${e.caminho}`)).toEqual([
      'PATCH /products/p-xburger',
      'PUT /products/p-xburger/option-groups',
    ])
    expect(enviados[0]?.corpo).toMatchObject({ priceInCents: 3190 })
    expect(enviados[1]?.corpo).toEqual({ groupIds: ['g-adicionais'] })
  })

  it('só os campos mudaram: as opções não são regravadas', async () => {
    const enviados = abrir('/produtos/p-xburger')
    await (await opcoesDoProduto()).findByRole('link', { name: 'Tamanho' })

    escrever(screen.getByLabelText('Preço (R$)'), '31,90')
    fireEvent.click(salvarOProduto())

    expect(await screen.findByText('Produto salvo.')).toBeVisible()
    expect(enviados.map((e) => `${e.metodo} ${e.caminho}`)).toEqual(['PATCH /products/p-xburger'])
  })

  it('desfazer a mudança na mão volta ao que está gravado, e não há o que salvar', async () => {
    abrir('/produtos/p-xburger')
    await (await opcoesDoProduto()).findByRole('link', { name: 'Tamanho' })

    clicar('Descer o grupo Tamanho')
    expect(salvarOProduto()).toBeEnabled()
    clicar('Subir o grupo Tamanho')

    expect(salvarOProduto()).toBeDisabled()
  })

  it('com alteração por salvar, criar um grupo novo espera o "Salvar"', async () => {
    abrir('/produtos/p-xburger')
    const opcoes = await opcoesDoProduto()
    await opcoes.findByRole('link', { name: 'Tamanho' })
    expect(
      opcoes.getByRole('link', { name: 'Criar um grupo novo para este produto' }),
    ).toBeVisible()

    // Criar um grupo leva a outra página: o que não foi salvo aqui se perderia.
    clicar('Tirar Tamanho deste produto')

    expect(opcoes.queryByRole('link', { name: /Criar um grupo novo/ })).toBeNull()
    expect(
      opcoes.getByText('Para criar um grupo novo para este produto, salve antes as alterações.'),
    ).toBeVisible()

    fireEvent.click(salvarOProduto())

    expect(
      await opcoes.findByRole('link', { name: 'Criar um grupo novo para este produto' }),
    ).toBeVisible()
  })

  it('um campo mudado também faz criar um grupo novo esperar', async () => {
    abrir('/produtos/p-xburger')
    const opcoes = await opcoesDoProduto()
    await opcoes.findByRole('link', { name: 'Tamanho' })

    escrever(screen.getByLabelText('Nome'), 'X-Burger duplo')

    await waitFor(() => {
      expect(opcoes.queryByRole('link', { name: /Criar um grupo novo/ })).toBeNull()
    })
  })

  it('produto sem grupos explica que o cliente pede como está', async () => {
    abrir('/produtos/p-refri')

    expect(
      await (
        await opcoesDoProduto()
      ).findByText('Este produto não tem opções: o cliente pede como ele está.'),
    ).toBeVisible()
  })

  it('grupo obrigatório sem opção disponível avisa que o produto fica esgotado', async () => {
    abrir('/produtos/p-xburger', {
      grupos: GRUPOS.map((g) =>
        g.id === 'g-tamanho'
          ? { ...g, options: g.options.map((o) => ({ ...o, isAvailable: false })) }
          : g,
      ),
    })

    expect(
      await (await opcoesDoProduto()).findByText(/o produto aparece esgotado no cardápio/),
    ).toBeVisible()
  })

  it('falha ao gravar as opções avisa, e a mudança continua na tela para tentar de novo', async () => {
    const enviados = abrir('/produtos/p-xburger', {
      forcar: { 'PUT /products/p-xburger/option-groups': { status: 500, corpo: {} } },
    })
    const opcoes = await opcoesDoProduto()
    await opcoes.findByRole('link', { name: 'Tamanho' })

    clicar('Tirar Tamanho deste produto')
    fireEvent.click(salvarOProduto())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível salvar agora. Tente de novo.',
    )
    expect(enviados).toHaveLength(1)
    expect(opcoes.queryByRole('link', { name: 'Tamanho' })).toBeNull()
    expect(salvarOProduto()).toBeEnabled()
  })

  it('campo inválido segura tudo: as opções não vão sem os campos', async () => {
    const enviados = abrir('/produtos/p-xburger')
    await (await opcoesDoProduto()).findByRole('link', { name: 'Tamanho' })

    escrever(screen.getByLabelText('Nome'), '')
    clicar('Tirar Tamanho deste produto')
    fireEvent.click(salvarOProduto())

    await waitFor(() => {
      expect(screen.getByLabelText('Nome')).toBeInvalid()
    })
    expect(enviados).toEqual([])
  })

  it('o produto novo ainda não tem opções: elas vêm depois de criar', async () => {
    abrir('/produtos/novo?categoria=c-lanches')
    await screen.findByLabelText('Nome')

    expect(screen.queryByRole('region', { name: 'Opções' })).toBeNull()
  })

  it('o atendente vê as opções do produto, sem mexer', async () => {
    abrir('/produtos/p-xburger', {}, ATENDENTE)
    await (await opcoesDoProduto()).findByRole('link', { name: 'Tamanho' })

    expect(screen.queryByRole('button', { name: /Tirar|Subir|Descer|Adicionar/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /Criar um grupo novo/ })).toBeNull()
    expect(screen.queryByText(/salve antes as alterações/)).toBeNull()
  })
})

// --- Combos -------------------------------------------------------------------------

describe('combos', () => {
  it('ao criar, escolhe-se combo; a página dele pede os itens', async () => {
    const enviados = abrir('/produtos/novo?categoria=c-lanches')

    fireEvent.click(await screen.findByRole('radio', { name: 'Combo' }))
    escrever(screen.getByLabelText('Nome'), 'Combo da casa')
    escrever(screen.getByLabelText('Preço (R$)'), '35')
    clicar('Criar produto')

    expect(
      await screen.findByText('Combo criado. Agora escolha os itens dele e envie a foto.'),
    ).toHaveAttribute('role', 'status')
    expect(enviados[0]?.corpo).toMatchObject({ type: 'COMBO', name: 'Combo da casa' })
    expect(await screen.findByText(/Sem itens, o combo aparece esgotado/)).toBeVisible()
    // O tipo se escolhe uma vez: na edição, não aparece.
    expect(screen.queryByRole('radio', { name: 'Combo' })).toBeNull()
  })

  it('o produto comum é o que vem marcado', async () => {
    abrir('/produtos/novo')

    expect(await screen.findByRole('radio', { name: 'Produto' })).toBeChecked()
  })

  it('mostra os itens, quanto custariam separados e o preço do combo', async () => {
    abrir('/produtos/p-combo')
    const itens = await secaoDe('Itens do combo')

    expect(await itens.findByRole('group', { name: 'X-Burger' })).toBeVisible()
    expect(itens.getByRole('group', { name: 'Refrigerante' })).toBeVisible()
    expect(itens.getByText(/Separados, os itens custam/)).toHaveTextContent(
      'Separados, os itens custam R$ 31,90. O combo sai por R$ 39,90: não sai mais barato que os itens separados.',
    )
  })

  it('muda a quantidade, acrescenta e tira; salva a lista inteira, na ordem', async () => {
    const enviados = abrir('/produtos/p-combo')
    const itens = await secaoDe('Itens do combo')
    await itens.findByRole('group', { name: 'X-Burger' })

    expect(screen.getByRole('button', { name: 'Salvar itens do combo' })).toBeDisabled()
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
    escrever(seletor, 'p-xsalada')
    clicar('Adicionar ao combo')
    expect(screen.getByText(/X-Salada está esgotado/)).toBeVisible()
    clicar('Tirar Refrigerante do combo')
    clicar('Salvar itens do combo')

    expect(await screen.findByText('Itens do combo salvos.')).toBeVisible()
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

  it('sem nenhum item, não salva e diz por quê', async () => {
    const enviados = abrir('/produtos/p-combo')
    const itens = await secaoDe('Itens do combo')
    await itens.findByRole('group', { name: 'X-Burger' })

    clicar('Tirar X-Burger do combo')
    clicar('Tirar Refrigerante do combo')

    expect(itens.getByText('Escolha ao menos um produto para salvar.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Salvar itens do combo' })).toBeDisabled()
    expect(enviados).toEqual([])
  })

  it('o produto comum não tem itens de combo', async () => {
    abrir('/produtos/p-xburger')
    await (await opcoesDoProduto()).findByRole('link', { name: 'Tamanho' })

    expect(screen.queryByRole('heading', { level: 2, name: 'Itens do combo' })).toBeNull()
  })

  it('o combo tem os itens e também as opções, como qualquer produto', async () => {
    abrir('/produtos/p-combo', {
      produtos: [...PRODUTOS, produto({ id: 'p-outro', name: 'Outro', categoryId: 'c-lanches' })],
    })

    expect(await screen.findByRole('heading', { level: 2, name: 'Itens do combo' })).toBeVisible()
    expect(screen.getByRole('heading', { level: 3, name: 'Opções' })).toBeVisible()
  })

  it('o atendente vê os itens e as quantidades, sem mexer', async () => {
    abrir('/produtos/p-combo', {}, ATENDENTE)
    const itens = await secaoDe('Itens do combo')

    expect(
      within(await itens.findByRole('group', { name: 'X-Burger' })).getByText('1x'),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: /Aumentar|Tirar|Salvar itens/ })).toBeNull()
  })
})
