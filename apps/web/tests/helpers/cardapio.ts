import type { CardapioPublico, ProdutoPublico } from '../../src/features/menu/types'

let sequencia = 0
const id = () => `00000000-0000-7000-8000-${String(++sequencia).padStart(12, '0')}`

export function produto(extra: Partial<ProdutoPublico> = {}): ProdutoPublico {
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

/** Um cardápio como a API devolve para a Lanchonete do Zé do seed. */
export function cardapioDoZe(): CardapioPublico {
  return {
    establishment: {
      slug: 'lanchonete-do-ze',
      name: 'Lanchonete do Zé',
      description: 'Os melhores lanches do bairro',
      logoUrl: null,
      coverUrl: null,
      timezone: 'America/Sao_Paulo',
      whatsappPhone: '5511999990000',
      contactPhone: '5511988887777',
      address: {
        street: 'Rua das Flores',
        number: '123',
        complement: null,
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        postalCode: null,
      },
      prepTimeMinMinutes: 20,
      prepTimeMaxMinutes: 40,
      minimumOrderInCents: 2000,
    },
    status: { aberto: true, fechaAs: '02:00:00' },
    hours: [{ dayOfWeek: 2, opensAt: '18:00:00', closesAt: '02:00:00' }],
    delivery: {
      deliveryEnabled: true,
      pickupEnabled: true,
      feeMode: 'FIXED',
      fixedFeeInCents: 500,
      regions: [],
      estimatedMinMinutes: 30,
      estimatedMaxMinutes: 60,
    },
    paymentMethods: [
      { id: id(), code: 'PIX', name: 'Pix', kind: 'PIX' },
      { id: id(), code: 'CASH', name: 'Dinheiro', kind: 'CASH' },
    ],
    categories: [
      {
        id: id(),
        name: 'Hambúrgueres',
        description: null,
        imageUrl: null,
        products: [
          produto({
            name: 'X-Salada',
            description: 'Pão, hambúrguer, alface e tomate',
            priceInCents: 2590,
          }),
          produto({ name: 'X-Bacon', priceInCents: 2990, isAvailable: false }),
        ],
      },
      {
        id: id(),
        name: 'Combos',
        description: null,
        imageUrl: null,
        products: [
          produto({
            type: 'COMBO',
            name: 'Combo X-Salada',
            priceInCents: 3990,
            combo: {
              items: [
                { name: 'X-Salada', quantity: 1 },
                { name: 'Batata frita', quantity: 1 },
                { name: 'Refrigerante lata', quantity: 1 },
              ],
              precoAvulsoEmCentavos: 4690,
            },
          }),
        ],
      },
      {
        id: id(),
        name: 'Bebidas',
        description: null,
        imageUrl: null,
        products: [produto({ name: 'Açaí na tigela', priceInCents: 1800 })],
      },
    ],
  }
}
