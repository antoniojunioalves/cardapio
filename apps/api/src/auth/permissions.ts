import { ForbiddenError } from '../lib/errors.js'

/** Quem faz: o id e as permissões que tem agora, lidas a cada requisição. */
export interface Ator {
  id: string
  permissions: readonly string[]
}

/**
 * Recusa quem não tem **todas** as permissões pedidas.
 *
 * É a conferência das rotas (`requireAuth`) e também a dos serviços em que a
 * permissão depende do que o pedido muda: alterar o preço de um produto não é
 * a mesma permissão de marcá-lo como esgotado, e só comparando com o que está
 * gravado se sabe qual das duas o pedido usa.
 */
export function exigirPermissao(ator: Ator, ...permissoes: readonly string[]): void {
  const faltando = permissoes.filter((permissao) => !ator.permissions.includes(permissao))
  if (faltando.length === 0) return

  throw new ForbiddenError('Você não tem permissão para esta ação.', {
    required: [...permissoes],
    missing: faltando,
  })
}

/** Recusa quem não tem **nenhuma** das permissões: basta uma para passar. */
export function exigirAlgumaPermissao(ator: Ator, ...permissoes: readonly string[]): void {
  if (permissoes.some((permissao) => ator.permissions.includes(permissao))) return

  throw new ForbiddenError('Você não tem permissão para esta ação.', { anyOf: [...permissoes] })
}
