import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { currentUser, requireAuth, tenantContextOf } from '../auth/middleware.js'
import type { ConviteDoPainel } from '../invitations/repository.js'
import {
  cancelarConvite,
  convidar,
  listarConvites,
  reenviarConvite,
} from '../invitations/service.js'

const seguranca = [{ bearerAuth: [] }]
const tag = ['Usuários']
const params = z.object({ id: z.uuid() })

const conviteSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  profile: z.object({ id: z.uuid(), name: z.string() }),
  invitedBy: z.string().nullable().describe('O nome de quem convidou.'),
  expiresAt: z.date(),
  sentAt: z.date().describe('Quando o último e-mail saiu: a criação ou o reenvio mais recente.'),
  createdAt: z.date(),
})

const envioSchema = z.object({
  invitation: conviteSchema,
  emailSent: z
    .boolean()
    .describe('Falso quando o servidor de e-mail falhou: o convite vale, e dá para reenviar.'),
})

function apresentar(c: ConviteDoPainel): z.infer<typeof conviteSchema> {
  return {
    id: c.id,
    email: c.email,
    profile: { id: c.perfil.id, name: c.perfil.nome },
    invitedBy: c.convidadoPor,
    expiresAt: c.expiresAt,
    sentAt: c.enviadoEm,
    createdAt: c.createdAt,
  }
}

const REGRA_DO_ALCANCE =
  'Quem não tem todas as permissões do perfil do convite não convida para ele, nem reenvia ou ' +
  'cancela o convite (403 `PROFILE_OUT_OF_REACH`).'

/**
 * Os convites para a equipe. Quem entra no painel de um estabelecimento entra
 * por aqui: o e-mail e o perfil; o nome e a senha são da conta da pessoa.
 */
export function adminInvitationRoutes(instance: FastifyInstance): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()

  typed.get(
    '/invitations',
    {
      schema: {
        tags: tag,
        summary: 'Convites pendentes para a equipe',
        description: 'Do mais novo para o mais antigo, vencidos inclusive.',
        response: { 200: z.array(conviteSchema) },
        security: seguranca,
      },
      onRequest: requireAuth('users:read'),
    },
    async (request) => (await listarConvites(tenantContextOf(request))).map(apresentar),
  )

  typed.post(
    '/invitations',
    {
      schema: {
        tags: tag,
        summary: 'Convida uma pessoa para a equipe',
        description:
          'Manda ao e-mail um link que vale 7 dias. Quem já tem conta — em outro ' +
          'estabelecimento — aceita com a senha dela; quem não tem, cria a conta ao aceitar. A ' +
          'resposta não diz qual dos dois é. Um convite pendente ocupa vaga do plano (409 ' +
          '`PLAN_USER_LIMIT`). E-mail que já está na equipe responde 409 `USER_ALREADY_MEMBER`; ' +
          `com convite pendente, 409 \`INVITATION_PENDING\`. ${REGRA_DO_ALCANCE}`,
        body: z.object({ email: z.email().max(254), profileId: z.uuid() }),
        response: { 201: envioSchema },
        security: seguranca,
      },
      onRequest: requireAuth('users:create'),
    },
    async (request, reply) => {
      const { convite, emailEnviado } = await convidar(
        tenantContextOf(request),
        currentUser(request),
        request.body,
      )
      return reply.status(201).send({ invitation: apresentar(convite), emailSent: emailEnviado })
    },
  )

  typed.post(
    '/invitations/:id/resend',
    {
      schema: {
        tags: tag,
        summary: 'Reenvia um convite, com um link novo',
        description:
          'O link anterior deixa de valer, e o prazo de 7 dias recomeça. Um minuto entre os ' +
          `envios do mesmo convite (429 \`RESEND_TOO_SOON\`). ${REGRA_DO_ALCANCE}`,
        params,
        response: { 200: envioSchema },
        security: seguranca,
      },
      onRequest: requireAuth('users:create'),
    },
    async (request) => {
      const { convite, emailEnviado } = await reenviarConvite(
        tenantContextOf(request),
        currentUser(request),
        request.params.id,
      )
      return { invitation: apresentar(convite), emailSent: emailEnviado }
    },
  )

  typed.delete(
    '/invitations/:id',
    {
      schema: {
        tags: tag,
        summary: 'Cancela um convite',
        description: `O link deixa de valer, e a vaga do plano fica livre. ${REGRA_DO_ALCANCE}`,
        params,
        response: { 204: z.null() },
        security: seguranca,
      },
      onRequest: requireAuth('users:create'),
    },
    async (request, reply) => {
      await cancelarConvite(tenantContextOf(request), currentUser(request), request.params.id)
      return reply.status(204).send(null)
    },
  )
}
