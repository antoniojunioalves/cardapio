import { pino, type LoggerOptions } from 'pino'

import { env, isDevelopment, isTest } from '../config/env.js'

/**
 * Opções do logger — e não uma instância pronta.
 *
 * Quem cria o logger das requisições é o Fastify. Passar uma instância já
 * construída amarraria o tipo genérico da aplicação ao tipo concreto do pino,
 * e daí em diante todo plugin e toda rota teriam que carregar esse genérico.
 * Entregando só as opções, a aplicação continua tipada como `FastifyInstance`
 * padrão e o `request.log` de cada rota já vem com o id da requisição.
 */
export const loggerOptions: LoggerOptions = {
  level: isTest ? 'silent' : env.LOG_LEVEL,
  // Nenhuma credencial ou token pode cair no log.
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
    censor: '[REDACTED]',
  },
  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
    },
  }),
}

/**
 * Logger para o que acontece fora do ciclo de vida de uma requisição: erro em
 * conexão ociosa do pool, execução de migrations, inicialização. Esses eventos
 * não têm `request.log` para usar, e perdê-los seria perder justamente os
 * problemas de infraestrutura.
 */
export const infraLogger = pino(loggerOptions)
