import { describe, expect, it } from 'vitest'

import {
  descreverItensDoCombo,
  descreverStatus,
  economiaDoCombo,
  filtrarCardapio,
  formatarEndereco,
  horariosPorDia,
  precoDoCartao,
  resumoDaEntrega,
} from '../src/features/menu/presentation'
import type { EntregaPublica } from '../src/features/menu/types'
import { formatarPreco } from '../src/utils/money'
import { normalizarParaBusca } from '../src/utils/text'
import { cardapioDoZe, produto } from './helpers/cardapio'

/** O `Intl` separa `R$` do valor com espaço não separável. */
const comEspaco = (texto: string) => texto.replace(/\s/g, ' ')

describe('formatação de dinheiro', () => {
  it('centavos inteiros viram reais', () => {
    expect(comEspaco(formatarPreco(2590))).toBe('R$ 25,90')
    expect(comEspaco(formatarPreco(0))).toBe('R$ 0,00')
    expect(comEspaco(formatarPreco(123456))).toBe('R$ 1.234,56')
  })
})

describe('busca', () => {
  it('ignora acento, maiúscula e espaço nas pontas', () => {
    expect(normalizarParaBusca('  Açaí ')).toBe('acai')
  })

  it('filtra por nome e descrição, e some com a categoria sem resultado', () => {
    const { categories } = cardapioDoZe()

    expect(filtrarCardapio(categories, 'acai').map((c) => c.name)).toEqual(['Bebidas'])
    expect(
      filtrarCardapio(categories, 'alface').flatMap((c) => c.products.map((p) => p.name)),
    ).toEqual(['X-Salada'])
  })

  it('busca vazia devolve o cardápio inteiro', () => {
    const { categories } = cardapioDoZe()
    expect(filtrarCardapio(categories, '   ')).toHaveLength(categories.length)
  })
})

describe('status do estabelecimento', () => {
  it('aberto mostra quando fecha', () => {
    expect(descreverStatus({ aberto: true, fechaAs: '02:00:00' })).toEqual({
      aberto: true,
      titulo: 'Aberto agora',
      detalhe: 'Fecha às 02:00',
    })
  })

  it('fechado diz quando abre: hoje, amanhã ou o dia da semana', () => {
    const fechado = (emDias: number, dayOfWeek = 5) =>
      descreverStatus({
        aberto: false,
        motivo: 'FORA_DO_HORARIO',
        proximaAbertura: { dayOfWeek, opensAt: '18:00:00', emDias },
      }).detalhe

    expect(fechado(0)).toBe('Abre hoje às 18:00')
    expect(fechado(1)).toBe('Abre amanhã às 18:00')
    expect(fechado(3, 5)).toBe('Abre sexta às 18:00')
  })

  it('pausa manual explica que os pedidos foram pausados', () => {
    const status = descreverStatus({ aberto: false, motivo: 'PAUSADO' })
    expect(status.titulo).toBe('Fechado no momento')
    expect(status.detalhe).toContain('pausou os pedidos')
  })

  it('parado por falta de pedidos disponíveis no plano: texto neutro, sem citar o plano', () => {
    const status = descreverStatus({ aberto: false, motivo: 'NAO_RECEBENDO' })
    expect(status).toEqual({
      aberto: false,
      titulo: 'Fechado no momento',
      detalhe: 'O estabelecimento não está recebendo pedidos pela internet agora.',
    })
    expect(JSON.stringify(status).toLowerCase()).not.toMatch(/plano|limite/)
  })

  it('sem horário cadastrado diz só "Fechado"', () => {
    expect(descreverStatus({ aberto: false, motivo: 'SEM_HORARIO_CADASTRADO' })).toEqual({
      aberto: false,
      titulo: 'Fechado',
      detalhe: null,
    })
  })
})

describe('resumo da entrega', () => {
  const entrega = (extra: Partial<EntregaPublica> = {}): EntregaPublica => ({
    deliveryEnabled: true,
    pickupEnabled: false,
    feeMode: 'FIXED',
    fixedFeeInCents: 500,
    regions: [],
    estimatedMinMinutes: null,
    estimatedMaxMinutes: null,
    ...extra,
  })

  it('taxa fixa, tempo, pedido mínimo e retirada', () => {
    const frases = resumoDaEntrega(
      entrega({ pickupEnabled: true, estimatedMinMinutes: 30, estimatedMaxMinutes: 60 }),
      2000,
    ).map(comEspaco)

    expect(frases).toEqual([
      'Entrega R$ 5,00',
      '30–60 min',
      'Pedido mínimo R$ 20,00',
      'Retirada no local',
    ])
  })

  it('taxa zero é entrega grátis', () => {
    expect(resumoDaEntrega(entrega({ fixedFeeInCents: 0 }), 0)).toEqual(['Entrega grátis'])
  })

  it('por região mostra a menor taxa', () => {
    const frases = resumoDaEntrega(
      entrega({
        feeMode: 'BY_REGION',
        fixedFeeInCents: null,
        regions: [
          { id: 'a', name: 'Centro', feeInCents: 700 },
          { id: 'b', name: 'Vila', feeInCents: 400 },
        ],
      }),
      0,
    ).map(comEspaco)

    expect(frases).toEqual(['Entrega a partir de R$ 4,00'])
  })

  it('só retirada quando não há entrega', () => {
    expect(resumoDaEntrega(entrega({ deliveryEnabled: false, pickupEnabled: true }), 0)).toEqual([
      'Somente retirada no local',
    ])
  })
})

describe('cartão de produto', () => {
  it('"a partir de" quando um grupo obrigatório tem opção mais cara', () => {
    const pizza = produto({
      priceInCents: 4000,
      optionGroups: [
        {
          id: 'g',
          name: 'Tamanho',
          description: null,
          minSelections: 1,
          maxSelections: 1,
          isRequired: true,
          options: [
            { id: 'o1', name: 'Média', priceDeltaInCents: 0, isAvailable: true },
            { id: 'o2', name: 'Grande', priceDeltaInCents: 1000, isAvailable: true },
          ],
        },
      ],
    })

    expect(comEspaco(precoDoCartao(pizza))).toBe('a partir de R$ 40,00')
  })

  it('adicional opcional não muda o preço exibido', () => {
    const lanche = produto({
      priceInCents: 2590,
      optionGroups: [
        {
          id: 'g',
          name: 'Adicionais',
          description: null,
          minSelections: 0,
          maxSelections: 3,
          isRequired: false,
          options: [{ id: 'o', name: 'Bacon', priceDeltaInCents: 500, isAvailable: true }],
        },
      ],
    })

    expect(comEspaco(precoDoCartao(lanche))).toBe('R$ 25,90')
  })

  it('combo mostra os itens e a economia', () => {
    const combo = cardapioDoZe().categories[1]?.products[0]
    if (!combo) throw new Error('combo ausente no fixture')

    expect(descreverItensDoCombo(combo)).toBe('X-Salada + Batata frita + Refrigerante lata')
    expect(economiaDoCombo(combo)).toBe(700)
  })

  it('combo mais caro que os itens avulsos não anuncia economia', () => {
    const combo = produto({
      type: 'COMBO',
      priceInCents: 5000,
      combo: { items: [{ name: 'X', quantity: 2 }], precoAvulsoEmCentavos: 4000 },
    })

    expect(economiaDoCombo(combo)).toBeNull()
    expect(descreverItensDoCombo(combo)).toBe('2x X')
  })
})

describe('informações do estabelecimento', () => {
  it('horários agrupados de segunda a domingo', () => {
    const dias = horariosPorDia([
      { dayOfWeek: 0, opensAt: '11:00:00', closesAt: '15:00:00' },
      { dayOfWeek: 2, opensAt: '18:00:00', closesAt: '02:00:00' },
    ])

    expect(dias[0]).toEqual({ dia: 'segunda', intervalos: [] })
    expect(dias[1]).toEqual({ dia: 'terça', intervalos: ['18:00 às 02:00'] })
    expect(dias[6]).toEqual({ dia: 'domingo', intervalos: ['11:00 às 15:00'] })
  })

  it('endereço numa linha', () => {
    expect(formatarEndereco(cardapioDoZe().establishment.address)).toBe(
      'Rua das Flores, 123 — Centro, São Paulo/SP',
    )
    expect(formatarEndereco(null)).toBeNull()
  })
})
