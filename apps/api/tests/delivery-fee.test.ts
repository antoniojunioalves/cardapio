import { describe, expect, it } from 'vitest'

import {
  atingePedidoMinimo,
  resolverTaxaDeEntrega,
  temComoReceber,
  type ConfiguracaoDeEntrega,
  type RegiaoDeEntrega,
} from '../src/settings/delivery-fee.js'

const taxaFixa: ConfiguracaoDeEntrega = {
  deliveryEnabled: true,
  pickupEnabled: true,
  feeMode: 'FIXED',
  fixedFeeInCents: 500,
}

const porRegiao: ConfiguracaoDeEntrega = { ...taxaFixa, feeMode: 'BY_REGION', fixedFeeInCents: 0 }

const regioes: RegiaoDeEntrega[] = [
  { id: 'r-centro', name: 'Centro', feeInCents: 500, isActive: true },
  { id: 'r-vila', name: 'Vila Nova', feeInCents: 1000, isActive: true },
  { id: 'r-antiga', name: 'Região desativada', feeInCents: 300, isActive: false },
]

describe('taxa fixa', () => {
  it('cobra o mesmo de todo mundo', () => {
    expect(resolverTaxaDeEntrega({ configuracao: taxaFixa, regioes, tipo: 'DELIVERY' })).toEqual({
      ok: true,
      feeInCents: 500,
    })
  })

  it('aceita taxa zero — entrega grátis é uma configuração válida', () => {
    expect(
      resolverTaxaDeEntrega({
        configuracao: { ...taxaFixa, fixedFeeInCents: 0 },
        regioes: [],
        tipo: 'DELIVERY',
      }),
    ).toEqual({ ok: true, feeInCents: 0 })
  })
})

describe('taxa por região', () => {
  it('cobra conforme a região escolhida', () => {
    expect(
      resolverTaxaDeEntrega({
        configuracao: porRegiao,
        regioes,
        tipo: 'DELIVERY',
        regionId: 'r-vila',
      }),
    ).toEqual({ ok: true, feeInCents: 1000 })
  })

  it('exige a região quando o modo é por região', () => {
    expect(resolverTaxaDeEntrega({ configuracao: porRegiao, regioes, tipo: 'DELIVERY' })).toEqual({
      ok: false,
      motivo: 'REGIAO_OBRIGATORIA',
    })
  })

  it('recusa região inexistente', () => {
    expect(
      resolverTaxaDeEntrega({
        configuracao: porRegiao,
        regioes,
        tipo: 'DELIVERY',
        regionId: 'r-inventada',
      }),
    ).toEqual({ ok: false, motivo: 'REGIAO_INVALIDA' })
  })

  it('trata região desativada como inexistente', () => {
    // Desativar precisa impedir pedidos novos, e não só sumir da lista — senão
    // um cliente com a página aberta continuaria conseguindo escolher.
    expect(
      resolverTaxaDeEntrega({
        configuracao: porRegiao,
        regioes,
        tipo: 'DELIVERY',
        regionId: 'r-antiga',
      }),
    ).toEqual({ ok: false, motivo: 'REGIAO_INVALIDA' })
  })
})

describe('retirada no local', () => {
  it('não tem taxa de entrega', () => {
    expect(resolverTaxaDeEntrega({ configuracao: porRegiao, regioes, tipo: 'PICKUP' })).toEqual({
      ok: true,
      feeInCents: 0,
    })
  })

  it('é recusada quando o estabelecimento não oferece', () => {
    expect(
      resolverTaxaDeEntrega({
        configuracao: { ...taxaFixa, pickupEnabled: false },
        regioes,
        tipo: 'PICKUP',
      }),
    ).toEqual({ ok: false, motivo: 'RETIRADA_INDISPONIVEL' })
  })
})

describe('entrega desabilitada', () => {
  it('recusa pedido de entrega', () => {
    expect(
      resolverTaxaDeEntrega({
        configuracao: { ...taxaFixa, deliveryEnabled: false },
        regioes,
        tipo: 'DELIVERY',
      }),
    ).toEqual({ ok: false, motivo: 'ENTREGA_INDISPONIVEL' })
  })
})

describe('há como o pedido chegar ao cliente?', () => {
  const desligado = { deliveryEnabled: false, pickupEnabled: false, feeMode: 'FIXED' } as const

  it('não, do jeito que o estabelecimento nasce', () => {
    expect(temComoReceber(desligado, 0)).toBe(false)
  })

  it('sim, só com retirada', () => {
    expect(temComoReceber({ ...desligado, pickupEnabled: true }, 0)).toBe(true)
  })

  it('sim, com entrega de taxa fixa — não depende de região', () => {
    expect(temComoReceber({ ...desligado, deliveryEnabled: true }, 0)).toBe(true)
  })

  it('entrega por região só conta com ao menos uma região ativa', () => {
    const porRegiaoSemRetirada = {
      ...desligado,
      deliveryEnabled: true,
      feeMode: 'BY_REGION',
    } as const

    expect(temComoReceber(porRegiaoSemRetirada, 0)).toBe(false)
    expect(temComoReceber(porRegiaoSemRetirada, 1)).toBe(true)
  })

  it('regiões cadastradas não ligam a entrega sozinhas', () => {
    expect(temComoReceber({ ...desligado, feeMode: 'BY_REGION' }, 3)).toBe(false)
  })
})

describe('pedido mínimo', () => {
  it('compara em centavos inteiros, sem margem de ponto flutuante', () => {
    // O caso que motivou centavos: 12,10 x 3 + 7,30 dá 43.599999999999994 em
    // ponto flutuante, e a comparação com 43,60 falharia.
    const subtotal = 1210 * 3 + 730

    expect(subtotal).toBe(4360)
    expect(atingePedidoMinimo(subtotal, 4360)).toBe(true)
  })

  it('recusa abaixo do mínimo', () => {
    expect(atingePedidoMinimo(1999, 2000)).toBe(false)
  })

  it('mínimo zero significa sem mínimo', () => {
    expect(atingePedidoMinimo(0, 0)).toBe(true)
  })
})
