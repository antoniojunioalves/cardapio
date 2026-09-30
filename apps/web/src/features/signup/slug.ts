import { SLUG_FORMATO, SLUG_MAXIMO } from '@repo/shared'

/**
 * O endereço do cardápio sugerido a partir do nome do estabelecimento:
 * "Lanchonete do Zé" → `lanchonete-do-ze`.
 *
 * Tira acentos, troca tudo que não é letra ou número por hífen e respeita o
 * tamanho máximo. A sugestão pode sair reservada ou já em uso — quem decide é
 * a validação e a consulta de disponibilidade, não esta função.
 */
export function sugerirSlug(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAXIMO)
    .replace(/-+$/, '')
}

/**
 * O endereço digitado para entrar no painel. Aceita o endereço sozinho
 * (`lanchonete-do-ze`) ou o link inteiro colado
 * (`https://…/lanchonete-do-ze/admin`). Devolve `null` se não der para tirar
 * um endereço válido dali.
 */
export function extrairSlugDigitado(texto: string): string | null {
  const semOrigem = texto.trim().replace(/^[a-z]+:\/\/[^/]+/i, '')
  const primeiro = semOrigem.split('/').find((parte) => parte.length > 0)
  const slug = primeiro?.toLowerCase() ?? ''
  return slug.length <= SLUG_MAXIMO && SLUG_FORMATO.test(slug) ? slug : null
}
