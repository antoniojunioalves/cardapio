/**
 * Erro de aplicação — tudo que a API devolve como falha esperada passa por aqui.
 *
 * O `code` é um identificador estável, pensado para o cliente tratar
 * programaticamente. A `message` é para humanos e pode mudar sem aviso;
 * o cliente nunca deve depender do texto dela.
 */
export class AppError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details: unknown

  constructor(message: string, statusCode: number, code: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

/** 401 — não sabemos quem é, ou a credencial não confere. */
export class UnauthorizedError extends AppError {
  constructor(message = 'Credenciais inválidas.', details?: unknown) {
    super(message, 401, 'UNAUTHORIZED', details)
    this.name = 'UnauthorizedError'
  }
}

/** 403 — sabemos quem é, e essa pessoa não pode fazer isto. */
export class ForbiddenError extends AppError {
  constructor(message = 'Você não tem permissão para esta ação.', details?: unknown) {
    super(message, 403, 'FORBIDDEN', details)
    this.name = 'ForbiddenError'
  }
}
