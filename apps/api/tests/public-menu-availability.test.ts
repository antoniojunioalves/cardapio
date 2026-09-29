import { describe, expect, it } from 'vitest'

import {
  motivoDeIndisponibilidade,
  podeSerPedido,
  type ProdutoParaDisponibilidade,
} from '../src/public-menu/availability.js'

const simples = (extra: Partial<ProdutoParaDisponibilidade> = {}): ProdutoParaDisponibilidade => ({
  type: 'SIMPLE',
  isAvailable: true,
  groups: [],
  comboItems: [],
  ...extra,
})

const opcoes = (...disponiveis: boolean[]) => disponiveis.map((isAvailable) => ({ isAvailable }))

describe('disponibilidade de um produto no cardápio', () => {
  it('produto disponível e sem grupos pode ser pedido', () => {
    expect(podeSerPedido(simples())).toBe(true)
  })

  it('produto marcado como esgotado não pode', () => {
    expect(motivoDeIndisponibilidade(simples({ isAvailable: false }))).toBe('ESGOTADO')
  })

  it('combo com um componente esgotado não pode — seria vendido com um item a menos', () => {
    const combo = simples({ type: 'COMBO', comboItems: opcoes(true, false) })
    expect(motivoDeIndisponibilidade(combo)).toBe('COMPONENTE_ESGOTADO')
  })

  it('combo sem componentes não pode — a cozinha não saberia o que preparar', () => {
    expect(motivoDeIndisponibilidade(simples({ type: 'COMBO' }))).toBe('COMBO_SEM_ITENS')
  })

  it('combo com todos os componentes disponíveis pode', () => {
    expect(podeSerPedido(simples({ type: 'COMBO', comboItems: opcoes(true, true) }))).toBe(true)
  })

  it('grupo obrigatório sem nenhuma opção disponível torna o produto impossível de pedir', () => {
    const produto = simples({ groups: [{ minSelections: 1, options: opcoes(false, false) }] })
    expect(motivoDeIndisponibilidade(produto)).toBe('OPCOES_OBRIGATORIAS_ESGOTADAS')
  })

  it('grupo que exige duas escolhas com só uma disponível também', () => {
    const produto = simples({ groups: [{ minSelections: 2, options: opcoes(true, false, false) }] })
    expect(podeSerPedido(produto)).toBe(false)
  })

  it('grupo obrigatório com uma opção ainda disponível não bloqueia', () => {
    const produto = simples({ groups: [{ minSelections: 1, options: opcoes(false, true) }] })
    expect(podeSerPedido(produto)).toBe(true)
  })

  it('grupo opcional totalmente esgotado não bloqueia — "acabou o bacon" não tira o lanche', () => {
    const produto = simples({ groups: [{ minSelections: 0, options: opcoes(false, false) }] })
    expect(podeSerPedido(produto)).toBe(true)
  })

  it('o esgotado do próprio produto tem precedência sobre os outros motivos', () => {
    const combo = simples({ type: 'COMBO', isAvailable: false, comboItems: opcoes(false) })
    expect(motivoDeIndisponibilidade(combo)).toBe('ESGOTADO')
  })
})
