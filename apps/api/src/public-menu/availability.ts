/**
 * Se um produto pode ser pedido agora.
 *
 * Módulo sem banco nem framework, como o de horários: recebe o produto já
 * carregado e decide. O cardápio público usa isto para mostrar "esgotado"; o
 * cálculo do pedido, na Fase 11, usa a mesma regra para recusar — o frontend
 * mostrar um produto como disponível nunca é o que autoriza a venda.
 *
 * O lojista marca "acabou" em três lugares diferentes, e cada um precisa
 * refletir no produto:
 *
 * - **no próprio produto** — "acabou o X-Bacon";
 * - **num componente do combo** — sem refrigerante, o combo seria vendido pelo
 *   mesmo preço com um item a menos;
 * - **nas opções de um grupo obrigatório** — se "Tamanho" exige uma escolha e
 *   todos os tamanhos acabaram, não há como montar o pedido.
 */

export interface OpcaoParaDisponibilidade {
  isAvailable: boolean
}

export interface GrupoParaDisponibilidade {
  minSelections: number
  options: readonly OpcaoParaDisponibilidade[]
}

export interface ComponenteParaDisponibilidade {
  isAvailable: boolean
}

export interface ProdutoParaDisponibilidade {
  type: 'SIMPLE' | 'COMBO'
  isAvailable: boolean
  groups: readonly GrupoParaDisponibilidade[]
  /** Só faz sentido em combos; vazio nos produtos simples. */
  comboItems: readonly ComponenteParaDisponibilidade[]
}

export type MotivoDeIndisponibilidade =
  'ESGOTADO' | 'COMPONENTE_ESGOTADO' | 'COMBO_SEM_ITENS' | 'OPCOES_OBRIGATORIAS_ESGOTADAS'

/** Um grupo é atendível se ainda restam opções suficientes para o mínimo. */
export function grupoAtendivel(grupo: GrupoParaDisponibilidade): boolean {
  const disponiveis = grupo.options.filter((o) => o.isAvailable).length
  return disponiveis >= grupo.minSelections
}

/** O motivo pelo qual o produto não pode ser pedido, ou `null` se pode. */
export function motivoDeIndisponibilidade(
  produto: ProdutoParaDisponibilidade,
): MotivoDeIndisponibilidade | null {
  if (!produto.isAvailable) return 'ESGOTADO'

  if (produto.type === 'COMBO') {
    // Um combo sem componentes é um cadastro pela metade: venderia um preço
    // sem dizer à cozinha o que preparar.
    if (produto.comboItems.length === 0) return 'COMBO_SEM_ITENS'
    if (produto.comboItems.some((i) => !i.isAvailable)) return 'COMPONENTE_ESGOTADO'
  }

  if (!produto.groups.every(grupoAtendivel)) return 'OPCOES_OBRIGATORIAS_ESGOTADAS'

  return null
}

export function podeSerPedido(produto: ProdutoParaDisponibilidade): boolean {
  return motivoDeIndisponibilidade(produto) === null
}
