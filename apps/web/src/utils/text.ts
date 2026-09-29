/**
 * Prepara um texto para busca: sem acento, sem diferença de maiúsculas e sem
 * espaços nas pontas.
 *
 * Quem digita "acai" no celular precisa achar o "Açaí" — ninguém troca o
 * teclado para acentuar uma busca.
 */
export function normalizarParaBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}
