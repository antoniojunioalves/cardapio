import { beforeEach, describe, expect, it } from 'vitest'

import { useCarrinhoStore, type NovoItem } from '../src/features/cart/store'

const ZE = 'lanchonete-do-ze'
const PIZZARIA = 'pizzaria-da-esquina'

const novo = (extra: Partial<NovoItem> = {}): NovoItem => ({
  productId: 'x-salada',
  nome: 'X-Salada',
  selecao: { adicionais: ['bacon', 'cheddar'] },
  quantidade: 1,
  observacao: '',
  ...extra,
})

const store = () => useCarrinhoStore.getState()
const itens = (slug: string) => store().carrinhos[slug] ?? []

beforeEach(() => {
  localStorage.clear()
  useCarrinhoStore.setState({ carrinhos: {} })
})

describe('carrinho no navegador', () => {
  it('o mesmo produto com as mesmas escolhas soma quantidade', () => {
    store().adicionar(ZE, novo({ quantidade: 2 }))
    store().adicionar(ZE, novo({ selecao: { adicionais: ['cheddar', 'bacon'] } }))

    expect(itens(ZE)).toHaveLength(1)
    expect(itens(ZE)[0]?.quantidade).toBe(3)
  })

  it('escolha ou observação diferente vira outra linha', () => {
    store().adicionar(ZE, novo())
    store().adicionar(ZE, novo({ selecao: { adicionais: ['bacon'] } }))
    store().adicionar(ZE, novo({ observacao: 'sem cebola' }))

    expect(itens(ZE)).toHaveLength(3)
  })

  it('observação com espaço sobrando é a mesma observação', () => {
    store().adicionar(ZE, novo({ observacao: 'sem cebola' }))
    store().adicionar(ZE, novo({ observacao: '  sem cebola ' }))

    expect(itens(ZE)).toHaveLength(1)
  })

  it('a quantidade para no máximo', () => {
    store().adicionar(ZE, novo({ quantidade: 40 }))
    store().adicionar(ZE, novo({ quantidade: 40 }))
    expect(itens(ZE)[0]?.quantidade).toBe(50)
  })

  it('cada estabelecimento tem o seu carrinho', () => {
    store().adicionar(ZE, novo())
    store().adicionar(PIZZARIA, novo({ productId: 'margherita', nome: 'Margherita' }))
    store().esvaziar(ZE)

    expect(itens(ZE)).toEqual([])
    expect(itens(PIZZARIA).map((i) => i.nome)).toEqual(['Margherita'])
  })

  it('quantidade zero remove a linha', () => {
    store().adicionar(ZE, novo())
    const id = itens(ZE)[0]?.id ?? ''

    store().alterarQuantidade(ZE, id, 4)
    expect(itens(ZE)[0]?.quantidade).toBe(4)

    store().alterarQuantidade(ZE, id, 0)
    expect(store().carrinhos).toEqual({})
  })

  it('fica guardado no localStorage e volta de lá', async () => {
    store().adicionar(ZE, novo({ quantidade: 2 }))
    const guardado = localStorage.getItem('carrinho') ?? ''
    expect(guardado).toContain('x-salada')

    // Simula a recarga: a memória zera (e a store grava o vazio), o que
    // estava no navegador volta, e a store lê de novo.
    useCarrinhoStore.setState({ carrinhos: {} })
    localStorage.setItem('carrinho', guardado)
    await useCarrinhoStore.persist.rehydrate()

    expect(itens(ZE)[0]?.quantidade).toBe(2)
  })

  it('o que está guardado passa pela limpeza ao voltar', async () => {
    localStorage.setItem(
      'carrinho',
      JSON.stringify({
        state: {
          carrinhos: {
            [ZE]: [
              { id: 'a', productId: 'p' },
              { ...novo(), id: 'b' },
            ],
          },
        },
        version: 1,
      }),
    )

    await useCarrinhoStore.persist.rehydrate()

    expect(itens(ZE).map((i) => i.id)).toEqual(['b'])
  })

  it('JSON corrompido não derruba a página', async () => {
    localStorage.setItem('carrinho', '{corrompido')

    await useCarrinhoStore.persist.rehydrate()
    expect(store().carrinhos).toEqual({})
  })
})
