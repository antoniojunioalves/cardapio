import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { currentUser, requireAuth, tenantContextOf } from '../auth/middleware.js'
import { reenviarConfirmacao, situacaoDaConfirmacao } from '../signup/service.js'

/** Reenvios por IP por hora — além do intervalo de um minuto entre envios, contado no banco. */
export const LIMITE_DE_REENVIOS = 5

const seguranca = [{ bearerAuth: [] }]
const tag = ['Cadastro']

/**
 * A confirmação do e-mail vista do painel: o aviso "confirme seu e-mail para
 * publicar o cardápio" e o botão de reenviar.
 */
export function adminEmailConfirmationRoutes(instance: FastifyInstance): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()

  typed.get(
    '/email-confirmation',
    {
      schema: {
        tags: tag,
        summary: 'Se o cadastro já foi confirmado, e para qual e-mail vai o link',
        description:
          '`PENDING` enquanto o cardápio espera a confirmação do e-mail de quem cadastrou o ' +
          'estabelecimento; `CONFIRMED` depois — e para estabelecimento que não passou pelo ' +
          'cadastro da página.',
        response: {
          200: z.object({
            status: z.enum(['PENDING', 'CONFIRMED']),
            email: z.string().nullable(),
          }),
        },
        security: seguranca,
      },
      onRequest: requireAuth('settings:read'),
    },
    async (request) => situacaoDaConfirmacao(tenantContextOf(request)),
  )

  typed.post(
    '/email-confirmation/resend',
    {
      config: { rateLimit: { max: LIMITE_DE_REENVIOS, timeWindow: '1 hour' } },
      schema: {
        tags: tag,
        summary: 'Envia um novo link de confirmação ao dono do estabelecimento',
        description:
          'Vai para o e-mail de quem cadastrou o estabelecimento, seja quem for que peça. Um ' +
          'minuto entre envios (429 `RESEND_TOO_SOON`); já confirmado responde 409 ' +
          '`ALREADY_CONFIRMED`.',
        response: { 202: z.object({ email: z.string() }) },
        security: seguranca,
      },
      onRequest: requireAuth('settings:update'),
    },
    async (request, reply) => {
      const resultado = await reenviarConfirmacao(tenantContextOf(request), {
        userId: currentUser(request).id,
      })
      return reply.status(202).send(resultado)
    },
  )
}
