import type { FastifyReply, FastifyRequest, onRequestAsyncHookHandler } from 'fastify'

import { UnauthorizedError } from '../lib/errors.js'
import { tenantContextFromUser, type TenantContext } from '../tenant/context.js'
import { exigirAlgumaPermissao, exigirPermissao } from './permissions.js'
import { loadAuthenticatedUser, type AuthenticatedUser } from './service.js'
import { verifyAccessToken } from './tokens.js'

declare module 'fastify' {
  interface FastifyRequest {
    tenantContext?: TenantContext
    currentUser?: AuthenticatedUser
  }
}

function extrairToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) return null

  const token = header.slice('Bearer '.length).trim()
  return token.length > 0 ? token : null
}

/**
 * Verifica o token, carrega o usuário e estabelece o contexto de tenant.
 *
 * O tenant vem do token assinado por nós, nunca de cabeçalho, corpo ou query.
 * O `tenantContextFromUser` deixa essa origem registrada.
 */
const authenticate: onRequestAsyncHookHandler = async (request: FastifyRequest) => {
  const token = extrairToken(request)
  if (!token) throw new UnauthorizedError('Autenticação necessária.')

  const payload = verifyAccessToken(token)
  if (!payload) throw new UnauthorizedError('Sessão inválida ou expirada.')

  const context = tenantContextFromUser(payload.tenantId)
  const usuario = await loadAuthenticatedUser(context, payload.sub)

  if (!usuario) throw new UnauthorizedError('Sessão inválida ou expirada.')

  request.tenantContext = context
  request.currentUser = usuario
}

function authorize(
  conferir: typeof exigirPermissao,
  required: readonly string[],
): onRequestAsyncHookHandler {
  return (request: FastifyRequest, _reply: FastifyReply) => {
    const usuario = request.currentUser

    // Só acontece se alguém montar a cadeia sem autenticar antes. É 401 e não
    // 403 de propósito: o problema é não sabermos quem é, não a permissão.
    if (!usuario) throw new UnauthorizedError('Autenticação necessária.')

    conferir(usuario, ...required)
    return Promise.resolve()
  }
}

/**
 * Protege uma rota, opcionalmente exigindo permissões.
 *
 * É a única forma exportada de fazer isso, e por um motivo: autenticar e
 * autorizar em duas peças separadas permite montá-las na ordem errada, e
 * `[authorize('x'), authenticate]` falharia em silêncio — `authorize` não
 * encontraria usuário e o erro pareceria de sessão, não de configuração.
 * Devolvendo a cadeia pronta, a ordem não é uma decisão de quem usa.
 *
 *     app.get('/produtos', { onRequest: requireAuth('products:read') }, handler)
 *
 * **Sempre em `onRequest`, nunca em `preHandler`.** O Fastify valida o corpo
 * antes do `preHandler`: ali, quem não está logado receberia 400 com o
 * formato esperado da rota — e o servidor leria o corpo de quem nem se
 * identificou. Em `onRequest`, o 401 vem antes de tudo. O teste
 * `route-guard.test.ts` confere toda rota do painel.
 */
export function requireAuth(...permissions: readonly string[]): onRequestAsyncHookHandler[] {
  return permissions.length > 0
    ? [authenticate, authorize(exigirPermissao, permissions)]
    : [authenticate]
}

/**
 * Como o `requireAuth`, para a rota em que a permissão depende do que o pedido
 * muda: **uma** das permissões basta para entrar.
 *
 * Entrar não é poder: qual delas o pedido usa, só o serviço sabe, comparando
 * com o que está gravado — e é ele que confere, com `exigirPermissao`. Aqui só
 * fica de fora quem não poderia fazer nenhuma das coisas que a rota faz.
 *
 *     app.patch('/products/:id', {
 *       onRequest: requireAnyOf('products:update', 'products:price', 'products:availability'),
 *     }, handler)
 */
export function requireAnyOf(
  ...permissions: readonly [string, string, ...string[]]
): onRequestAsyncHookHandler[] {
  return [authenticate, authorize(exigirAlgumaPermissao, permissions)]
}

/** Recupera o usuário autenticado com tipo garantido, dentro de uma rota protegida. */
export function currentUser(request: FastifyRequest): AuthenticatedUser {
  if (!request.currentUser) {
    throw new UnauthorizedError('Autenticação necessária.')
  }
  return request.currentUser
}

/** Recupera o contexto de tenant com tipo garantido, dentro de uma rota protegida. */
export function tenantContextOf(request: FastifyRequest): TenantContext {
  if (!request.tenantContext) {
    throw new UnauthorizedError('Autenticação necessária.')
  }
  return request.tenantContext
}
