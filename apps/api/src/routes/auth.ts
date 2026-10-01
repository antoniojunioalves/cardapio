import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { currentUser, requireAuth } from '../auth/middleware.js'
import { login, logout, refreshSession, type Session } from '../auth/service.js'
import { env, isProduction } from '../config/env.js'
import { UnauthorizedError } from '../lib/errors.js'

/**
 * A resposta de login e renovação. **Sem o refresh token:** ele vai só no
 * cookie `httpOnly`, que o JavaScript da página não lê — um script injetado
 * não tem como roubá-lo.
 */
export const sessaoSchema = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.uuid(),
    tenantId: z.uuid(),
    name: z.string(),
    email: z.string(),
    permissions: z.array(z.string()),
  }),
  /** O estabelecimento da sessão: é do `slug` que o painel tira o endereço. */
  establishment: z.object({
    id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']),
  }),
})

/** Só e-mail e senha: o estabelecimento é o do e-mail, e o servidor é quem o acha. */
const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(256),
})

/**
 * O refresh token vem do cookie. O corpo é alternativa para clientes de API
 * sem cookie (scripts, Postman); o navegador nunca o manda por ali.
 */
// `nullish`: sem corpo, o Fastify entrega `null` — é o caso do navegador.
const refreshSchema = z.object({ refreshToken: z.string().min(1).optional() }).nullish()

export const COOKIE_DE_SESSAO = 'refresh_token'

/**
 * - `httpOnly`: invisível ao JavaScript da página.
 * - `sameSite: strict`: não vai em requisição originada em outro site — sem
 *   isso, uma página qualquer poderia disparar a renovação em nome de quem
 *   está logado.
 * - `path`: só as rotas de autenticação recebem o cookie.
 * - `secure` em produção: só por HTTPS.
 */
const opcoesDoCookie = {
  httpOnly: true,
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
  secure: isProduction,
  maxAge: env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60,
}

function tokenDaRequisicao(request: FastifyRequest<{ Body: z.infer<typeof refreshSchema> }>) {
  return request.cookies[COOKIE_DE_SESSAO] ?? request.body?.refreshToken ?? ''
}

/** Grava o refresh token no cookie e devolve o resto da sessão. O cadastro usa o mesmo. */
export function responderSessao(reply: FastifyReply, sessao: Session) {
  void reply.setCookie(COOKIE_DE_SESSAO, sessao.refreshToken, opcoesDoCookie)
  return {
    accessToken: sessao.accessToken,
    user: sessao.user,
    establishment: sessao.establishment,
  }
}

export function authRoutes(instance: FastifyInstance): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()

  typed.post(
    '/login',
    {
      schema: {
        tags: ['Autenticação'],
        summary: 'Autentica um usuário administrativo',
        description:
          'O estabelecimento não é informado: o e-mail é único na plataforma, e a resposta ' +
          'traz o estabelecimento a que a pessoa pertence, em `establishment`.',
        body: loginSchema,
        response: { 200: sessaoSchema },
      },
      // Bem mais estrito que o limite global: é aqui que uma tentativa de
      // força bruta bateria, e o custo do argon2 sozinho não a impede.
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => responderSessao(reply, await login(request.body)),
  )

  typed.post(
    '/refresh',
    {
      schema: {
        tags: ['Autenticação'],
        summary: 'Renova a sessão, rotacionando o refresh token',
        body: refreshSchema,
        response: { 200: sessaoSchema },
      },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const token = tokenDaRequisicao(request)
      if (!token) throw new UnauthorizedError('Sessão inválida.')
      return responderSessao(reply, await refreshSession(token))
    },
  )

  typed.post(
    '/logout',
    {
      schema: {
        tags: ['Autenticação'],
        summary: 'Encerra a sessão, revogando o refresh token',
        body: refreshSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const token = tokenDaRequisicao(request)
      if (token) await logout(token)
      // Os mesmos atributos da criação, para apagar exatamente aquele cookie.
      const { maxAge: _maxAge, ...atributos } = opcoesDoCookie
      void reply.clearCookie(COOKIE_DE_SESSAO, atributos)
      return reply.status(204).send(null)
    },
  )

  typed.get(
    '/me',
    {
      schema: {
        tags: ['Autenticação'],
        summary: 'Dados do usuário autenticado e suas permissões',
        response: { 200: sessaoSchema.shape.user },
        security: [{ bearerAuth: [] }],
      },
      onRequest: requireAuth(),
    },
    (request) => currentUser(request),
  )
}
