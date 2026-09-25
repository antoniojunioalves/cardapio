import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance } from 'fastify'

import { env } from '../config/env.js'

/**
 * Limite global de requisições.
 *
 * É o piso, não a proteção final: rotas sensíveis — login e a consulta de
 * cliente por telefone, especialmente — vão declarar limites próprios, bem
 * mais estritos, nas fases em que forem criadas. A consulta por telefone sem
 * limite dedicado seria uma ferramenta de varredura de endereços.
 *
 * O contador vive na memória do processo. Com mais de uma instância em
 * produção isso vira um limite por instância, e aí entra um armazenamento
 * compartilhado (Redis) — registrado no ROADMAP junto com o deploy.
 */
export async function registerRateLimit(instance: FastifyInstance): Promise<void> {
  await instance.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    /**
     * Devolve os campos soltos — `statusCode`, `code`, `message` — e não o
     * envelope final. O plugin transforma este objeto num Error que segue para
     * o nosso `setErrorHandler`, e é lá, num lugar só, que todo erro da API
     * ganha o formato de resposta. Montar o envelope aqui produziria um Error
     * sem `statusCode` nem `message`, que o handler não teria como interpretar.
     */
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      error: 'Too Many Requests',
      message: `Muitas requisições. Tente novamente em ${context.after}.`,
    }),
  })
}
