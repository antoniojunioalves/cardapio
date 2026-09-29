import type { NovoPedido } from '@repo/shared'
import { describe, expect, it } from 'vitest'

import { calcularPedido } from '../src/orders/pricing.js'
import { problemaDaTransicao } from '../src/orders/status.js'
import type { CardapioPublico, ProdutoPublico } from '../src/public-menu/service.js'

let sequencia = 0
const id = () => `00000000-0000-7000-8000-${String(++sequencia).padStart(12, '0')}`

const PIX = id()
const DINHEIRO = id()
const CENTRO = id()
const TAMANHO = id()
const MEDIA = id()
const GRANDE = id()
const FAMILIA = id()
const ADICIONAIS = id()
const BACON = id()
const CHEDDAR = id()
const OVO = id()

function produto(extra: Partial<ProdutoPublico>): ProdutoPublico {
  return {
    id: id(),
    type: 'SIMPLE',
    name: 'Produto',
    description: null,
    priceInCents: 1000,
    imageUrl: null,
    isAvailable: true,
    optionGroups: [],
    combo: null,
    ...extra,
  }
}

const pizza = produto({
  name: 'Pizza',
  priceInCents: 4000,
  optionGroups: [
    {
      id: TAMANHO,
      name: 'Tamanho',
      description: null,
      minSelections: 1,
      maxSelections: 1,
      isRequired: true,
      options: [
        { id: MEDIA, name: 'Média', priceDeltaInCents: 0, isAvailable: true },
        { id: GRANDE, name: 'Grande', priceDeltaInCents: 1000, isAvailable: true },
        { id: FAMILIA, name: 'Família', priceDeltaInCents: 2000, isAvailable: false },
      ],
    },
    {
      id: ADICIONAIS,
      name: 'Adicionais',
      description: null,
      minSelections: 0,
      maxSelections: 2,
      isRequired: false,
      options: [
        { id: BACON, name: 'Bacon', priceDeltaInCents: 500, isAvailable: true },
        { id: CHEDDAR, name: 'Cheddar', priceDeltaInCents: 400, isAvailable: true },
        { id: OVO, name: 'Ovo', priceDeltaInCents: 300, isAvailable: true },
      ],
    },
  ],
})
const refri = produto({ name: 'Refrigerante', priceInCents: 600 })
const esgotado = produto({ name: 'X-Bacon', isAvailable: false })
const combo = produto({
  type: 'COMBO',
  name: 'Combo',
  priceInCents: 3990,
  combo: { items: [{ name: 'X-Salada', quantity: 1 }], precoAvulsoEmCentavos: 4690 },
})

function cardapio(extra: Partial<CardapioPublico> = {}): CardapioPublico {
  return {
    establishment: {
      slug: 'pizzaria',
      name: 'Pizzaria',
      description: null,
      logoUrl: null,
      coverUrl: null,
      timezone: 'America/Sao_Paulo',
      whatsappPhone: null,
      contactPhone: null,
      address: null,
      prepTimeMinMinutes: null,
      prepTimeMaxMinutes: null,
      minimumOrderInCents: 2000,
    },
    status: { aberto: true, fechaAs: '23:00:00' },
    hours: [],
    delivery: {
      deliveryEnabled: true,
      pickupEnabled: true,
      feeMode: 'FIXED',
      fixedFeeInCents: 500,
      regions: [],
      estimatedMinMinutes: null,
      estimatedMaxMinutes: null,
    },
    paymentMethods: [
      { id: PIX, code: 'PIX', name: 'Pix', kind: 'PIX' },
      { id: DINHEIRO, code: 'CASH', name: 'Dinheiro', kind: 'CASH' },
    ],
    categories: [
      {
        id: id(),
        name: 'Tudo',
        description: null,
        imageUrl: null,
        products: [pizza, refri, esgotado, combo],
      },
    ],
    ...extra,
  }
}

const porRegiao = (): CardapioPublico => {
  const c = cardapio()
  c.delivery = {
    ...c.delivery,
    feeMode: 'BY_REGION',
    fixedFeeInCents: null,
    regions: [{ id: CENTRO, name: 'Centro', feeInCents: 700 }],
  }
  return c
}

function pedido(extra: Partial<NovoPedido> = {}): NovoPedido {
  return {
    idempotencyKey: id(),
    customer: { phone: '5511987654321', name: 'Maria' },
    fulfillment: 'DELIVERY',
    address: null,
    deliveryRegionId: null,
    paymentMethodId: PIX,
    changeForInCents: null,
    notes: null,
    items: [{ productId: pizza.id, quantity: 1, notes: null, options: { [TAMANHO]: [MEDIA] } }],
    expectedTotalInCents: 0,
    ...extra,
  }
}

function problemas(resultado: ReturnType<typeof calcularPedido>) {
  return resultado.ok ? [] : resultado.problemas.map((p) => p.tipo)
}

describe('cálculo do pedido', () => {
  it('soma preço base, acréscimos, quantidade e taxa', () => {
    const resultado = calcularPedido(
      cardapio(),
      pedido({
        items: [
          {
            productId: pizza.id,
            quantity: 2,
            notes: 'bem assada',
            options: { [TAMANHO]: [GRANDE], [ADICIONAIS]: [CHEDDAR, BACON] },
          },
          { productId: refri.id, quantity: 3, notes: null, options: {} },
        ],
      }),
    )

    if (!resultado.ok) throw new Error(JSON.stringify(resultado.problemas))
    const [p, r] = resultado.pedido.itens
    // (40,00 + 10,00 + 5,00 + 4,00) × 2
    expect(p?.unitarioEmCentavos).toBe(5900)
    expect(p?.totalEmCentavos).toBe(11800)
    // Na ordem do produto, não na ordem em que foram tocadas.
    expect(p?.opcoes.map((o) => o.opcao)).toEqual(['Grande', 'Bacon', 'Cheddar'])
    expect(r?.totalEmCentavos).toBe(1800)
    expect(resultado.pedido.subtotalEmCentavos).toBe(13600)
    expect(resultado.pedido.taxaEmCentavos).toBe(500)
    expect(resultado.pedido.totalEmCentavos).toBe(14100)
  })

  it('combo sai pelo preço do combo', () => {
    const resultado = calcularPedido(
      cardapio(),
      pedido({ items: [{ productId: combo.id, quantity: 1, notes: null, options: {} }] }),
    )
    expect(resultado.ok && resultado.pedido.subtotalEmCentavos).toBe(3990)
  })

  it('retirada não cobra taxa', () => {
    const resultado = calcularPedido(cardapio(), pedido({ fulfillment: 'PICKUP' }))
    expect(resultado.ok && resultado.pedido.totalEmCentavos).toBe(4000)
  })

  it('entrega por região cobra a taxa da região; região inexistente é recusada', () => {
    const ok = calcularPedido(porRegiao(), pedido({ deliveryRegionId: CENTRO }))
    expect(ok.ok && ok.pedido.taxaEmCentavos).toBe(700)
    expect(ok.ok && ok.pedido.regiao?.name).toBe('Centro')

    expect(problemas(calcularPedido(porRegiao(), pedido({ deliveryRegionId: id() })))).toEqual([
      'REGIAO_INVALIDA',
    ])
    expect(problemas(calcularPedido(porRegiao(), pedido()))).toEqual(['REGIAO_INVALIDA'])
  })

  it('fechado ou pausado recusa, com mensagem diferente', () => {
    const fechado = calcularPedido(
      cardapio({ status: { aberto: false, motivo: 'FORA_DO_HORARIO' } }),
      pedido(),
    )
    const pausado = calcularPedido(
      cardapio({ status: { aberto: false, motivo: 'PAUSADO' } }),
      pedido(),
    )

    expect(problemas(fechado)).toEqual(['ESTABELECIMENTO_FECHADO'])
    expect(!fechado.ok && fechado.problemas[0]?.mensagem).toBe(
      'O estabelecimento está fechado agora.',
    )
    expect(!pausado.ok && pausado.problemas[0]?.mensagem).toContain('pausou os pedidos')
  })

  it('modalidade desligada é recusada', () => {
    const c = cardapio()
    c.delivery = { ...c.delivery, pickupEnabled: false }
    expect(problemas(calcularPedido(c, pedido({ fulfillment: 'PICKUP' })))).toEqual([
      'MODALIDADE_INDISPONIVEL',
    ])
  })

  it('produto inexistente, de outro estabelecimento ou esgotado é recusado, apontando o item', () => {
    const resultado = calcularPedido(
      cardapio(),
      pedido({
        items: [
          { productId: pizza.id, quantity: 1, notes: null, options: { [TAMANHO]: [MEDIA] } },
          { productId: id(), quantity: 1, notes: null, options: {} },
          { productId: esgotado.id, quantity: 1, notes: null, options: {} },
        ],
      }),
    )

    expect(!resultado.ok && resultado.problemas).toEqual([
      { tipo: 'PRODUTO_INDISPONIVEL', itemIndex: 1, mensagem: 'Um dos produtos saiu do cardápio.' },
      {
        tipo: 'PRODUTO_INDISPONIVEL',
        itemIndex: 2,
        mensagem: 'X-Bacon não está disponível agora.',
      },
    ])
  })

  it('opções: obrigatória faltando, acima do máximo, esgotada, repetida, de outro grupo', () => {
    const com = (options: Record<string, string[]>) =>
      calcularPedido(
        cardapio(),
        pedido({ items: [{ productId: pizza.id, quantity: 1, notes: null, options }] }),
      )
    const mensagem = (r: ReturnType<typeof calcularPedido>) =>
      !r.ok ? r.problemas[0]?.mensagem : null

    expect(mensagem(com({}))).toBe('Escolha tamanho em Pizza.')
    expect(mensagem(com({ [TAMANHO]: [MEDIA, GRANDE] }))).toContain('aceita no máximo 1')
    expect(mensagem(com({ [TAMANHO]: [MEDIA], [ADICIONAIS]: [BACON, CHEDDAR, OVO] }))).toContain(
      'aceita no máximo 2',
    )
    expect(mensagem(com({ [TAMANHO]: [FAMILIA] }))).toBe(
      'Família acabou. Escolha outra opção em Pizza.',
    )
    expect(mensagem(com({ [TAMANHO]: [MEDIA], [ADICIONAIS]: [BACON, BACON] }))).toContain(
      'mais de uma vez',
    )
    // Opção de um grupo enviada sob outro grupo: não vale.
    expect(mensagem(com({ [TAMANHO]: [BACON] }))).toContain('não valem mais')
    expect(mensagem(com({ [TAMANHO]: [MEDIA], [id()]: [BACON] }))).toContain('não valem mais')
    // Produto sem grupos não aceita opções inventadas.
    const refriComOpcao = calcularPedido(
      cardapio(),
      pedido({
        items: [{ productId: refri.id, quantity: 4, notes: null, options: { [TAMANHO]: [MEDIA] } }],
      }),
    )
    expect(problemas(refriComOpcao)).toEqual(['OPCOES_INVALIDAS'])
  })

  it('abaixo do mínimo diz quanto falta', () => {
    const resultado = calcularPedido(
      cardapio(),
      pedido({ items: [{ productId: refri.id, quantity: 1, notes: null, options: {} }] }),
    )
    expect(!resultado.ok && resultado.problemas[0]?.mensagem.replace(/\s/g, ' ')).toBe(
      'O pedido mínimo é de R$ 20,00; faltam R$ 14,00.',
    )
  })

  it('forma de pagamento não aceita e troco inválido são recusados', () => {
    expect(problemas(calcularPedido(cardapio(), pedido({ paymentMethodId: id() })))).toEqual([
      'PAGAMENTO_INVALIDO',
    ])
    expect(problemas(calcularPedido(cardapio(), pedido({ changeForInCents: 5000 })))).toEqual([
      'TROCO_INVALIDO',
    ])
    expect(
      problemas(
        calcularPedido(cardapio(), pedido({ paymentMethodId: DINHEIRO, changeForInCents: 4000 })),
      ),
    ).toEqual(['TROCO_INVALIDO'])

    const ok = calcularPedido(
      cardapio(),
      pedido({ paymentMethodId: DINHEIRO, changeForInCents: 5000 }),
    )
    expect(ok.ok && ok.pedido.trocoParaEmCentavos).toBe(5000)
  })

  it('devolve todos os problemas de uma vez', () => {
    const resultado = calcularPedido(
      cardapio({ status: { aberto: false, motivo: 'PAUSADO' } }),
      pedido({
        items: [{ productId: esgotado.id, quantity: 1, notes: null, options: {} }],
        paymentMethodId: id(),
      }),
    )
    expect(problemas(resultado)).toEqual([
      'ESTABELECIMENTO_FECHADO',
      'PRODUTO_INDISPONIVEL',
      'PAGAMENTO_INVALIDO',
    ])
  })
})

describe('status do pedido', () => {
  it('avança, podendo pular etapas', () => {
    expect(problemaDaTransicao('RECEIVED', 'ACCEPTED', 'DELIVERY')).toBeNull()
    expect(problemaDaTransicao('RECEIVED', 'PREPARING', 'PICKUP')).toBeNull()
    expect(problemaDaTransicao('READY', 'COMPLETED', 'PICKUP')).toBeNull()
    expect(problemaDaTransicao('READY', 'OUT_FOR_DELIVERY', 'DELIVERY')).toBeNull()
  })

  it('nunca volta, e não repete', () => {
    expect(problemaDaTransicao('PREPARING', 'ACCEPTED', 'DELIVERY')).toBe('NAO_AVANCA')
    expect(problemaDaTransicao('PREPARING', 'PREPARING', 'DELIVERY')).toBe('MESMO_STATUS')
  })

  it('"saiu para entrega" só em pedido de entrega', () => {
    expect(problemaDaTransicao('READY', 'OUT_FOR_DELIVERY', 'PICKUP')).toBe('SO_PARA_ENTREGA')
  })

  it('cancela de qualquer status não final; final não muda', () => {
    expect(problemaDaTransicao('OUT_FOR_DELIVERY', 'CANCELLED', 'DELIVERY')).toBeNull()
    expect(problemaDaTransicao('COMPLETED', 'CANCELLED', 'DELIVERY')).toBe('STATUS_FINAL')
    expect(problemaDaTransicao('CANCELLED', 'RECEIVED', 'DELIVERY')).toBe('STATUS_FINAL')
  })
})
