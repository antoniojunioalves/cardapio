import type { CardapioPublico, ProdutoPublico } from '@/features/menu/types'

import { nomesDasOpcoes, precoUnitario, problemaDaSelecao, type Selecao } from './selection'

/**
 * O carrinho, sem React.
 *
 * O item guarda só o que o cliente escolheu — produto, opções, quantidade e
 * observação —, nunca preço. O preço é recalculado contra o cardápio atual
 * toda vez que o carrinho aparece: um preço guardado no navegador ficaria
 * velho quando o lojista o mudasse, e o cliente veria um total que o servidor
 * não vai cobrar. O nome é guardado só para avisar quando o produto some.
 */

export const QUANTIDADE_MAXIMA = 50
export const OBSERVACAO_MAXIMA = 140

export interface ItemDoCarrinho {
  /** Id local, só para a lista; não significa nada para a API. */
  id: string
  productId: string
  nome: string
  selecao: Selecao
  quantidade: number
  observacao: string
}

export type ProblemaDoItem =
  'PRODUTO_REMOVIDO' | 'PRODUTO_ESGOTADO' | 'OPCAO_INDISPONIVEL' | 'ESCOLHA_INCOMPLETA'

export interface LinhaDoCarrinho {
  item: ItemDoCarrinho
  produto: ProdutoPublico | null
  opcoes: string[]
  precoUnitarioEmCentavos: number
  totalEmCentavos: number
  problema: ProblemaDoItem | null
}

export const MENSAGEM_DO_PROBLEMA: Record<ProblemaDoItem, string> = {
  PRODUTO_REMOVIDO: 'Este produto saiu do cardápio.',
  PRODUTO_ESGOTADO: 'Este produto esgotou.',
  OPCAO_INDISPONIVEL: 'Uma das opções escolhidas não está mais disponível.',
  ESCOLHA_INCOMPLETA: 'O produto mudou e pede uma escolha nova.',
}

export function limitarQuantidade(quantidade: number): number {
  if (!Number.isFinite(quantidade)) return 1
  return Math.min(QUANTIDADE_MAXIMA, Math.max(1, Math.trunc(quantidade)))
}

export function limparObservacao(observacao: string): string {
  return observacao.trim().slice(0, OBSERVACAO_MAXIMA)
}

/** Encontra um produto do cardápio pelo id. */
export function buscarProduto(cardapio: CardapioPublico, id: string): ProdutoPublico | null {
  for (const categoria of cardapio.categories) {
    const produto = categoria.products.find((p) => p.id === id)
    if (produto) return produto
  }
  return null
}

/** Confere cada item contra o cardápio atual e calcula o preço de exibição. */
export function resolverCarrinho(
  itens: readonly ItemDoCarrinho[],
  cardapio: CardapioPublico,
): LinhaDoCarrinho[] {
  return itens.map((item) => {
    const produto = buscarProduto(cardapio, item.productId)
    if (!produto) {
      return {
        item,
        produto: null,
        opcoes: [],
        precoUnitarioEmCentavos: 0,
        totalEmCentavos: 0,
        problema: 'PRODUTO_REMOVIDO',
      }
    }

    const unitario = precoUnitario(produto, item.selecao)
    return {
      item,
      produto,
      opcoes: nomesDasOpcoes(produto, item.selecao),
      precoUnitarioEmCentavos: unitario,
      totalEmCentavos: unitario * item.quantidade,
      problema: produto.isAvailable ? problemaDaSelecao(produto, item.selecao) : 'PRODUTO_ESGOTADO',
    }
  })
}

export interface ResumoDoCarrinho {
  /** Unidades somadas, para o indicador. */
  quantidadeDeItens: number
  /** Soma das linhas sem problema. A taxa de entrega entra no checkout. */
  subtotalEmCentavos: number
  faltaParaMinimoEmCentavos: number
  temProblema: boolean
}

export function resumirCarrinho(
  linhas: readonly LinhaDoCarrinho[],
  pedidoMinimoEmCentavos: number,
): ResumoDoCarrinho {
  const validas = linhas.filter((l) => l.problema === null)
  const subtotal = validas.reduce((soma, l) => soma + l.totalEmCentavos, 0)
  return {
    quantidadeDeItens: linhas.reduce((soma, l) => soma + l.item.quantidade, 0),
    subtotalEmCentavos: subtotal,
    faltaParaMinimoEmCentavos: Math.max(0, pedidoMinimoEmCentavos - subtotal),
    temProblema: validas.length < linhas.length,
  }
}

/**
 * Lê o carrinho guardado no navegador, descartando o que não tiver o formato
 * esperado.
 *
 * O `localStorage` é de quem usa o navegador: pode ter sobra de uma versão
 * antiga, ter sido editado à mão ou estar corrompido. Um item inválido é
 * descartado sozinho, sem derrubar a página nem levar os outros junto.
 */
export function sanearCarrinhos(dado: unknown): Record<string, ItemDoCarrinho[]> {
  if (!ehObjeto(dado)) return {}

  const carrinhos: Record<string, ItemDoCarrinho[]> = {}
  for (const [slug, itens] of Object.entries(dado)) {
    if (!Array.isArray(itens)) continue
    const validos = itens.flatMap((i: unknown) => {
      const item = sanearItem(i)
      return item ? [item] : []
    })
    if (validos.length > 0) carrinhos[slug] = validos
  }
  return carrinhos
}

function sanearItem(dado: unknown): ItemDoCarrinho | null {
  if (!ehObjeto(dado)) return null
  const { id, productId, nome, selecao, quantidade, observacao } = dado
  if (typeof id !== 'string' || typeof productId !== 'string' || typeof nome !== 'string') {
    return null
  }
  if (typeof quantidade !== 'number' || typeof observacao !== 'string' || !ehObjeto(selecao)) {
    return null
  }

  const grupos: Record<string, string[]> = {}
  for (const [grupo, opcoes] of Object.entries(selecao)) {
    if (!Array.isArray(opcoes) || !opcoes.every((o) => typeof o === 'string')) return null
    grupos[grupo] = opcoes
  }

  return {
    id,
    productId,
    nome,
    selecao: grupos,
    quantidade: limitarQuantidade(quantidade),
    observacao: limparObservacao(observacao),
  }
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}
