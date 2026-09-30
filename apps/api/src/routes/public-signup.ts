import { cadastroSchema, slugSchema } from '@repo/shared'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { AppError } from '../lib/errors.js'
import { cadastrarEstabelecimento, confirmarEmail, enderecoDisponivel } from '../signup/service.js'
import { responderSessao, sessaoSchema } from './auth.js'

/**
 * Cadastros por IP por hora. Quem se cadastra de verdade faz um, talvez dois
 * se errar algo; o limite existe para a página não virar fábrica de
 * estabelecimentos — nem de e-mails saindo pelo nosso remetente.
 */
export const LIMITE_DE_CADASTROS = 10

/** A disponibilidade é consultada enquanto a pessoa digita o endereço. */
export const LIMITE_DE_CONSULTAS_DE_ENDERECO = 60

/** O token tem 256 bits aleatórios: o limite é contra abuso, não contra adivinhação. */
export const LIMITE_DE_CONFIRMACOES = 10

const tag = ['Cadastro']

export function publicSignupRoutes(instance: FastifyInstance): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()

  typed.post(
    '/signup',
    {
      config: { rateLimit: { max: LIMITE_DE_CADASTROS, timeWindow: '1 hour' } },
      schema: {
        tags: tag,
        summary: 'Cadastra um estabelecimento no plano gratuito',
        description:
          'Sem autenticação. Cria o estabelecimento, a assinatura do plano gratuito e o dono, ' +
          'e já devolve a sessão (refresh token no cookie, como no login). O cardápio nasce ' +
          '`PENDING`: responde 404 até o dono confirmar o e-mail pelo link enviado. Endereço ' +
          'em uso responde 409 `SLUG_TAKEN`. Limite próprio por IP.',
        body: cadastroSchema,
        response: {
          201: sessaoSchema.extend({
            establishment: z.object({
              id: z.uuid(),
              slug: z.string(),
              name: z.string(),
              status: z.literal('PENDING'),
            }),
            confirmationEmailSent: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      if (request.body.website?.trim()) {
        request.log.warn({ ip: request.ip }, 'cadastro recusado pelo campo-armadilha')
        throw new AppError('Não foi possível concluir o cadastro.', 400, 'SIGNUP_REJECTED')
      }

      const resultado = await cadastrarEstabelecimento(request.body, { ip: request.ip })

      return reply.status(201).send({
        ...responderSessao(reply, resultado.sessao),
        establishment: resultado.estabelecimento,
        confirmationEmailSent: resultado.emailDeConfirmacaoEnviado,
      })
    },
  )

  typed.get(
    '/signup/slug-availability',
    {
      config: { rateLimit: { max: LIMITE_DE_CONSULTAS_DE_ENDERECO, timeWindow: '1 minute' } },
      schema: {
        tags: tag,
        summary: 'Se um endereço de cardápio está livre para o cadastro',
        description:
          'Sempre 200: um endereço fora do formato ou reservado volta como indisponível, com o ' +
          'motivo em `reason`, para o formulário mostrar enquanto a pessoa digita.',
        querystring: z.object({ slug: z.string().max(100) }),
        response: {
          200: z.object({
            slug: z.string(),
            available: z.boolean(),
            reason: z.string().nullable(),
          }),
        },
      },
    },
    async (request) => {
      const validado = slugSchema.safeParse(request.query.slug)
      if (!validado.success) {
        return {
          slug: request.query.slug,
          available: false,
          reason: validado.error.issues[0]?.message ?? 'Endereço inválido.',
        }
      }

      const available = await enderecoDisponivel(validado.data)
      return {
        slug: validado.data,
        available,
        reason: available ? null : 'Este endereço já está em uso. Escolha outro.',
      }
    },
  )

  typed.post(
    '/signup/confirm-email',
    {
      config: { rateLimit: { max: LIMITE_DE_CONFIRMACOES, timeWindow: '1 minute' } },
      schema: {
        tags: tag,
        summary: 'Confirma o e-mail pelo link e publica o cardápio',
        description:
          'Sem autenticação: o link pode ser aberto em outro aparelho. O token vem do fragmento ' +
          'do link, no corpo — nunca na URL. Um segundo uso do mesmo link responde ' +
          '`ALREADY_CONFIRMED`. Link inválido ou expirado responde 400.',
        body: z.object({ token: z.string().min(1).max(200) }),
        response: {
          200: z.object({
            status: z.enum(['CONFIRMED', 'ALREADY_CONFIRMED']),
            slug: z.string(),
          }),
        },
      },
    },
    async (request) => {
      const resultado = await confirmarEmail(request.body.token)
      return { status: resultado.situacao, slug: resultado.slug }
    },
  )
}
