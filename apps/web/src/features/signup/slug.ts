import { SLUG_MAXIMO } from '@repo/shared'

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
