import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCarrinhoStore } from '../src/features/cart/store'
import type { CardapioPublico } from '../src/features/menu/types'
import { cardapioDoZe, produtoDoFixture } from './helpers/cardapio'
import { abrir, mockarApiDoCheckout, PEDIDO_CRIADO, type Resposta } from './helpers/pagina'

const ENDERECO_RECENTE = '00000000-0000-7000-8000-0000000000e1'
const ENDERECO_ANTIGO = '00000000-0000-7000-8000-0000000000e2'

const MARIA: Resposta = {
  status: 200,
  corpo: {
    cliente: {
      primeiroNome: 'Maria',
      enderecos: [
        {
          id: ENDERECO_RECENTE,
          resumo: 'Rua dos Ipês, 4•• — Jardim Paulista',
          bairro: 'Jardim Paulista',
        },
        { id: ENDERECO_ANTIGO, resumo: 'Avenida Brasil, 1••• — Centro', bairro: 'Centro' },
      ],
    },
  },
}

/** Põe açaís no carrinho da lanchonete, como se o cliente tivesse escolhido. */
function encherCarrinho(cardapio: CardapioPublico, quantidade = 2) {
  const acai = produtoDoFixture(cardapio, 'Açaí na tigela')
  useCarrinhoStore.setState({
    carrinhos: {
      [cardapio.establishment.slug]: [
        {
          id: 'item-1',
          productId: acai.id,
          nome: acai.name,
          selecao: {},
          quantidade,
          observacao: '',
        },
      ],
    },
  })
}

async function abrirCheckout(
  opcoes: {
    cardapio?: CardapioPublico
    quantidade?: number
    identificacao?: Resposta
    envios?: Resposta[]
  } = {},
) {
  const cardapio = opcoes.cardapio ?? cardapioDoZe()
  encherCarrinho(cardapio, opcoes.quantidade ?? 2)
  const fetch = mockarApiDoCheckout(cardapio, opcoes.identificacao, opcoes.envios)
  abrir(`/${cardapio.establishment.slug}/checkout`)
  await screen.findByRole('heading', { level: 1, name: 'Finalizar pedido' })
  return { fetch, cardapio }
}

const campo = (rotulo: string | RegExp) => screen.getByLabelText(rotulo)
const escrever = (rotulo: string | RegExp, valor: string) => {
  fireEvent.change(campo(rotulo), { target: { value: valor } })
}
const botaoDeEnviar = () => screen.getByRole('button', { name: /^Fazer pedido/ })

function informarTelefone(valor: string) {
  escrever('Telefone (WhatsApp)', valor)
  fireEvent.blur(campo('Telefone (WhatsApp)'))
}

beforeEach(() => {
  localStorage.clear()
  useCarrinhoStore.setState({ carrinhos: {} })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('checkout', () => {
  it('carrinho vazio manda de volta ao cardápio', async () => {
    mockarApiDoCheckout(cardapioDoZe())
    abrir('/lanchonete-do-ze/checkout')

    expect(await screen.findByText('Seu carrinho está vazio.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Ver o cardápio' })).toHaveAttribute(
      'href',
      '/lanchonete-do-ze',
    )
  })

  it('mostra o resumo com a taxa de entrega e o total', async () => {
    await abrirCheckout()
    fireEvent.click(screen.getByRole('radio', { name: 'Entrega' }))

    const resumo = screen.getByRole('region', { name: 'Resumo' })
    expect(within(resumo).getByText('2x Açaí na tigela')).toBeVisible()
    expect(within(resumo).getByText('R$ 5,00')).toBeVisible()
    expect(botaoDeEnviar()).toHaveAccessibleName(/R\$\s41,00/)

    fireEvent.click(screen.getByRole('radio', { name: /Retirada no local/ }))
    expect(within(resumo).getByText('Retirada')).toBeVisible()
    expect(botaoDeEnviar()).toHaveAccessibleName(/R\$\s36,00/)
  })

  it('enviar vazio aponta todos os campos que faltam de uma vez', async () => {
    await abrirCheckout()
    fireEvent.click(botaoDeEnviar())

    expect(
      await screen.findByText('Informe um telefone com DDD, como (11) 98765-4321.'),
    ).toBeVisible()
    expect(screen.getByText('Informe seu nome.')).toBeVisible()
    expect(screen.getByText('Escolha entrega ou retirada.')).toBeVisible()
    expect(screen.getByText('Escolha a forma de pagamento.')).toBeVisible()
    expect(campo('Nome')).toHaveAttribute('aria-invalid', 'true')
    expect(campo('Nome')).toHaveAccessibleDescription('Informe seu nome.')
  })

  it('o foco passar pelo pagamento sem escolher não esconde os erros do endereço', async () => {
    await abrirCheckout()
    fireEvent.click(screen.getByRole('radio', { name: 'Entrega' }))
    fireEvent.blur(screen.getByRole('radio', { name: 'Pix' }))
    fireEvent.click(botaoDeEnviar())

    // Já no primeiro envio: pagamento com a mensagem tratada, e o endereço junto.
    expect(await screen.findByText('Escolha a forma de pagamento.')).toBeVisible()
    expect(screen.getByText('Informe o CEP.')).toBeVisible()
    expect(screen.getByText('Informe a rua.')).toBeVisible()
    expect(screen.getByText('Informe o bairro.')).toBeVisible()
    expect(screen.queryByText(/Invalid input/)).not.toBeInTheDocument()
  })

  it('o telefone ganha máscara enquanto é digitado', async () => {
    await abrirCheckout()
    escrever('Telefone (WhatsApp)', '11987654321')
    expect(campo('Telefone (WhatsApp)')).toHaveValue('(11) 98765-4321')
  })

  it('o CEP é o primeiro campo do endereço, com máscara, e é obrigatório', async () => {
    await abrirCheckout()
    fireEvent.click(screen.getByRole('radio', { name: 'Entrega' }))

    const secao = screen.getByRole('group', { name: 'Endereço de entrega' })
    const campos = within(secao).getAllByRole('textbox')
    expect(campos[0]).toBe(campo('CEP'))

    escrever('CEP', '01310100')
    expect(campo('CEP')).toHaveValue('01310-100')

    escrever('CEP', '')
    fireEvent.click(botaoDeEnviar())
    expect(await screen.findByText('Informe o CEP.')).toBeVisible()
  })

  it('entrega em endereço novo é enviada com o CEP', async () => {
    await abrirCheckout()
    informarTelefone('11912345678')
    escrever('Nome', 'João Souza')
    fireEvent.click(screen.getByRole('radio', { name: 'Entrega' }))
    escrever('CEP', '01310-100')
    escrever('Rua', 'Avenida Paulista')
    escrever('Número', '1000')
    escrever('Bairro', 'Bela Vista')
    fireEvent.click(screen.getByRole('radio', { name: 'Pix' }))
    fireEvent.click(botaoDeEnviar())

    expect(await screen.findByRole('heading', { name: 'Pedido #42 recebido' })).toBeVisible()
  })

  it('pedido completo por retirada é enviado', async () => {
    await abrirCheckout()
    informarTelefone('11987654321')
    escrever('Nome', 'Maria Oliveira')
    fireEvent.click(screen.getByRole('radio', { name: /Retirada no local/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'Pix' }))
    fireEvent.click(botaoDeEnviar())

    expect(await screen.findByRole('heading', { name: 'Pedido #42 recebido' })).toBeVisible()
  })
})

describe('identificação por telefone', () => {
  it('telefone conhecido cumprimenta e oferece os endereços mascarados, o mais recente marcado', async () => {
    const { fetch } = await abrirCheckout({ identificacao: MARIA })
    fireEvent.click(screen.getByRole('radio', { name: 'Entrega' }))
    informarTelefone('(11) 98765-4321')

    expect(await screen.findByText('Olá, Maria! Que bom te ver de novo.')).toBeVisible()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/public/lanchonete-do-ze/customers/identify'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ phone: '5511987654321' }) }),
    )

    const enderecos = screen.getByRole('radiogroup', { name: 'Seus endereços' })
    expect(
      within(enderecos).getByRole('radio', { name: 'Rua dos Ipês, 4•• — Jardim Paulista' }),
    ).toBeChecked()
    expect(screen.queryByLabelText('Rua')).not.toBeInTheDocument()

    fireEvent.click(within(enderecos).getByRole('radio', { name: 'Outro endereço' }))
    expect(campo('Rua')).toBeVisible()
  })

  it('sair do campo de novo com o mesmo telefone não busca outra vez', async () => {
    const { fetch } = await abrirCheckout({ identificacao: MARIA })
    informarTelefone('11987654321')
    await screen.findByText('Olá, Maria! Que bom te ver de novo.')
    fireEvent.blur(campo('Telefone (WhatsApp)'))

    const identificacoes = fetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(identificacoes).toHaveLength(1)
  })

  it('trocar o telefone esconde os endereços do número anterior', async () => {
    await abrirCheckout({ identificacao: MARIA })
    fireEvent.click(screen.getByRole('radio', { name: 'Entrega' }))
    informarTelefone('11987654321')
    await screen.findByText('Olá, Maria! Que bom te ver de novo.')

    escrever('Telefone (WhatsApp)', '21999990000')

    expect(screen.queryByText('Olá, Maria! Que bom te ver de novo.')).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Seus endereços' })).not.toBeInTheDocument()
    expect(campo('Rua')).toBeVisible()
  })

  it('telefone novo segue com o endereço em branco', async () => {
    await abrirCheckout()
    fireEvent.click(screen.getByRole('radio', { name: 'Entrega' }))
    informarTelefone('11912345678')

    await waitFor(() => {
      expect(screen.queryByText('Procurando seus dados…')).not.toBeInTheDocument()
    })
    expect(screen.queryByText(/Que bom te ver/)).not.toBeInTheDocument()
    expect(campo('Rua')).toHaveValue('')
  })

  it('falha na busca não trava o pedido', async () => {
    await abrirCheckout({
      identificacao: {
        status: 429,
        corpo: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Muitas requisições.' } },
      },
    })
    informarTelefone('11987654321')

    expect(
      await screen.findByText(
        'Não conseguimos buscar seus dados agora. Preencha abaixo, por favor.',
      ),
    ).toBeVisible()
    expect(campo('Nome')).toBeEnabled()
  })

  it('entrega em endereço salvo é enviada sem digitar endereço', async () => {
    await abrirCheckout({ identificacao: MARIA })
    informarTelefone('11987654321')
    await screen.findByText('Olá, Maria! Que bom te ver de novo.')
    escrever('Nome', 'Maria Oliveira')
    fireEvent.click(screen.getByRole('radio', { name: 'Entrega' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Pix' }))
    fireEvent.click(botaoDeEnviar())

    expect(await screen.findByRole('heading', { name: 'Pedido #42 recebido' })).toBeVisible()
  })
})

describe('regras do estabelecimento', () => {
  it('troco aparece só para dinheiro e precisa cobrir o total', async () => {
    await abrirCheckout()
    fireEvent.click(screen.getByRole('radio', { name: 'Pix' }))
    expect(screen.queryByLabelText(/Troco para quanto/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Retirada no local/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'Dinheiro' }))
    escrever(/Troco para quanto/, '20')
    fireEvent.click(botaoDeEnviar())

    expect(
      await screen.findByText(/O troco precisa ser para um valor a partir do total, R\$\s36,00\./),
    ).toBeVisible()
  })

  it('entrega por região pede a região e mostra a taxa dela', async () => {
    const cardapio = cardapioDoZe()
    cardapio.delivery = {
      ...cardapio.delivery,
      feeMode: 'BY_REGION',
      fixedFeeInCents: null,
      regions: [{ id: '00000000-0000-7000-8000-00000000aaaa', name: 'Centro', feeInCents: 700 }],
    }
    await abrirCheckout({ cardapio })
    fireEvent.click(screen.getByRole('radio', { name: 'Entrega' }))

    const resumo = screen.getByRole('region', { name: 'Resumo' })
    expect(within(resumo).getByText('Escolha acima')).toBeVisible()

    fireEvent.change(campo('Região de entrega'), {
      target: { value: '00000000-0000-7000-8000-00000000aaaa' },
    })
    expect(within(resumo).getByText('R$ 7,00')).toBeVisible()
  })

  it('fechado ou abaixo do mínimo não deixa enviar, e diz por quê', async () => {
    await abrirCheckout({
      cardapio: { ...cardapioDoZe(), status: { aberto: false, motivo: 'PAUSADO' } },
      quantidade: 1,
    })

    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('O estabelecimento está fechado agora.')
    expect(alerta).toHaveTextContent(/Faltam R\$\s2,00 para o pedido mínimo/)
    expect(botaoDeEnviar()).toBeDisabled()
  })
})

/** Preenche um pedido de retirada, pago com Pix. */
function preencherRetirada() {
  informarTelefone('11987654321')
  escrever('Nome', 'Maria Oliveira')
  fireEvent.click(screen.getByRole('radio', { name: /Retirada no local/ }))
  fireEvent.click(screen.getByRole('radio', { name: 'Pix' }))
}

/** O corpo de cada envio de pedido que chegou à API simulada. */
function enviosFeitos(fetch: ReturnType<typeof mockarApiDoCheckout>) {
  return (
    fetch.mock.calls
      .filter(([url, init]) => init?.method === 'POST' && url.endsWith('/orders'))
      // O `postJson` sempre envia o corpo como texto JSON.
      .map(([, init]) => JSON.parse(init?.body as string) as Record<string, unknown>)
  )
}

const RECUSADO: Resposta = {
  status: 422,
  corpo: {
    error: {
      code: 'ORDER_REJECTED',
      message: 'O pedido não pôde ser aceito.',
      details: {
        problemas: [
          {
            tipo: 'PRODUTO_INDISPONIVEL',
            itemIndex: 0,
            mensagem: 'Açaí na tigela não está disponível agora.',
          },
        ],
      },
    },
  },
}

describe('envio do pedido', () => {
  it('envia só ids, quantidades e escolhas, com o total que o cliente viu', async () => {
    const { fetch, cardapio } = await abrirCheckout()
    preencherRetirada()
    fireEvent.click(botaoDeEnviar())
    await screen.findByRole('heading', { name: 'Pedido #42 recebido' })

    const [corpo] = enviosFeitos(fetch)
    expect(corpo).toMatchObject({
      customer: { phone: '5511987654321', name: 'Maria Oliveira' },
      fulfillment: 'PICKUP',
      address: null,
      expectedTotalInCents: 3600,
      items: [
        {
          productId: produtoDoFixture(cardapio, 'Açaí na tigela').id,
          quantity: 2,
          notes: null,
          options: {},
        },
      ],
    })
    expect(String(corpo?.idempotencyKey)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(JSON.stringify(corpo)).not.toMatch(/priceInCents|totalInCents"/)
  })

  it('depois do envio, confirma o pedido e esvazia o carrinho', async () => {
    await abrirCheckout()
    preencherRetirada()
    fireEvent.click(botaoDeEnviar())

    expect(await screen.findByRole('heading', { name: 'Pedido #42 recebido' })).toBeVisible()
    expect(screen.getByText('2x Açaí na tigela')).toBeVisible()
    expect(screen.getByText(/Lanchonete do Zé já recebeu o seu pedido/)).toBeVisible()
    expect(useCarrinhoStore.getState().carrinhos).toEqual({})
  })

  it('pedido recusado mostra os motivos, recarrega o cardápio e tenta com outra chave', async () => {
    const { fetch } = await abrirCheckout({
      envios: [RECUSADO, { status: 201, corpo: PEDIDO_CRIADO }],
    })
    const cardapiosAntes = fetch.mock.calls.filter(([, init]) => init?.method !== 'POST').length
    preencherRetirada()
    fireEvent.click(botaoDeEnviar())

    const alerta = await screen.findByText('O pedido não foi enviado')
    expect(alerta.parentElement).toHaveTextContent('Açaí na tigela não está disponível agora.')
    await waitFor(() => {
      expect(fetch.mock.calls.filter(([, init]) => init?.method !== 'POST').length).toBeGreaterThan(
        cardapiosAntes,
      )
    })

    fireEvent.click(botaoDeEnviar())
    await screen.findByRole('heading', { name: 'Pedido #42 recebido' })
    const [primeiro, segundo] = enviosFeitos(fetch)
    expect(segundo?.idempotencyKey).not.toBe(primeiro?.idempotencyKey)
  })

  it('preço que mudou pede para conferir o novo total', async () => {
    await abrirCheckout({
      envios: [
        {
          status: 409,
          corpo: {
            error: { code: 'PRICE_CHANGED', message: 'mudou', details: { totalInCents: 4000 } },
          },
        },
      ],
    })
    preencherRetirada()
    fireEvent.click(botaoDeEnviar())

    expect(
      await screen.findByText(/Os valores mudaram desde que você abriu o cardápio/),
    ).toBeVisible()
  })

  it('falha de rede deixa tentar de novo com a mesma chave, sem duplicar o pedido', async () => {
    const { fetch } = await abrirCheckout({
      envios: ['falha-de-rede', { status: 201, corpo: PEDIDO_CRIADO }],
    })
    preencherRetirada()
    fireEvent.click(botaoDeEnviar())
    expect(await screen.findByText(/Não conseguimos enviar o pedido/)).toBeVisible()

    fireEvent.click(botaoDeEnviar())
    await screen.findByRole('heading', { name: 'Pedido #42 recebido' })
    const [primeiro, segundo] = enviosFeitos(fetch)
    expect(segundo?.idempotencyKey).toBe(primeiro?.idempotencyKey)
  })
})

describe('confirmação', () => {
  it('aberta sem o pedido (recarregada), diz que os detalhes não ficam guardados', () => {
    mockarApiDoCheckout(cardapioDoZe())
    abrir('/lanchonete-do-ze/pedido-enviado')

    expect(screen.getByText(/Os detalhes do pedido não ficam guardados nesta página/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Voltar ao cardápio' })).toHaveAttribute(
      'href',
      '/lanchonete-do-ze',
    )
  })
})
