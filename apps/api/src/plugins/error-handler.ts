import type { FastifyError, FastifyInstance } from 'fastify'
import { ZodError } from 'zod'

import { isProduction } from '../config/env.js'
import { AppError } from '../lib/errors.js'

/**
 * Formato único de erro da API:
 *
 *   { "error": { "code", "message", "requestId", "details"? } }
 *
 * O `requestId` vai na resposta de propósito: é o que liga a mensagem que o
 * usuário vê à linha de log correspondente no servidor.
 */
interface ErrorBody {
  error: {
    code: string
    message: string
    requestId: string
    details?: unknown
  }
}

function body(code: string, message: string, requestId: string, details?: unknown): ErrorBody {
  return {
    error: {
      code,
      message,
      requestId,
      ...(details !== undefined && { details }),
    },
  }
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const requestId = request.id

    if (error instanceof AppError) {
      request.log.info({ err: error, code: error.code }, 'erro de aplicação')
      return reply
        .status(error.statusCode)
        .send(body(error.code, error.message, requestId, error.details))
    }

    if (error instanceof ZodError) {
      return reply
        .status(400)
        .send(body('VALIDATION_ERROR', 'Dados inválidos.', requestId, error.issues))
    }

    // Erro de validação de schema do próprio Fastify.
    if (error.validation) {
      return reply
        .status(400)
        .send(body('VALIDATION_ERROR', 'Dados inválidos.', requestId, error.validation))
    }

    const statusCode = error.statusCode ?? 500

    if (statusCode < 500) {
      return reply
        .status(statusCode)
        .send(body(error.code ?? 'BAD_REQUEST', error.message, requestId))
    }

    // A partir daqui é falha inesperada: registra tudo, revela pouco.
    request.log.error({ err: error }, 'erro não tratado')

    return reply
      .status(500)
      .send(
        body(
          'INTERNAL_ERROR',
          isProduction ? 'Erro interno do servidor.' : error.message,
          requestId,
        ),
      )
  })

  app.setNotFoundHandler((request, reply) => {
    return reply
      .status(404)
      .send(body('NOT_FOUND', `Rota ${request.method} ${request.url} não encontrada.`, request.id))
  })
}
