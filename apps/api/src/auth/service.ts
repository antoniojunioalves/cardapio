import { and, eq, isNull } from 'drizzle-orm'

import { recordAudit } from '../audit/record.js'
import {
  permissions,
  refreshTokens,
  rolePermissions,
  tenants,
  userRoles,
  users,
} from '../db/schema/index.js'
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js'
import {
  tenantContextFromLoginEmail,
  tenantContextFromToken,
  type TenantContext,
} from '../tenant/context.js'
import { withTenant, type TenantTransaction } from '../tenant/with-tenant.js'
import { tenantDoEmail } from './login-lookup.js'
import { hashPassword, verifyPassword, wastePasswordTime } from './password.js'
import {
  generateRefreshToken,
  hashRefreshToken,
  parseRefreshTokenTenant,
  refreshTokenExpiresAt,
  signAccessToken,
} from './tokens.js'

export interface AuthenticatedUser {
  id: string
  tenantId: string
  name: string
  email: string
  permissions: string[]
}

/** O estabelecimento da sessão. É dele que o painel tira o endereço para onde ir. */
export interface SessionEstablishment {
  id: string
  slug: string
  name: string
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING'
}

export interface Session {
  accessToken: string
  refreshToken: string
  user: AuthenticatedUser
  establishment: SessionEstablishment
}

/** Carrega as permissões efetivas do usuário, vindas dos papéis dele. */
async function loadPermissions(tx: TenantTransaction, userId: string): Promise<string[]> {
  const linhas = await tx
    .select({ code: permissions.code })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId))

  return [...new Set(linhas.map((linha) => linha.code))].sort()
}

/** O estabelecimento do contexto. `tenants` é o registro global, lido pelo id que o servidor resolveu. */
async function carregarEstabelecimento(
  tx: TenantTransaction,
  context: TenantContext,
): Promise<SessionEstablishment> {
  const [estabelecimento] = await tx
    .select({ id: tenants.id, slug: tenants.slug, name: tenants.name, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, context.tenantId))
    .limit(1)

  // Um usuário só existe dentro de um estabelecimento (FK com cascata).
  if (!estabelecimento) throw new UnauthorizedError('Sessão inválida.')
  return estabelecimento
}

/**
 * Abre uma sessão para o usuário, dentro da transação de quem chama. O login e
 * a renovação usam; o cadastro também, para quem se cadastra já entrar no
 * painel — se a transação do cadastro falhar, a sessão some junto.
 *
 * A sessão leva o estabelecimento: quem entra informa só e-mail e senha, e é
 * daqui que o painel descobre o endereço (`/{slug}/admin/...`).
 */
export async function emitirSessao(
  tx: TenantTransaction,
  context: TenantContext,
  usuario: { id: string; name: string; email: string },
): Promise<Session> {
  const establishment = await carregarEstabelecimento(tx, context)
  const { token, tokenHash } = generateRefreshToken(context.tenantId)

  await tx.insert(refreshTokens).values({
    tenantId: context.tenantId,
    userId: usuario.id,
    tokenHash,
    expiresAt: refreshTokenExpiresAt(),
  })

  return {
    accessToken: signAccessToken({ sub: usuario.id, tenantId: context.tenantId }),
    refreshToken: token,
    user: {
      id: usuario.id,
      tenantId: context.tenantId,
      name: usuario.name,
      email: usuario.email,
      permissions: await loadPermissions(tx, usuario.id),
    },
    establishment,
  }
}

export interface LoginInput {
  email: string
  password: string
}

/**
 * Autentica um usuário administrativo — o dono ou um funcionário — só com
 * e-mail e senha.
 *
 * O estabelecimento não é informado: o e-mail é único na plataforma, e é ele
 * que diz de qual estabelecimento a pessoa é (`tenantDoEmail`). O tenant nunca
 * vem da requisição.
 *
 * A ordem das verificações é deliberada. E-mail inexistente e senha errada
 * respondem a mesma coisa, para que o endpoint não sirva de oráculo de quais
 * e-mails existem. Só **depois** de a senha conferir é que uma conta
 * desativada ou um estabelecimento suspenso recebem uma mensagem específica —
 * aí já não há o que revelar a quem não sabia a senha, e a pessoa merece saber
 * por que não entra em vez de achar que digitou errado.
 */
export async function login(input: LoginInput): Promise<Session> {
  const email = input.email.toLowerCase()
  const tenantId = await tenantDoEmail(email)

  if (!tenantId) {
    await wastePasswordTime()
    throw new UnauthorizedError()
  }

  const context = tenantContextFromLoginEmail(tenantId)

  return withTenant(context, async (tx) => {
    const [usuario] = await tx
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        passwordHash: users.passwordHash,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (!usuario) {
      await wastePasswordTime()
      throw new UnauthorizedError()
    }

    if (!(await verifyPassword(usuario.passwordHash, input.password))) {
      throw new UnauthorizedError()
    }

    if (!usuario.isActive) {
      throw new ForbiddenError('Esta conta está desativada. Fale com o administrador.')
    }

    if ((await carregarEstabelecimento(tx, context)).status === 'SUSPENDED') {
      throw new ForbiddenError('Este estabelecimento está suspenso. Fale com o suporte.')
    }

    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, usuario.id))

    const sessao = await emitirSessao(tx, context, usuario)

    await recordAudit(tx, context, {
      action: 'auth.login',
      entityType: 'user',
      entityId: usuario.id,
      actorUserId: usuario.id,
    })

    return sessao
  })
}

/**
 * Renova a sessão, rotacionando o refresh token.
 *
 * Rotação: o token apresentado é revogado e um novo é emitido. Isso encurta a
 * vida útil de um token roubado e, mais importante, torna o roubo **detectável**
 * — se um token já rotacionado reaparecer, ou o legítimo ou o ladrão está
 * usando uma cópia, e não há como saber qual. A resposta é revogar todas as
 * sessões do usuário e obrigar um login novo. Perder a sessão incomoda; manter
 * um invasor dentro é pior.
 */
export async function refreshSession(refreshToken: string): Promise<Session> {
  const tenantId = parseRefreshTokenTenant(refreshToken)
  if (!tenantId) throw new UnauthorizedError('Sessão inválida.')

  const context = tenantContextFromToken(tenantId)
  const tokenHash = hashRefreshToken(refreshToken)

  const resultado = await withTenant(context, async (tx) => {
    const [registro] = await tx
      .select({
        id: refreshTokens.id,
        userId: refreshTokens.userId,
        expiresAt: refreshTokens.expiresAt,
        revokedAt: refreshTokens.revokedAt,
      })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1)

    if (!registro) throw new UnauthorizedError('Sessão inválida.')

    if (registro.revokedAt) {
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, registro.userId), isNull(refreshTokens.revokedAt)))

      await recordAudit(tx, context, {
        action: 'auth.refresh_reuse_detected',
        entityType: 'user',
        entityId: registro.userId,
        actorUserId: registro.userId,
        metadata: { revokedTokenId: registro.id },
      })

      // O erro NÃO é lançado aqui dentro. `withTenant` é uma transação, e uma
      // exceção causa rollback — desfazendo exatamente a revogação e o
      // registro de auditoria que acabaram de ser escritos. A defesa contra
      // token roubado se anularia, em silêncio.
      //
      // Então a detecção vira um valor de retorno, a transação confirma, e só
      // depois o erro é lançado.
      return { reusoDetectado: true } as const
    }

    if (registro.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError('Sessão expirada. Entre novamente.')
    }

    const [usuario] = await tx
      .select({ id: users.id, name: users.name, email: users.email, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, registro.userId))
      .limit(1)

    if (!usuario?.isActive) throw new UnauthorizedError('Sessão inválida.')

    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, registro.id))

    return { reusoDetectado: false, sessao: await emitirSessao(tx, context, usuario) } as const
  })

  if (resultado.reusoDetectado) {
    throw new UnauthorizedError('Sessão encerrada por segurança. Entre novamente.')
  }

  return resultado.sessao
}

/** Revoga o refresh token apresentado. Idempotente: sair duas vezes não é erro. */
export async function logout(refreshToken: string): Promise<void> {
  const tenantId = parseRefreshTokenTenant(refreshToken)
  if (!tenantId) return

  const context = tenantContextFromToken(tenantId)

  await withTenant(context, async (tx) => {
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.tokenHash, hashRefreshToken(refreshToken)),
          isNull(refreshTokens.revokedAt),
        ),
      )
  })
}

/**
 * Carrega o usuário de um token de acesso já verificado.
 *
 * Consulta o banco a cada requisição em vez de confiar apenas no conteúdo do
 * token. O custo é uma consulta indexada; o que se compra é que desativar um
 * usuário passe a valer **imediatamente**, e não só quando o token dele
 * expirar. Num sistema onde funcionário é desligado, quinze minutos de acesso
 * extra é tempo demais.
 */
export async function loadAuthenticatedUser(
  context: TenantContext,
  userId: string,
): Promise<AuthenticatedUser | null> {
  return withTenant(context, async (tx) => {
    const [usuario] = await tx
      .select({ id: users.id, name: users.name, email: users.email, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!usuario?.isActive) return null

    return {
      id: usuario.id,
      tenantId: context.tenantId,
      name: usuario.name,
      email: usuario.email,
      permissions: await loadPermissions(tx, usuario.id),
    }
  })
}

export { hashPassword }
