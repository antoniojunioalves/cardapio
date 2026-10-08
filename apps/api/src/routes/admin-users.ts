import { senhaSchema } from '@repo/shared'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { currentUser, requireAuth, tenantContextOf } from '../auth/middleware.js'
import type { UsuarioDoPainel } from '../users/repository.js'
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

const usuarioSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  isOwner: z.boolean().describe('O proprietário: tem todas as permissões e não tem perfil.'),
  profile: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  isActive: z.boolean(),
  lastLoginAt: z.date().nullable(),
  createdAt: z.date(),
})

/** Sem o hash da senha, campo a campo. */
function apresentar(u: UsuarioDoPainel): z.infer<typeof usuarioSchema> {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    isOwner: u.isOwner,
    profile: u.perfil && { id: u.perfil.id, name: u.perfil.nome },
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  }
}

const REGRA_DO_ALCANCE =
  'Quem não tem todas as permissões de um perfil não o dá a ninguém, e não altera quem o tem ' +
  '(403 `PROFILE_OUT_OF_REACH`).'

export function adminUserRoutes(instance: FastifyInstance): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()

  typed.get(
    '/users',
    {
      schema: {
        tags: tag,
        summary: 'Usuários do estabelecimento',
        description: 'O proprietário primeiro; os demais, por nome, cada um com o perfil.',
        response: { 200: z.array(usuarioSchema) },
        security: seguranca,
      },
      onRequest: requireAuth('users:read'),
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
          'Com o perfil dele e uma senha inicial, que quem cadastra repassa à pessoa — ainda não ' +
          'há envio de convite por e-mail. Respeita o limite de usuários ativos do plano (409 ' +
          `\`PLAN_USER_LIMIT\`). ${REGRA_DO_ALCANCE}`,
        body: z.object({
          name: z.string().trim().min(2).max(120),
          email: z.email().max(254),
          // As mesmas regras da senha de quem cadastra o estabelecimento.
          password: senhaSchema,
          profileId: z.uuid(),
        }),
        response: { 201: usuarioSchema },
        security: seguranca,
      },
      onRequest: requireAuth('users:create'),
    },
    async (request, reply) => {
      const criado = await criarUsuario(
        tenantContextOf(request),
        currentUser(request),
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
        summary: 'Altera o nome ou o perfil de um usuário',
        description:
          'Ninguém muda o próprio perfil (409 `CANNOT_CHANGE_OWN_PROFILE`), e o proprietário não ' +
          `tem perfil (409 \`OWNER_HAS_NO_PROFILE\`). ${REGRA_DO_ALCANCE}`,
        params,
        body: z
          .object({
            name: z.string().trim().min(2).max(120).optional(),
            profileId: z.uuid().optional(),
          })
          .refine((v) => v.name !== undefined || v.profileId !== undefined, {
            message: 'informe o nome ou o perfil',
          }),
        response: { 200: usuarioSchema },
        security: seguranca,
      },
      onRequest: requireAuth('users:update'),
    },
    async (request) =>
      apresentar(
        await alterarUsuario(
          tenantContextOf(request),
          currentUser(request),
          request.params.id,
          request.body,
        ),
      ),
  )

  // Desativar e reativar tiram e devolvem acesso: têm permissão própria,
  // `users:delete`, que o perfil pronto de administrador não traz.
  typed.post(
    '/users/:id/deactivate',
    {
      schema: {
        tags: tag,
        summary: 'Desativa um usuário e encerra as sessões dele',
        description: REGRA_DO_ALCANCE,
        params,
        response: { 200: usuarioSchema },
        security: seguranca,
      },
      onRequest: requireAuth('users:delete'),
    },
    async (request) =>
      apresentar(
        await desativarUsuario(tenantContextOf(request), currentUser(request), request.params.id),
      ),
  )

  typed.post(
    '/users/:id/reactivate',
    {
      schema: {
        tags: tag,
        summary: 'Reativa um usuário, se o plano tiver vaga',
        description: REGRA_DO_ALCANCE,
        params,
        response: { 200: usuarioSchema },
        security: seguranca,
      },
      onRequest: requireAuth('users:delete'),
    },
    async (request) =>
      apresentar(
        await reativarUsuario(tenantContextOf(request), currentUser(request), request.params.id),
      ),
  )
}
