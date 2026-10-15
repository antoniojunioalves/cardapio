import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { aceitarConvite, consultarConvite } from '../invitations/service.js'
import { COOKIE_DE_SESSAO, responderSessao, sessaoSchema } from './auth.js'

/** O token tem 256 bits aleatórios: o limite da consulta é contra abuso, não contra adivinhação. */
export const LIMITE_DE_CONSULTAS_DE_CONVITE = 10

/** O aceite confere uma senha: o mesmo limite do login. */
export const LIMITE_DE_ACEITES = 5

const tag = ['Autenticação']
const tokenSchema = z.string().min(1).max(200)

/**
 * O lado de quem recebeu o convite: sem autenticação, pelo link do e-mail. O
 * token vem do fragmento do link, no corpo — nunca na URL.
 *
 * Ficam sob `/auth` para receber o cookie da sessão: quem aceita com uma sessão
 * aberta — de outra conta, ou de outro estabelecimento — sai dela.
 */
export function invitationAcceptanceRoutes(instance: FastifyInstance): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()

  typed.post(
    '/invitation',
    {
      config: { rateLimit: { max: LIMITE_DE_CONSULTAS_DE_CONVITE, timeWindow: '1 minute' } },
      schema: {
        tags: tag,
        summary: 'O convite do link, para a página de aceite',
        description:
          'O estabelecimento, o perfil, quem convidou e se o e-mail já tem conta — nesse caso, ' +
          'o aceite pede a senha dela; senão, o nome e uma senha nova. Convite cancelado, já ' +
          'aceito ou de link trocado responde 400 `INVITATION_INVALID`; vencido, 400 ' +
          '`INVITATION_EXPIRED`.',
        body: z.object({ token: tokenSchema }),
        response: {
          200: z.object({
            email: z.string(),
            establishment: z.object({ name: z.string(), slug: z.string() }),
            profile: z.string(),
            invitedBy: z.string().nullable(),
            accountExists: z.boolean(),
          }),
        },
      },
    },
    async (request) => {
      const convite = await consultarConvite(request.body.token)
      return {
        email: convite.email,
        establishment: { name: convite.estabelecimento.nome, slug: convite.estabelecimento.slug },
        profile: convite.perfil,
        invitedBy: convite.convidadoPor,
        accountExists: convite.contaExiste,
      }
    },
  )

  typed.post(
    '/invitation/accept',
    {
      config: { rateLimit: { max: LIMITE_DE_ACEITES, timeWindow: '1 minute' } },
      schema: {
        tags: tag,
        summary: 'Aceita o convite e entra no painel do estabelecimento',
        description:
          'Com conta: a senha dela (401 se não conferir), e o `name` é ignorado. Sem conta: ' +
          '`name` e uma senha nas regras do cadastro — a conta nasce com o e-mail confirmado. ' +
          'Devolve a sessão, como o login, já no estabelecimento do convite; uma sessão que o ' +
          'navegador tinha é encerrada.',
        body: z.object({
          token: tokenSchema,
          password: z.string().min(1).max(256),
          name: z.string().max(120).optional(),
        }),
        response: { 200: sessaoSchema },
      },
    },
    async (request, reply) => {
      const sessao = await aceitarConvite(
        request.body.token,
        { password: request.body.password, name: request.body.name },
        request.cookies[COOKIE_DE_SESSAO],
      )
      return responderSessao(reply, sessao)
    },
  )
}
