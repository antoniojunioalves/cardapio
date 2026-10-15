import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { currentUser, requireAuth, tenantContextOf } from '../auth/middleware.js'
import type { UsuarioDoPainel } from '../users/repository.js'
import {
  alterarUsuario,
  desativarUsuario,
  listarUsuarios,
  reativarUsuario,
} from '../users/service.js'

const seguranca = [{ bearerAuth: [] }]
const tag = ['Usuários']
const params = z.object({ id: z.uuid() })

const usuarioSchema = z.object({
  id: z.uuid(),
  name: z.string().describe('O nome da conta da pessoa: é ela quem o define.'),
  email: z
    .string()
    .describe('O e-mail da conta, com que a pessoa entra em todos os estabelecimentos.'),
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

  typed.patch(
    '/users/:id',
    {
      schema: {
        tags: tag,
        summary: 'Muda o perfil de um usuário',
        description:
          'O nome e o e-mail são da conta da pessoa, e não se mudam por aqui. Ninguém muda o ' +
          'próprio perfil (409 `CANNOT_CHANGE_OWN_PROFILE`), e o proprietário não tem perfil ' +
          `(409 \`OWNER_HAS_NO_PROFILE\`). ${REGRA_DO_ALCANCE}`,
        params,
        body: z.object({ profileId: z.uuid() }),
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
