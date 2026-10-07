import type { GrupoPublico, ProdutoPublico } from '@/features/menu/types'

/**
 * A escolha de opções de um produto, sem React.
 *
 * O navegador aplica mínimo e máximo para guiar o cliente, e calcula o preço
 * só para mostrar. Quem cobra e quem recusa é o servidor, na Fase 11, com a
 * mesma regra: nada daqui é confiável do lado de lá.
 */

/** As opções escolhidas, por grupo: `groupId → optionIds`. */
export type Selecao = Readonly<Record<string, readonly string[]>>

export const SELECAO_VAZIA: Selecao = {}

export function escolhidas(selecao: Selecao, grupoId: string): readonly string[] {
  return selecao[grupoId] ?? []
}

/**
 * Toca numa opção.
 *
 * Em grupo de uma escolha só, tocar noutra opção troca — é o "Tamanho". Em
 * grupo de várias, tocar alterna, e uma opção a mais que o máximo é ignorada.
 * Opção esgotada ou de outro grupo nunca entra.
 */
export function alternarOpcao(grupo: GrupoPublico, selecao: Selecao, opcaoId: string): Selecao {
  const opcao = grupo.options.find((o) => o.id === opcaoId)
  if (!opcao) return selecao

  const atuais = escolhidas(selecao, grupo.id)
  if (atuais.includes(opcaoId)) {
    // Grupo obrigatório de uma escolha funciona como rádio: não se desmarca.
    if (grupo.maxSelections === 1 && grupo.minSelections >= 1) return selecao
    return { ...selecao, [grupo.id]: atuais.filter((id) => id !== opcaoId) }
  }

  if (!opcao.isAvailable) return selecao
  if (grupo.maxSelections === 1) return { ...selecao, [grupo.id]: [opcaoId] }
  if (atuais.length >= grupo.maxSelections) return selecao
  return { ...selecao, [grupo.id]: [...atuais, opcaoId] }
}

/** O grupo já tem o máximo de opções escolhidas. */
export function grupoCompleto(grupo: GrupoPublico, selecao: Selecao): boolean {
  return escolhidas(selecao, grupo.id).length >= grupo.maxSelections
}

/** Os grupos que ainda não têm o mínimo de escolhas. */
export function gruposPendentes(produto: ProdutoPublico, selecao: Selecao): GrupoPublico[] {
  return produto.optionGroups.filter((g) => escolhidas(selecao, g.id).length < g.minSelections)
}

/**
 * Um problema da seleção diante do cardápio atual, ou `null`.
 *
 * O carrinho fica guardado no navegador e o cardápio muda: o bacon esgota, o
 * lojista cria um grupo obrigatório novo. Por isso a seleção é conferida de
 * novo sempre que o carrinho é mostrado.
 */
export function problemaDaSelecao(
  produto: ProdutoPublico,
  selecao: Selecao,
): 'OPCAO_INDISPONIVEL' | 'ESCOLHA_INCOMPLETA' | null {
  for (const [grupoId, opcoes] of Object.entries(selecao)) {
    if (opcoes.length === 0) continue
    const grupo = produto.optionGroups.find((g) => g.id === grupoId)
    if (!grupo || opcoes.length > grupo.maxSelections) return 'OPCAO_INDISPONIVEL'
    const valida = (id: string) => grupo.options.some((o) => o.id === id && o.isAvailable)
    if (!opcoes.every(valida)) return 'OPCAO_INDISPONIVEL'
  }

  return gruposPendentes(produto, selecao).length > 0 ? 'ESCOLHA_INCOMPLETA' : null
}

/** Preço de uma unidade com as opções escolhidas, em centavos. Só para exibir. */
export function precoUnitario(produto: ProdutoPublico, selecao: Selecao): number {
  let total = produto.priceInCents
  for (const grupo of produto.optionGroups) {
    for (const id of escolhidas(selecao, grupo.id)) {
      total += grupo.options.find((o) => o.id === id)?.priceDeltaInCents ?? 0
    }
  }
  return total
}

/** Os nomes das opções escolhidas, na ordem dos grupos do produto. */
export function nomesDasOpcoes(produto: ProdutoPublico, selecao: Selecao): string[] {
  return produto.optionGroups.flatMap((grupo) =>
    grupo.options.filter((o) => escolhidas(selecao, grupo.id).includes(o.id)).map((o) => o.name),
  )
}

/** A regra do grupo em palavras: "Escolha 1", "Escolha até 3", "Escolha de 1 a 2". */
export function descreverRegraDoGrupo(
  grupo: Pick<GrupoPublico, 'minSelections' | 'maxSelections'>,
): string {
  const { minSelections: min, maxSelections: max } = grupo
  if (min === max) return `Escolha ${String(max)}`
  if (min === 0) return max === 1 ? 'Escolha até 1' : `Escolha até ${String(max)}`
  return `Escolha de ${String(min)} a ${String(max)}`
}

/** Duas seleções iguais, independente da ordem em que as opções foram tocadas. */
export function mesmaSelecao(a: Selecao, b: Selecao): boolean {
  const normalizar = (s: Selecao) =>
    Object.entries(s)
      .filter(([, ids]) => ids.length > 0)
      .map(([grupo, ids]) => `${grupo}:${[...ids].sort().join(',')}`)
      .sort()
      .join('|')
  return normalizar(a) === normalizar(b)
}
