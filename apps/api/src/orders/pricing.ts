import type { NovoPedido, ProblemaDoPedido } from '@repo/shared'

import type { CardapioPublico, ProdutoPublico } from '../public-menu/service.js'

/**
 * O cálculo do pedido, sem banco nem framework.
 *
 * Recebe o cardápio **como o servidor o monta agora** — a mesma montagem que
 * o cliente recebe em `GET /menu` — e o pedido enviado, que só traz ids,
 * quantidades e escolhas. Tudo que tem valor é decidido aqui:
 *
 * - se o estabelecimento está aberto e oferece a modalidade;
 * - se cada produto existe neste estabelecimento e pode ser pedido (a regra de
 *   `public-menu/availability.ts`, já aplicada na montagem);
 * - se as opções pertencem aos grupos do produto, estão disponíveis e
 *   respeitam mínimo e máximo;
 * - preço de cada item, subtotal, pedido mínimo, taxa, total, forma de
 *   pagamento e troco.
 *
 * Devolve **todos** os problemas de uma vez: o cliente corrige tudo numa ida,
 * e não um erro por tentativa.
 */

export interface OpcaoCalculada {
  grupo: string
  opcao: string
  acrescimoEmCentavos: number
}

export interface ItemCalculado {
  produto: ProdutoPublico
  quantidade: number
  observacao: string | null
  /** Na ordem dos grupos do produto e das opções no grupo. */
  opcoes: OpcaoCalculada[]
  unitarioEmCentavos: number
  totalEmCentavos: number
}

export interface PedidoCalculado {
  itens: ItemCalculado[]
  subtotalEmCentavos: number
  taxaEmCentavos: number
  totalEmCentavos: number
  regiao: { id: string; name: string } | null
  formaDePagamento: CardapioPublico['paymentMethods'][number]
  trocoParaEmCentavos: number | null
}

export type ResultadoDoCalculo =
  { ok: true; pedido: PedidoCalculado } | { ok: false; problemas: ProblemaDoPedido[] }

const reais = (centavos: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100)

export function calcularPedido(cardapio: CardapioPublico, pedido: NovoPedido): ResultadoDoCalculo {
  const problemas: ProblemaDoPedido[] = []
  const problema = (tipo: ProblemaDoPedido['tipo'], mensagem: string, itemIndex?: number) => {
    problemas.push(itemIndex === undefined ? { tipo, mensagem } : { tipo, mensagem, itemIndex })
  }

  if (!cardapio.status.aberto) {
    problema(
      'ESTABELECIMENTO_FECHADO',
      cardapio.status.motivo === 'PAUSADO'
        ? 'O estabelecimento pausou os pedidos. Tente de novo em instantes.'
        : 'O estabelecimento está fechado agora.',
    )
  }

  const entrega = pedido.fulfillment === 'DELIVERY'
  const { delivery } = cardapio
  if (entrega ? !delivery.deliveryEnabled : !delivery.pickupEnabled) {
    problema(
      'MODALIDADE_INDISPONIVEL',
      entrega
        ? 'O estabelecimento não está fazendo entregas.'
        : 'O estabelecimento não está aceitando retirada no local.',
    )
  }

  const produtos = new Map(
    cardapio.categories.flatMap((c) => c.products).map((p) => [p.id, p] as const),
  )

  const itens: ItemCalculado[] = []
  pedido.items.forEach((item, indice) => {
    // Produto de outro estabelecimento, de categoria inativa ou excluído não
    // está na montagem — e cai aqui, igual a um id inventado.
    const produto = produtos.get(item.productId)
    if (!produto) {
      problema('PRODUTO_INDISPONIVEL', 'Um dos produtos saiu do cardápio.', indice)
      return
    }
    if (!produto.isAvailable) {
      problema('PRODUTO_INDISPONIVEL', `${produto.name} não está disponível agora.`, indice)
      return
    }

    const opcoes = conferirOpcoes(produto, item.options)
    if (typeof opcoes === 'string') {
      problema('OPCOES_INVALIDAS', opcoes, indice)
      return
    }

    const unitario =
      produto.priceInCents + opcoes.reduce((soma, o) => soma + o.acrescimoEmCentavos, 0)
    itens.push({
      produto,
      quantidade: item.quantity,
      observacao: item.notes,
      opcoes,
      unitarioEmCentavos: unitario,
      totalEmCentavos: unitario * item.quantity,
    })
  })

  const subtotal = itens.reduce((soma, i) => soma + i.totalEmCentavos, 0)
  const minimo = cardapio.establishment.minimumOrderInCents
  // Com item recusado o subtotal está incompleto, e o aviso de mínimo seria ruído.
  if (itens.length === pedido.items.length && subtotal < minimo) {
    problema(
      'PEDIDO_MINIMO',
      `O pedido mínimo é de ${reais(minimo)}; faltam ${reais(minimo - subtotal)}.`,
    )
  }

  let taxa = 0
  let regiao: PedidoCalculado['regiao'] = null
  if (entrega) {
    if (delivery.feeMode === 'FIXED') {
      taxa = delivery.fixedFeeInCents ?? 0
    } else {
      // Só as regiões ativas estão na montagem: região desativada conta como
      // inexistente, mesmo para quem ainda estava com a página aberta.
      const escolhida = delivery.regions.find((r) => r.id === pedido.deliveryRegionId)
      if (escolhida) {
        taxa = escolhida.feeInCents
        regiao = { id: escolhida.id, name: escolhida.name }
      } else {
        problema('REGIAO_INVALIDA', 'Escolha uma região de entrega atendida pelo estabelecimento.')
      }
    }
  }

  const total = subtotal + taxa

  const forma = cardapio.paymentMethods.find((f) => f.id === pedido.paymentMethodId)
  if (!forma) {
    problema('PAGAMENTO_INVALIDO', 'Escolha uma forma de pagamento aceita pelo estabelecimento.')
  } else if (pedido.changeForInCents !== null) {
    if (forma.kind !== 'CASH') {
      problema('TROCO_INVALIDO', 'Troco só vale para pagamento em dinheiro.')
    } else if (pedido.changeForInCents < total) {
      problema('TROCO_INVALIDO', `O troco precisa ser para um valor a partir de ${reais(total)}.`)
    }
  }

  if (problemas.length > 0 || !forma) return { ok: false, problemas }

  return {
    ok: true,
    pedido: {
      itens,
      subtotalEmCentavos: subtotal,
      taxaEmCentavos: taxa,
      totalEmCentavos: total,
      regiao,
      formaDePagamento: forma,
      trocoParaEmCentavos: pedido.changeForInCents,
    },
  }
}

/**
 * Confere as opções de um item. Devolve as opções escolhidas, na ordem do
 * produto, ou a frase do problema.
 */
function conferirOpcoes(
  produto: ProdutoPublico,
  escolhas: Readonly<Record<string, readonly string[]>>,
): OpcaoCalculada[] | string {
  for (const [grupoId, ids] of Object.entries(escolhas)) {
    if (ids.length === 0) continue
    const grupo = produto.optionGroups.find((g) => g.id === grupoId)
    if (!grupo) return `As opções escolhidas para ${produto.name} não valem mais. Escolha de novo.`
    if (new Set(ids).size !== ids.length) {
      return `Uma opção de ${produto.name} foi escolhida mais de uma vez.`
    }
    for (const id of ids) {
      const opcao = grupo.options.find((o) => o.id === id)
      if (!opcao)
        return `As opções escolhidas para ${produto.name} não valem mais. Escolha de novo.`
      if (!opcao.isAvailable) return `${opcao.name} acabou. Escolha outra opção em ${produto.name}.`
    }
  }

  const opcoes: OpcaoCalculada[] = []
  for (const grupo of produto.optionGroups) {
    const ids = escolhas[grupo.id] ?? []
    if (ids.length < grupo.minSelections) {
      return `Escolha ${grupo.name.toLowerCase()} em ${produto.name}.`
    }
    if (ids.length > grupo.maxSelections) {
      return `Em ${produto.name}, ${grupo.name.toLowerCase()} aceita no máximo ${String(grupo.maxSelections)}.`
    }
    for (const opcao of grupo.options) {
      if (ids.includes(opcao.id)) {
        opcoes.push({
          grupo: grupo.name,
          opcao: opcao.name,
          acrescimoEmCentavos: opcao.priceDeltaInCents,
        })
      }
    }
  }
  return opcoes
}
