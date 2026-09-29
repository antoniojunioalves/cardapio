import { describe, expect, it } from 'vitest'

import { resolverCarrinho, resumirCarrinho, type ItemDoCarrinho } from '../src/features/cart/cart'
import {
  VALORES_INICIAIS,
  criarSchemaDoCheckout,
  impedimentosDoPedido,
  modalidadesDisponiveis,
  taxaDeEntrega,
  type ValoresDoCheckout,
} from '../src/features/checkout/checkout'
import type { CardapioPublico, EntregaPublica } from '../src/features/menu/types'
import { lerReais } from '../src/utils/money'
import { cardapioDoZe, produtoDoFixture } from './helpers/cardapio'

const cardapio = cardapioDoZe()
const pix = cardapio.paymentMethods.find((f) => f.kind === 'PIX')?.id ?? ''
const dinheiro = cardapio.paymentMethods.find((f) => f.kind === 'CASH')?.id ?? ''

const porRegiao = (): CardapioPublico => ({
  ...cardapio,
  delivery: {
    ...cardapio.delivery,
    feeMode: 'BY_REGION',
    fixedFeeInCents: null,
    regions: [
      { id: '00000000-0000-7000-8000-00000000aaaa', name: 'Centro', feeInCents: 500 },
      { id: '00000000-0000-7000-8000-00000000bbbb', name: 'Vila', feeInCents: 900 },
    ],
  },
})

const valores = (extra: Partial<ValoresDoCheckout> = {}): ValoresDoCheckout => ({
  ...VALORES_INICIAIS,
  phone: '(11) 98765-4321',
  name: 'Maria Oliveira',
  fulfillment: 'PICKUP',
  paymentMethodId: pix,
  ...extra,
})

const endereco = {
  street: 'Rua das Flores',
  number: '12',
  neighborhood: 'Centro',
  city: 'São Paulo',
}

const conferir = (
  v: ValoresDoCheckout,
  opcoes: { cardapio?: CardapioPublico; enderecosSalvos?: string[]; total?: number } = {},
) =>
  criarSchemaDoCheckout({
    cardapio: opcoes.cardapio ?? cardapio,
    enderecosSalvos: opcoes.enderecosSalvos ?? [],
    totalEmCentavos: opcoes.total ?? 4100,
  }).safeParse(v)

/** Os erros por campo, com a primeira mensagem de cada um. */
function errosDe(resultado: ReturnType<typeof conferir>): Record<string, string> {
  const erros: Record<string, string> = {}
  for (const issue of resultado.error?.issues ?? []) {
    const campo = String(issue.path[0])
    erros[campo] ??= issue.message
  }
  return erros
}

describe('dinheiro digitado', () => {
  it('lê reais em vários formatos', () => {
    expect(lerReais('50')).toBe(5000)
    expect(lerReais('50,5')).toBe(5050)
    expect(lerReais('R$ 1.234,56')).toBe(123456)
    expect(lerReais('100,00')).toBe(10000)
  })

  it('recusa o que não é valor', () => {
    expect(lerReais('')).toBeNull()
    expect(lerReais('cinquenta')).toBeNull()
    expect(lerReais('50.5')).toBeNull()
    expect(lerReais('-10')).toBeNull()
  })
})

describe('entrega', () => {
  const entrega = (extra: Partial<EntregaPublica>): EntregaPublica => ({
    ...cardapio.delivery,
    ...extra,
  })

  it('só oferece as modalidades habilitadas', () => {
    expect(modalidadesDisponiveis(cardapio.delivery)).toEqual(['DELIVERY', 'PICKUP'])
    expect(modalidadesDisponiveis(entrega({ deliveryEnabled: false }))).toEqual(['PICKUP'])
  })

  it('taxa fixa, retirada sem taxa e região ainda não escolhida', () => {
    expect(taxaDeEntrega(cardapio.delivery, 'DELIVERY', '')).toBe(500)
    expect(taxaDeEntrega(cardapio.delivery, 'PICKUP', '')).toBe(0)
    expect(taxaDeEntrega(cardapio.delivery, '', '')).toBeNull()

    const regioes = porRegiao().delivery
    expect(taxaDeEntrega(regioes, 'DELIVERY', '')).toBeNull()
    expect(taxaDeEntrega(regioes, 'DELIVERY', '00000000-0000-7000-8000-00000000bbbb')).toBe(900)
  })
})

describe('o que impede o pedido', () => {
  const acai = produtoDoFixture(cardapio, 'Açaí na tigela')
  const item = (quantidade: number, productId = acai.id): ItemDoCarrinho => ({
    id: productId,
    productId,
    nome: 'Açaí',
    selecao: {},
    quantidade,
    observacao: '',
  })
  const impedimentos = (itens: ItemDoCarrinho[], c: CardapioPublico = cardapio) => {
    const linhas = resolverCarrinho(itens, c)
    return impedimentosDoPedido(
      c,
      linhas,
      resumirCarrinho(linhas, c.establishment.minimumOrderInCents),
    )
  }

  it('aberto, acima do mínimo e sem problema: nada impede', () => {
    expect(impedimentos([item(2)])).toEqual([])
  })

  it('abaixo do mínimo diz quanto falta', () => {
    expect(
      impedimentos([item(1)])
        .join(' ')
        .replace(/\s/g, ' '),
    ).toContain('Faltam R$ 2,00 para o pedido mínimo de R$ 20,00.')
  })

  it('fechado diz quando abre', () => {
    const fechado: CardapioPublico = {
      ...cardapio,
      status: {
        aberto: false,
        motivo: 'FORA_DO_HORARIO',
        proximaAbertura: { dayOfWeek: 2, opensAt: '18:00:00', emDias: 1 },
      },
    }
    expect(impedimentos([item(2)], fechado)).toEqual([
      'O estabelecimento está fechado agora. Abre amanhã às 18:00',
    ])
  })

  it('item que saiu do cardápio impede', () => {
    expect(impedimentos([item(2), item(1, 'sumiu')])).toContain(
      'Alguns itens do carrinho mudaram. Volte ao carrinho para revisar.',
    )
  })
})

describe('formulário', () => {
  it('formulário vazio mostra todos os erros de uma vez, não só o primeiro', () => {
    const erros = errosDe(conferir({ ...VALORES_INICIAIS }))

    expect(erros).toEqual({
      phone: 'Informe um telefone com DDD, como (11) 98765-4321.',
      name: 'Informe seu nome.',
      fulfillment: 'Escolha entrega ou retirada.',
      paymentMethodId: 'Escolha a forma de pagamento.',
    })
  })

  it('retirada não pede endereço, e o telefone sai normalizado', () => {
    const resultado = conferir(valores())

    expect(resultado.data).toEqual({
      phone: '5511987654321',
      name: 'Maria Oliveira',
      fulfillment: 'PICKUP',
      address: null,
      deliveryRegionId: null,
      paymentMethodId: pix,
      changeForInCents: null,
      notes: null,
    })
  })

  it('entrega com endereço novo exige rua, número e bairro', () => {
    expect(errosDe(conferir(valores({ fulfillment: 'DELIVERY' })))).toEqual({
      street: 'Informe a rua.',
      number: 'Informe o número, ou "s/n".',
      neighborhood: 'Informe o bairro.',
    })

    const resultado = conferir(valores({ fulfillment: 'DELIVERY', ...endereco, complement: ' ' }))
    expect(resultado.data?.address).toEqual({
      newAddress: { ...endereco, complement: null, reference: null },
    })
  })

  it('endereço salvo vai só pelo id, e precisa ser um dos identificados', () => {
    const id = '00000000-0000-7000-8000-0000000000aa'
    const salvo = valores({ fulfillment: 'DELIVERY', savedAddressId: id })

    expect(conferir(salvo, { enderecosSalvos: [id] }).data?.address).toEqual({
      savedAddressId: id,
    })
    expect(errosDe(conferir(salvo, { enderecosSalvos: [] }))).toHaveProperty('savedAddressId')
  })

  it('entrega por região exige uma região do estabelecimento', () => {
    const cardapioPorRegiao = porRegiao()
    const base = valores({ fulfillment: 'DELIVERY', ...endereco })

    expect(errosDe(conferir(base, { cardapio: cardapioPorRegiao }))).toEqual({
      deliveryRegionId: 'Escolha a região de entrega.',
    })
    expect(
      errosDe(
        conferir({ ...base, deliveryRegionId: 'inventada' }, { cardapio: cardapioPorRegiao }),
      ),
    ).toHaveProperty('deliveryRegionId')

    const regiao = '00000000-0000-7000-8000-00000000aaaa'
    expect(
      conferir({ ...base, deliveryRegionId: regiao }, { cardapio: cardapioPorRegiao }).data
        ?.deliveryRegionId,
    ).toBe(regiao)
  })

  it('forma de pagamento que o estabelecimento não aceita é recusada', () => {
    expect(errosDe(conferir(valores({ paymentMethodId: 'cartao-inventado' })))).toEqual({
      paymentMethodId: 'Escolha a forma de pagamento.',
    })
  })

  it('troco só vale para dinheiro, e precisa cobrir o total', () => {
    expect(
      conferir(valores({ paymentMethodId: dinheiro, changeFor: '50' })).data?.changeForInCents,
    ).toBe(5000)
    expect(
      conferir(valores({ paymentMethodId: dinheiro, changeFor: '' })).data?.changeForInCents,
    ).toBeNull()
    expect(
      conferir(valores({ paymentMethodId: pix, changeFor: '50' })).data?.changeForInCents,
    ).toBeNull()

    expect(
      errosDe(
        conferir(valores({ paymentMethodId: dinheiro, changeFor: '30' }), { total: 4100 }),
      ).changeFor?.replace(/\s/g, ' '),
    ).toBe('O troco precisa ser para um valor a partir do total, R$ 41,00.')
    expect(
      errosDe(conferir(valores({ paymentMethodId: dinheiro, changeFor: 'muito' }))).changeFor,
    ).toBe('Informe um valor, como 50,00.')
  })

  it('observação longa demais é recusada', () => {
    expect(errosDe(conferir(valores({ notes: 'a'.repeat(281) })))).toEqual({
      notes: 'Use no máximo 280 caracteres.',
    })
  })
})
