import { describe, expect, it } from 'vitest'

import {
  resolverCarrinho,
  resumirCarrinho,
  sanearCarrinhos,
  type ItemDoCarrinho,
} from '../src/features/cart/cart'
import {
  SELECAO_VAZIA,
  alternarOpcao,
  descreverRegraDoGrupo,
  gruposPendentes,
  mesmaSelecao,
  nomesDasOpcoes,
  precoUnitario,
  problemaDaSelecao,
} from '../src/features/cart/selection'
import type { CardapioPublico, GrupoPublico } from '../src/features/menu/types'
import { cardapioDoZe, grupoDoFixture, opcaoDoFixture, produtoDoFixture } from './helpers/cardapio'

const cardapio = cardapioDoZe()
const xSalada = produtoDoFixture(cardapio, 'X-Salada')
const ponto = grupoDoFixture(xSalada, 'Ponto da carne')
const adicionais = grupoDoFixture(xSalada, 'Adicionais')
const opcao = (grupo: string, nome: string) => opcaoDoFixture(xSalada, grupo, nome)

const grupo = (extra: Partial<GrupoPublico>): GrupoPublico => ({
  ...adicionais,
  ...extra,
})

describe('escolher opções', () => {
  it('grupo obrigatório de uma escolha troca a opção e não deixa desmarcar', () => {
    const aoPonto = alternarOpcao(ponto, SELECAO_VAZIA, opcao('Ponto da carne', 'Ao ponto'))
    const bemPassada = alternarOpcao(ponto, aoPonto, opcao('Ponto da carne', 'Bem passada'))

    expect(bemPassada[ponto.id]).toEqual([opcao('Ponto da carne', 'Bem passada')])
    expect(alternarOpcao(ponto, bemPassada, opcao('Ponto da carne', 'Bem passada'))).toBe(
      bemPassada,
    )
  })

  it('grupo opcional de uma escolha deixa desmarcar', () => {
    const opcional = grupo({ minSelections: 0, maxSelections: 1, isRequired: false })
    const bacon = opcao('Adicionais', 'Bacon')

    const marcado = alternarOpcao(opcional, SELECAO_VAZIA, bacon)
    expect(alternarOpcao(opcional, marcado, bacon)[opcional.id]).toEqual([])
  })

  it('grupo de várias escolhas para no máximo', () => {
    let selecao = alternarOpcao(adicionais, SELECAO_VAZIA, opcao('Adicionais', 'Bacon'))
    selecao = alternarOpcao(adicionais, selecao, opcao('Adicionais', 'Cheddar'))

    const terceira = grupo({
      options: [
        ...adicionais.options,
        { id: 'extra', name: 'Picles', priceDeltaInCents: 0, isAvailable: true },
      ],
    })
    expect(alternarOpcao(terceira, selecao, 'extra')).toBe(selecao)
  })

  it('opção esgotada ou de outro grupo não entra', () => {
    expect(alternarOpcao(adicionais, SELECAO_VAZIA, opcao('Adicionais', 'Ovo'))).toBe(SELECAO_VAZIA)
    expect(alternarOpcao(adicionais, SELECAO_VAZIA, opcao('Ponto da carne', 'Ao ponto'))).toBe(
      SELECAO_VAZIA,
    )
  })

  it('grupo obrigatório sem escolha fica pendente', () => {
    expect(gruposPendentes(xSalada, SELECAO_VAZIA).map((g) => g.name)).toEqual(['Ponto da carne'])
    const escolhido = alternarOpcao(ponto, SELECAO_VAZIA, opcao('Ponto da carne', 'Ao ponto'))
    expect(gruposPendentes(xSalada, escolhido)).toEqual([])
  })

  it('preço soma os acréscimos, e os nomes seguem a ordem dos grupos', () => {
    const selecao = {
      [adicionais.id]: [opcao('Adicionais', 'Cheddar'), opcao('Adicionais', 'Bacon')],
      [ponto.id]: [opcao('Ponto da carne', 'Ao ponto')],
    }

    expect(precoUnitario(xSalada, selecao)).toBe(2590 + 500 + 400)
    expect(nomesDasOpcoes(xSalada, selecao)).toEqual(['Ao ponto', 'Bacon', 'Cheddar'])
  })

  it('a regra do grupo em palavras', () => {
    expect(descreverRegraDoGrupo(ponto)).toBe('Escolha 1')
    expect(descreverRegraDoGrupo(adicionais)).toBe('Escolha até 2')
    expect(descreverRegraDoGrupo(grupo({ minSelections: 1, maxSelections: 3 }))).toBe(
      'Escolha de 1 a 3',
    )
  })

  it('a ordem em que as opções foram tocadas não muda a seleção', () => {
    expect(mesmaSelecao({ a: ['1', '2'], b: [] }, { a: ['2', '1'] })).toBe(true)
    expect(mesmaSelecao({ a: ['1'] }, { a: ['2'] })).toBe(false)
  })
})

describe('seleção guardada contra o cardápio atual', () => {
  const valida = {
    [ponto.id]: [opcao('Ponto da carne', 'Ao ponto')],
    [adicionais.id]: [opcao('Adicionais', 'Bacon')],
  }

  it('seleção válida não tem problema', () => {
    expect(problemaDaSelecao(xSalada, valida)).toBeNull()
  })

  it('opção que esgotou, sumiu ou passou do máximo é indisponível', () => {
    expect(
      problemaDaSelecao(xSalada, { ...valida, [adicionais.id]: [opcao('Adicionais', 'Ovo')] }),
    ).toBe('OPCAO_INDISPONIVEL')
    expect(problemaDaSelecao(xSalada, { ...valida, [adicionais.id]: ['nao-existe'] })).toBe(
      'OPCAO_INDISPONIVEL',
    )
    expect(problemaDaSelecao(xSalada, { ...valida, 'grupo-removido': ['x'] })).toBe(
      'OPCAO_INDISPONIVEL',
    )
    const tres = [opcao('Adicionais', 'Bacon'), opcao('Adicionais', 'Cheddar'), 'x']
    expect(problemaDaSelecao(xSalada, { ...valida, [adicionais.id]: tres })).toBe(
      'OPCAO_INDISPONIVEL',
    )
  })

  it('grupo obrigatório criado depois pede escolha nova', () => {
    expect(problemaDaSelecao(xSalada, { [adicionais.id]: [] })).toBe('ESCOLHA_INCOMPLETA')
  })
})

describe('carrinho', () => {
  const item = (extra: Partial<ItemDoCarrinho>): ItemDoCarrinho => ({
    id: 'i',
    productId: xSalada.id,
    nome: 'X-Salada',
    selecao: { [ponto.id]: [opcao('Ponto da carne', 'Ao ponto')] },
    quantidade: 1,
    observacao: '',
    ...extra,
  })

  it('o preço vem do cardápio atual, não do que foi guardado', () => {
    const maisCaro: CardapioPublico = structuredClone(cardapio)
    const produto = maisCaro.categories[0]?.products[0]
    if (produto) produto.priceInCents = 3000

    const [linha] = resolverCarrinho([item({ quantidade: 2 })], maisCaro)
    expect(linha?.precoUnitarioEmCentavos).toBe(3000)
    expect(linha?.totalEmCentavos).toBe(6000)
    expect(linha?.opcoes).toEqual(['Ao ponto'])
  })

  it('produto que saiu do cardápio ou esgotou vira problema', () => {
    const esgotado = produtoDoFixture(cardapio, 'X-Bacon')
    const linhas = resolverCarrinho(
      [
        item({ id: 'a', productId: 'nao-existe', nome: 'Misto' }),
        item({ id: 'b', productId: esgotado.id, nome: 'X-Bacon', selecao: {} }),
      ],
      cardapio,
    )

    expect(linhas.map((l) => l.problema)).toEqual(['PRODUTO_REMOVIDO', 'PRODUTO_ESGOTADO'])
  })

  it('o subtotal ignora itens com problema, e o indicador conta unidades', () => {
    const linhas = resolverCarrinho(
      [item({ id: 'a', quantidade: 3 }), item({ id: 'b', productId: 'nao-existe' })],
      cardapio,
    )
    const resumo = resumirCarrinho(linhas, 10000)

    expect(resumo).toEqual({
      quantidadeDeItens: 4,
      subtotalEmCentavos: 3 * 2590,
      faltaParaMinimoEmCentavos: 10000 - 3 * 2590,
      temProblema: true,
    })
  })

  it('sem pedido mínimo não falta nada', () => {
    const linhas = resolverCarrinho([item({})], cardapio)
    expect(resumirCarrinho(linhas, 0).faltaParaMinimoEmCentavos).toBe(0)
  })
})

describe('carrinho guardado no navegador', () => {
  const valido = {
    id: 'a',
    productId: 'p',
    nome: 'X-Salada',
    selecao: { g: ['o'] },
    quantidade: 2,
    observacao: 'sem cebola',
  }

  it('aceita o formato esperado', () => {
    expect(sanearCarrinhos({ 'lanchonete-do-ze': [valido] })).toEqual({
      'lanchonete-do-ze': [valido],
    })
  })

  it('descarta item malformado sem levar os outros junto', () => {
    const guardado = {
      'lanchonete-do-ze': [
        valido,
        { ...valido, quantidade: '2' },
        { ...valido, selecao: { g: [1] } },
        null,
        'lixo',
      ],
      'pizzaria-da-esquina': 'não é lista',
    }

    expect(sanearCarrinhos(guardado)).toEqual({ 'lanchonete-do-ze': [valido] })
  })

  it('dado que não é objeto vira carrinho vazio', () => {
    expect(sanearCarrinhos(undefined)).toEqual({})
    expect(sanearCarrinhos('{')).toEqual({})
    expect(sanearCarrinhos([valido])).toEqual({})
  })

  it('quantidade e observação voltam para dentro dos limites', () => {
    const [item] =
      sanearCarrinhos({ x: [{ ...valido, quantidade: 9999, observacao: 'a'.repeat(500) }] }).x ?? []

    expect(item?.quantidade).toBe(50)
    expect(item?.observacao).toHaveLength(140)
    expect(sanearCarrinhos({ x: [{ ...valido, quantidade: -3 }] }).x?.[0]?.quantidade).toBe(1)
  })
})
