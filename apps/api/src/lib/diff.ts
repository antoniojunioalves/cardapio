export type Diferencas = Record<string, { de: unknown; para: unknown }>

/**
 * Só as chaves cujo valor mudou, com o antes e o depois.
 *
 * É o formato do `metadata` da auditoria. Registrar o objeto inteiro tornaria
 * impossível ver, depois, o que de fato foi alterado.
 */
export function diferencas<T extends Record<string, unknown>>(antes: T, depois: T): Diferencas {
  const resultado: Diferencas = {}

  for (const chave of Object.keys(depois)) {
    if (chave === 'updatedAt') continue

    const valorAntes = antes[chave]
    const valorDepois = depois[chave]
    const iguais =
      valorAntes instanceof Date && valorDepois instanceof Date
        ? valorAntes.getTime() === valorDepois.getTime()
        : valorAntes === valorDepois

    if (!iguais) resultado[chave] = { de: valorAntes ?? null, para: valorDepois ?? null }
  }

  return resultado
}
