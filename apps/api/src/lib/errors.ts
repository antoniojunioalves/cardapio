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
