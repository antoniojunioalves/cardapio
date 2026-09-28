import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { currentUser, requireAuth } from '../auth/middleware.js'
import { login, logout, refreshSession } from '../auth/service.js'

const sessaoSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.uuid(),
    tenantId: z.uuid(),
    name: z.string(),
    email: z.string(),
    permissions: z.array(z.string()),
  }),
})

const loginSchema = z.object({
  /** Vem da rota da área administrativa, não digitado pelo usuário. */
  tenantSlug: z.string().min(1).max(63),
  email: z.email().max(254),
  password: z.string().min(1).max(256),
})

const refreshSchema = z.object({ refreshToken: z.string().min(1) })

export function authRoutes(instance: FastifyInstance): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()

  typed.post(
    '/login',
    {
      schema: {
        tags: ['Autenticação'],
        summary: 'Autentica um usuário administrativo',
        body: loginSchema,
        response: { 200: sessaoSchema },
      },
      // Bem mais estrito que o limite global: é aqui que uma tentativa de
      // força bruta bateria, e o custo do argon2 sozinho não a impede.
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request) => login(request.body),
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
    async (request) => refreshSession(request.body.refreshToken),
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
      await logout(request.body.refreshToken)
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
      preHandler: requireAuth(),
    },
    (request) => currentUser(request),
  )
}
