const REAIS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Centavos inteiros para texto em reais: `2590` → `R$ 25,90`.
 *
 * A divisão por 100 acontece só aqui, na hora de exibir. Nenhuma conta é feita
 * com o valor em reais — somar `25.9 + 7` em ponto flutuante é o tipo de erro
 * que o centavo inteiro existe para evitar.
 */
export function formatarPreco(centavos: number): string {
  return REAIS.format(centavos / 100)
}

/**
 * Lê um valor digitado em reais e devolve centavos, ou `null` se não for um
 * valor: `50` → `5000`, `50,5` → `5050`, `R$ 1.234,56` → `123456`.
 *
 * Trabalha sobre o texto, sem passar por ponto flutuante.
 */
export function lerReais(texto: string): number | null {
  const limpo = texto.replace(/R\$|\s/g, '')
  const casou = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(limpo)
  if (!casou) return null
  const reais = Number((casou[1] ?? '').replaceAll('.', ''))
  const centavos = Number((casou[2] ?? '').padEnd(2, '0'))
  return reais * 100 + centavos
}
