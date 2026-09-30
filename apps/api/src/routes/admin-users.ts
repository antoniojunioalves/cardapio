import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { currentUser, requireAuth, tenantContextOf } from '../auth/middleware.js'
import type { UsuarioComPapel } from '../users/repository.js'
import {
  alterarUsuario,
  criarUsuario,
  desativarUsuario,
  listarUsuarios,
  reativarUsuario,
} from '../users/service.js'

const seguranca = [{ bearerAuth: [] }]
const tag = ['Usuários']
const params = z.object({ id: z.uuid() })
/** OWNER não é atribuído pela API: o dono é quem criou o estabelecimento. */
const papel = z.enum(['ADMIN', 'STAFF'])

const usuarioSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: z.object({ code: z.string(), name: z.string() }).nullable(),
  isActive: z.boolean(),
  lastLoginAt: z.date().nullable(),
  createdAt: z.date(),
})

/** Sem o hash da senha, campo a campo. */
function apresentar(u: UsuarioComPapel): z.infer<typeof usuarioSchema> {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.papel && { code: u.papel.codigo, name: u.papel.nome },
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  }
}

export function adminUserRoutes(instance: FastifyInstance): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()

  typed.get(
    '/users',
    {
      schema: {
        tags: tag,
        summary: 'Usuários do estabelecimento',
        response: { 200: z.array(usuarioSchema) },
        security: seguranca,
      },
      preHandler: requireAuth('users:read'),
    },
    async (request) => (await listarUsuarios(tenantContextOf(request))).map(apresentar),
  )

  typed.post(
    '/users',
    {
      schema: {
        tags: tag,
        summary: 'Cria um usuário',
        description:
          'Com senha inicial, que o dono repassa à pessoa — ainda não há envio de convite por ' +
          'e-mail. Respeita o limite de usuários ativos do plano (409 `PLAN_USER_LIMIT`).',
        body: z.object({
          name: z.string().trim().min(2).max(120),
          email: z.email().max(254),
          password: z.string().min(8, 'a senha precisa de ao menos 8 caracteres').max(256),
          role: papel,
        }),
        response: { 201: usuarioSchema },
        security: seguranca,
      },
      preHandler: requireAuth('users:create'),
    },
    async (request, reply) => {
      const criado = await criarUsuario(
        tenantContextOf(request),
        currentUser(request).id,
        request.body,
      )
      return reply.status(201).send(apresentar(criado))
    },
  )

  typed.patch(
    '/users/:id',
    {
      schema: {
        tags: tag,
        summary: 'Altera nome ou papel de um usuário',
        params,
        body: z
          .object({ name: z.string().trim().min(2).max(120).optional(), role: papel.optional() })
          .refine((v) => v.name !== undefined || v.role !== undefined, {
            message: 'informe o nome ou o papel',
          }),
        response: { 200: usuarioSchema },
        security: seguranca,
      },
      preHandler: requireAuth('users:update'),
    },
    async (request) =>
      apresentar(
        await alterarUsuario(
          tenantContextOf(request),
          currentUser(request).id,
          request.params.id,
          request.body,
        ),
      ),
  )

  // Desativar e reativar tiram e devolvem acesso — decisão de dono, por isso
  // `users:delete`, que o ADMIN não tem.
  typed.post(
    '/users/:id/deactivate',
    {
      schema: {
        tags: tag,
        summary: 'Desativa um usuário e encerra as sessões dele',
        params,
        response: { 200: usuarioSchema },
        security: seguranca,
      },
      preHandler: requireAuth('users:delete'),
    },
    async (request) =>
      apresentar(
        await desativarUsuario(
          tenantContextOf(request),
          currentUser(request).id,
          request.params.id,
        ),
      ),
  )

  typed.post(
    '/users/:id/reactivate',
    {
      schema: {
        tags: tag,
        summary: 'Reativa um usuário, se o plano tiver vaga',
        params,
        response: { 200: usuarioSchema },
        security: seguranca,
      },
      preHandler: requireAuth('users:delete'),
    },
    async (request) =>
      apresentar(
        await reativarUsuario(tenantContextOf(request), currentUser(request).id, request.params.id),
      ),
  )
}
