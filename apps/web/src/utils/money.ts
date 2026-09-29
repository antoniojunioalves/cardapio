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
