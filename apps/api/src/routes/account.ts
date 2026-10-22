import { senhaSchema } from '@repo/shared'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { renomearMinhaConta, trocarMinhaSenha } from '../accounts/service.js'
import { currentUser, requireAuth, tenantContextOf } from '../auth/middleware.js'
import { responderSessao, sessaoSchema } from './auth.js'

/** A troca confere a senha atual: o mesmo limite do login. */
export const LIMITE_DE_TROCAS_DE_SENHA = 5

const tag = ['Minha conta']
const seguranca = [{ bearerAuth: [] }]

/**
 * "Minha conta": o que a pessoa logada muda nela mesma. Qualquer pessoa do
 * painel, sem permissão nenhuma — a conta é dela. Vale em todos os
 * estabelecimentos em que ela trabalha.
 *
 * Fica sob `/auth` para a troca de senha gravar o cookie da sessão nova.
 */
export function accountRoutes(instance: FastifyInstance): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()

  typed.patch(
    '/account',
    {
      schema: {
        tags: tag,
        summary: 'Troca o próprio nome',
        description:
          'O nome é da conta: muda em todos os estabelecimentos em que a pessoa trabalha. Devolve ' +
          'o usuário da sessão, já com o nome novo.',
        body: z.object({ name: z.string().trim().min(2).max(120) }),
        response: { 200: sessaoSchema.shape.user },
        security: seguranca,
      },
      onRequest: requireAuth(),
    },
    async (request) =>
      renomearMinhaConta(tenantContextOf(request), currentUser(request), request.body.name),
  )

  typed.post(
    '/account/password',
    {
      config: { rateLimit: { max: LIMITE_DE_TROCAS_DE_SENHA, timeWindow: '1 minute' } },
      schema: {
        tags: tag,
        summary: 'Troca a própria senha',
        description:
          'Confere a senha atual (400 `CURRENT_PASSWORD_INVALID`); a nova segue as regras do ' +
          'cadastro e não pode ser igual à atual (400 `SAME_PASSWORD`). Encerra todas as sessões ' +
          'da conta, em todos os estabelecimentos e aparelhos — o token de acesso emitido antes ' +
          'deixa de valer na hora — e devolve uma sessão nova para este aparelho, como o login.',
        body: z.object({
          currentPassword: z.string().min(1).max(256),
          newPassword: senhaSchema,
        }),
        response: { 200: sessaoSchema },
        security: seguranca,
      },
      onRequest: requireAuth(),
    },
    async (request, reply) => {
      const sessao = await trocarMinhaSenha(tenantContextOf(request), currentUser(request), {
        senhaAtual: request.body.currentPassword,
        senhaNova: request.body.newPassword,
      })
      return responderSessao(reply, sessao)
    },
  )
}
