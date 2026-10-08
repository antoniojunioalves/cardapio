import { PERFIL } from '@repo/shared'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { currentUser, requireAuth, tenantContextOf } from '../auth/middleware.js'
import { alterarPerfil, criarPerfil, excluirPerfil, listarPerfis } from '../profiles/service.js'

const seguranca = [{ bearerAuth: [] }]
const tag = ['Perfis']
const params = z.object({ id: z.uuid() })

const perfilSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  permissions: z
    .array(z.string())
    .describe('Os códigos das permissões, na ordem do catálogo (`recurso:acao`).'),
  users: z.number().describe('Quantas pessoas têm o perfil. Com alguém, ele não se exclui.'),
})

const dadosDoPerfil = z.object({
  name: z.string().trim().min(2).max(PERFIL.nomeMaximo),
  description: z.string().trim().max(PERFIL.descricaoMaxima).nullable().optional(),
  permissions: z.array(z.string().max(64)).max(100),
})

const REGRA_DO_ALCANCE =
  'Ninguém põe num perfil uma permissão que não tem, nem mexe num perfil que tem mais do que ' +
  'ele (403 `PROFILE_OUT_OF_REACH`). O proprietário tem todas.'

/**
 * Os perfis do estabelecimento: conjuntos de permissões, com nome, que o dono
 * monta e dá a cada pessoa. O catálogo das permissões é o de `@repo/shared`.
 */
export function adminProfileRoutes(instance: FastifyInstance): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()

  typed.get(
    '/profiles',
    {
      schema: {
        tags: tag,
        summary: 'Perfis do estabelecimento',
        description: 'Por nome, cada um com as permissões e quantas pessoas o têm.',
        response: { 200: z.array(perfilSchema) },
        security: seguranca,
      },
      onRequest: requireAuth('users:read'),
    },
    async (request) => listarPerfis(tenantContextOf(request)),
  )

  typed.post(
    '/profiles',
    {
      schema: {
        tags: tag,
        summary: 'Cria um perfil',
        description:
          'As permissões são completadas com o que cada uma exige: quem altera os produtos vê o ' +
          'cardápio. Código que não existe responde 400 `UNKNOWN_PERMISSION`; nome repetido, 409 ' +
          `\`PROFILE_NAME_TAKEN\`. ${REGRA_DO_ALCANCE}`,
        body: dadosDoPerfil,
        response: { 201: perfilSchema },
        security: seguranca,
      },
      onRequest: requireAuth('profiles:manage'),
    },
    async (request, reply) => {
      const criado = await criarPerfil(tenantContextOf(request), currentUser(request), request.body)
      return reply.status(201).send(criado)
    },
  )

  typed.put(
    '/profiles/:id',
    {
      schema: {
        tags: tag,
        summary: 'Altera um perfil',
        description:
          'O nome, a descrição e a lista inteira das permissões. Vale na hora para todos que têm ' +
          'o perfil. Ninguém altera o perfil que tem (409 `CANNOT_CHANGE_OWN_PROFILE`). ' +
          REGRA_DO_ALCANCE,
        params,
        body: dadosDoPerfil,
        response: { 200: perfilSchema },
        security: seguranca,
      },
      onRequest: requireAuth('profiles:manage'),
    },
    async (request) =>
      alterarPerfil(
        tenantContextOf(request),
        currentUser(request),
        request.params.id,
        request.body,
      ),
  )

  typed.delete(
    '/profiles/:id',
    {
      schema: {
        tags: tag,
        summary: 'Exclui um perfil',
        description: `Com alguém dentro, não se exclui (409 \`PROFILE_IN_USE\`). ${REGRA_DO_ALCANCE}`,
        params,
        response: { 204: z.null() },
        security: seguranca,
      },
      onRequest: requireAuth('profiles:manage'),
    },
    async (request, reply) => {
      await excluirPerfil(tenantContextOf(request), currentUser(request), request.params.id)
      return reply.status(204).send(null)
    },
  )
}
