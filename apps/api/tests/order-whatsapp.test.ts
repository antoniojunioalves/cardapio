import { describe, expect, it } from 'vitest'

import { linkDoWhatsapp, montarMensagem, type DadosDaMensagem } from '../src/orders/whatsapp.js'

function dados(extra: Partial<DadosDaMensagem> = {}): DadosDaMensagem {
  return {
    estabelecimento: 'Lanchonete do Zé',
    numero: 12,
    cliente: { nome: 'Maria', telefone: '5511987654321' },
    itens: [
      {
        quantidade: 2,
        nome: 'X-Salada',
        totalEmCentavos: 6180,
        opcoes: ['Bacon'],
        observacao: 'sem cebola',
        combo: null,
      },
      {
        quantidade: 1,
        nome: 'Combo X-Salada',
        totalEmCentavos: 3990,
        opcoes: [],
        observacao: null,
        combo: [
          { name: 'X-Salada', quantity: 1 },
          { name: 'Refrigerante lata', quantity: 2 },
        ],
      },
    ],
    subtotalEmCentavos: 10170,
    taxaEmCentavos: 500,
    totalEmCentavos: 10670,
    endereco: {
      tipo: 'NOVO',
      postalCode: '01310100',
      street: 'Avenida Paulista',
      number: '1000',
      complement: 'apto 5',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      reference: 'Portão azul',
    },
    regiao: null,
    pagamento: { nome: 'Dinheiro', trocoParaEmCentavos: 15000 },
    observacao: 'Interfone quebrado',
    ...extra,
  }
}

describe('mensagem do WhatsApp', () => {
  it('traz o pedido inteiro, na ordem em que a cozinha lê', () => {
    expect(montarMensagem(dados())).toBe(
      [
        '*Pedido #12* — Lanchonete do Zé',
        '',
        '*Itens*',
        '2x X-Salada — R$ 61,80',
        '   • Bacon',
        '   Obs.: sem cebola',
        '1x Combo X-Salada — R$ 39,90',
        '   (X-Salada + 2x Refrigerante lata)',
        '',
        'Subtotal: R$ 101,70',
        'Entrega: R$ 5,00',
        '*Total: R$ 106,70*',
        '',
        '*Entrega*',
        'Avenida Paulista, 1000, apto 5 — Bela Vista, São Paulo',
        'CEP 01310-100',
        'Referência: Portão azul',
        '',
        '*Pagamento:* Dinheiro — troco para R$ 150,00',
        '*Cliente:* Maria — (11) 98765-4321',
        '*Observações:* Interfone quebrado',
      ].join('\n'),
    )
  })

  it('endereço salvo sai mascarado: sem número, complemento, CEP nem referência', () => {
    const mensagem = montarMensagem(
      dados({
        endereco: {
          tipo: 'SALVO',
          street: 'Rua dos Ipês',
          number: '450',
          neighborhood: 'Jardim Paulista',
        },
      }),
    )

    expect(mensagem).toContain('Rua dos Ipês, 4•• — Jardim Paulista (endereço cadastrado)')
    expect(mensagem).not.toContain('450')
    expect(mensagem).not.toContain('CEP')
  })

  it('retirada não tem endereço nem linha de entrega; região aparece quando há', () => {
    const retirada = montarMensagem(dados({ endereco: null, taxaEmCentavos: 0 }))
    expect(retirada).toContain('*Retirada no local*')
    expect(retirada).not.toContain('Entrega:')

    const comRegiao = montarMensagem(dados({ regiao: 'Centro', taxaEmCentavos: 0 }))
    expect(comRegiao).toContain('Região: Centro')
    expect(comRegiao).toContain('Entrega: grátis')
  })

  it('sem troco e sem observação, as linhas somem', () => {
    const mensagem = montarMensagem(
      dados({ pagamento: { nome: 'Pix', trocoParaEmCentavos: null }, observacao: null }),
    )
    expect(mensagem).toContain('*Pagamento:* Pix\n')
    expect(mensagem).not.toContain('Observações')
  })
})

describe('link do WhatsApp', () => {
  it('abre a conversa com o número do estabelecimento e o texto codificado', () => {
    const link = linkDoWhatsapp('5511999990001', '*Pedido #1* — Zé\nlinha & mais')
    expect(link).toBe(
      'https://wa.me/5511999990001?text=*Pedido%20%231*%20%E2%80%94%20Z%C3%A9%0Alinha%20%26%20mais',
    )
    expect(decodeURIComponent(new URL(link ?? '').searchParams.get('text') ?? '')).toBe(
      '*Pedido #1* — Zé\nlinha & mais',
    )
  })

  it('sem WhatsApp cadastrado, ou número curto demais, não há link', () => {
    expect(linkDoWhatsapp(null, 'x')).toBeNull()
    expect(linkDoWhatsapp('1234', 'x')).toBeNull()
  })
})
