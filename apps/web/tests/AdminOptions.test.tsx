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
import { abrirNoCardapio, ADMIN, ATENDENTE, GRUPOS, PRODUTOS } from './helpers/cardapio-admin'
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
  it('Produtos e Opcionais, cada uma no seu endereço', async () => {
    abrir('/opcionais')
    await screen.findByText('Adicionais')

    const abas = within(screen.getByRole('navigation', { name: 'Cardápio' }))
    expect(abas.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Produtos', `${ADMIN}/cardapio`],
      ['Opcionais', `${ADMIN}/cardapio/opcionais`],
    ])
    expect(abas.getByRole('link', { name: 'Opcionais' })).toHaveAttribute('aria-current', 'page')
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
    abrir('/opcionais')
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
    abrir('/opcionais', { grupos: [] })

    expect(await screen.findByText('Nenhum grupo de opcionais ainda')).toBeVisible()
    clicar('Criar o primeiro grupo')

    expect(await screen.findByRole('dialog', { name: 'Novo grupo de opcionais' })).toBeVisible()
  })

  it('a lixeira de um grupo sem uso pergunta, exclui e a lista avisa', async () => {
    const enviados = abrir('/opcionais')
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
    const enviados = abrir('/opcionais')
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
    abrir('/opcionais', {}, ATENDENTE)
    await screen.findByText('Adicionais')

    expect(screen.getByRole('note')).toHaveTextContent('só quem administra o estabelecimento')
    expect(screen.queryByRole('button', { name: /Novo grupo|^Editar|^Excluir/ })).toBeNull()
  })
})

// --- A janela do grupo ---------------------------------------------------------------

describe('a janela do grupo: criar', () => {
  const abrirNovo = async (api = {}) => {
    const enviados = abrir('/opcionais', api)
    await screen.findByText('Adicionais')
    clicar('Novo grupo')
    const janela = within(await screen.findByRole('dialog', { name: 'Novo grupo de opcionais' }))
    return { enviados, janela }
  }

  it('abre sobre a lista, sem mudar de endereço', async () => {
    const { janela } = await abrirNovo()

    expect(janela.getByLabelText('Nome do grupo')).toHaveValue('')
    expect(localAtual()).toBe(`${ADMIN}/cardapio/opcionais`)
    expect(screen.getByRole('heading', { level: 2, name: 'Adicionais' })).toBeInTheDocument()
  })

  it('nome, como o cliente escolhe e as opções; a lista ganha o grupo e avisa', async () => {
    const { enviados, janela } = await abrirNovo()

    escrever(janela.getByLabelText('Nome do grupo'), 'Molhos')
    escrever(janela.getByLabelText('Mínimo'), '0')
    escrever(janela.getByLabelText('Máximo'), '2')
    expect(janela.getByText('Escolha até 2 · opcional')).toBeVisible()
    escrever(opcao(1).getByLabelText('Nome'), 'Barbecue')
    clicar('Adicionar opção')
    escrever(opcao(2).getByLabelText('Nome'), 'Mostarda e mel')
    escrever(opcao(2).getByLabelText('A mais (R$)'), '1,5')
    // O botão fica no rodapé da janela, fora do formulário, e é ele que o envia.
    const criar = janela.getByRole('button', { name: 'Criar grupo' })
    expect(criar.closest('form')).toBeNull()
    fireEvent.click(criar)

    expect(await screen.findByText('Grupo “Molhos” criado.')).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('dialog')).toBeNull()
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
    const { enviados, janela } = await abrirNovo()

    escrever(janela.getByLabelText('Nome do grupo'), 'Escolha duas')
    escrever(janela.getByLabelText('Mínimo'), '2')
    escrever(janela.getByLabelText('Máximo'), '2')
    escrever(opcao(1).getByLabelText('Nome'), 'Única')
    clicar('Criar grupo')

    expect(
      await janela.findByText(
        'O grupo pede 2 escolhas, mas tem 1 opção: o produto ficaria impossível de pedir.',
      ),
    ).toBeVisible()
    expect(janela.getByLabelText('Mínimo')).toHaveAttribute('aria-invalid', 'true')
    expect(enviados).toEqual([])
  })

  it('acrescentar a opção que faltava tira o erro na hora', async () => {
    const { janela } = await abrirNovo()
    escrever(janela.getByLabelText('Nome do grupo'), 'Tamanho')
    escrever(janela.getByLabelText('Mínimo'), '1')
    escrever(janela.getByLabelText('Máximo'), '2')
    escrever(opcao(1).getByLabelText('Nome'), 'Pequeno')
    clicar('Criar grupo')
    const ERRO = 'O máximo de escolhas (2) passa do número de opções (1).'
    await janela.findByText(ERRO)

    clicar('Adicionar opção')

    await waitFor(() => {
      expect(janela.queryByText(ERRO)).toBeNull()
    })
  })

  it('sem nada digitado, o Esc fecha a janela', async () => {
    const { enviados } = await abrirNovo()

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(enviados).toEqual([])
  })

  it('com algo digitado, fechar pergunta antes; descartar não cria nada', async () => {
    const { enviados, janela } = await abrirNovo()
    escrever(janela.getByLabelText('Nome do grupo'), 'Molhos')

    fireEvent.click(janela.getByRole('button', { name: 'Fechar' }))

    expect(await janela.findByText('O que você digitou não foi salvo.')).toBeVisible()
    // Enquanto pergunta, o botão de criar dá lugar à escolha.
    expect(janela.queryByRole('button', { name: 'Criar grupo' })).toBeNull()
    fireEvent.click(janela.getByRole('button', { name: 'Continuar editando' }))
    expect(janela.getByLabelText('Nome do grupo')).toHaveValue('Molhos')
    expect(janela.getByRole('button', { name: 'Criar grupo' })).toBeVisible()

    fireEvent.click(janela.getByRole('button', { name: 'Fechar' }))
    fireEvent.click(await janela.findByRole('button', { name: 'Descartar' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: 'Molhos' })).toBeNull()
    expect(enviados).toEqual([])
  })

  it('a recusa da API aparece na janela, que continua aberta', async () => {
    const { janela } = await abrirNovo({
      forcar: { 'POST /option-groups': { status: 500, corpo: {} } },
    })
    escrever(janela.getByLabelText('Nome do grupo'), 'Molhos')
    escrever(opcao(1).getByLabelText('Nome'), 'Barbecue')
    clicar('Criar grupo')

    expect(await janela.findByRole('alert')).toHaveTextContent('Não foi possível salvar agora.')
    expect(janela.getByLabelText('Nome do grupo')).toHaveValue('Molhos')
  })
})

describe('a janela do grupo: editar', () => {
  const abrirDe = async (nome: string) => {
    const enviados = abrir('/opcionais')
    await screen.findByText('Adicionais')
    clicar(`Editar o grupo ${nome}`)
    const janela = within(await screen.findByRole('dialog', { name: 'Editar grupo de opcionais' }))
    return { enviados, janela }
  }

  it('avisa em quais produtos ele está, antes de a pessoa mudar', async () => {
    const { janela } = await abrirDe('Adicionais')

    expect(janela.getByRole('note')).toHaveTextContent(
      'Este grupo está em X-Burger e X-Salada. O que você mudar aqui vale para todos eles.',
    )
    expect(janela.getByLabelText('Nome do grupo')).toHaveValue('Adicionais')
    expect(opcao(1).getByLabelText('A mais (R$)')).toHaveValue('5,00')
    expect(opcao(3).getByLabelText('Disponível')).not.toBeChecked()
    expect(janela.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled()
  })

  it('grupo em um produto só, ou em nenhum, não tem o aviso', async () => {
    const { janela } = await abrirDe('Tamanho')

    expect(janela.queryByRole('note')).toBeNull()
  })

  it('muda o preço, a ordem e o que está disponível; manda as opções com os ids', async () => {
    const { enviados, janela } = await abrirDe('Adicionais')

    escrever(opcao(1).getByLabelText('A mais (R$)'), '6')
    fireEvent.click(opcao(3).getByLabelText('Disponível'))
    clicar('Subir a opção 2')
    clicar('Remover a opção 3')
    clicar('Adicionar opção')
    escrever(opcao(3).getByLabelText('Nome'), 'Catupiry')
    escrever(opcao(3).getByLabelText('A mais (R$)'), '4')
    fireEvent.click(janela.getByRole('button', { name: 'Salvar alterações' }))

    expect(await screen.findByText('Grupo “Adicionais” salvo.')).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('dialog')).toBeNull()
    // A lista já mostra o que mudou.
    expect(
      cartaoDoGrupo('Adicionais').getByText(
        'Cheddar (+R$ 4,00), Bacon (+R$ 6,00), Catupiry (+R$ 4,00)',
      ),
    ).toBeVisible()
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
})
