/**
 * Identifica violações de restrição do PostgreSQL.
 *
 * O Drizzle embrulha o erro do driver num DrizzleQueryError; o código SQLSTATE
 * e o nome da restrição ficam na causa. Reconhecê-los permite transformar uma
 * restrição do banco numa mensagem que o lojista entende — "já existe uma
 * categoria com esse nome" em vez de um 500.
 */
export interface ViolacaoDoBanco {
  /** `23505` unicidade, `23503` chave estrangeira, `23514` check. */
  code: string
  constraint: string | undefined
}

export function violacaoDoBanco(error: unknown): ViolacaoDoBanco | null {
  const candidatos = [error, error instanceof Error ? error.cause : undefined]

  for (const candidato of candidatos) {
    if (
      candidato &&
      typeof candidato === 'object' &&
      'code' in candidato &&
      typeof candidato.code === 'string' &&
      /^23\d{3}$/.test(candidato.code)
    ) {
      const constraint =
        'constraint' in candidato && typeof candidato.constraint === 'string'
          ? candidato.constraint
          : undefined
      return { code: candidato.code, constraint }
    }
  }

  return null
}

export const UNICIDADE = '23505'
export const CHAVE_ESTRANGEIRA = '23503'
