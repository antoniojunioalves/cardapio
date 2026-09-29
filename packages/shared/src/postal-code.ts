/**
 * CEP.
 *
 * Guardado só com os dígitos — `01310100` —, e exibido com o hífen —
 * `01310-100`. Ainda não há consulta aos Correios: o cliente digita, e o
 * formato é o que se confere. A busca do endereço pelo CEP está no ROADMAP.
 */

/** Os 8 dígitos do CEP, ou `null` se não for um CEP. */
export function normalizarCep(entrada: string): string | null {
  const digitos = entrada.replace(/\D/g, '')
  // Nenhum CEP começa com 00000: a faixa mais baixa é a de São Paulo, 01000.
  if (digitos.length !== 8 || digitos.startsWith('00000')) return null
  return digitos
}

/** `01310100` → `01310-100`. */
export function formatarCep(normalizado: string): string {
  return `${normalizado.slice(0, 5)}-${normalizado.slice(5)}`
}

/** Aplica a máscara enquanto a pessoa digita: `013101` → `01310-1`. */
export function mascararCepDigitado(entrada: string): string {
  const d = entrada.replace(/\D/g, '').slice(0, 8)
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`
}
