import { TODAS_AS_PERMISSOES } from '@repo/shared'
import { and, eq, isNull } from 'drizzle-orm'

import { withAccount, withAccountEmail } from '../accounts/context.js'
import { buscarContaPeloEmail, vinculosDaConta } from '../accounts/repository.js'
import { recordAudit } from '../audit/record.js'
import { accounts, profilePermissions, refreshTokens, tenants, users } from '../db/schema/index.js'
import { AppError, ForbiddenError, UnauthorizedError } from '../lib/errors.js'
import {
  tenantContextFromAccount,
  tenantContextFromToken,
  type TenantContext,
} from '../tenant/context.js'
import { withTenant, type TenantTransaction } from '../tenant/with-tenant.js'
import { decidirEntrada, MENSAGEM_DA_RECUSA, vinculoQueEntra } from './login-decision.js'
import { hashPassword, verifyPassword, wastePasswordTime } from './password.js'
import {
  generateRefreshToken,
  hashRefreshToken,
  parseRefreshTokenTenant,
  refreshTokenExpiresAt,
  signAccessToken,
} from './tokens.js'

/**
 * Quem está na sessão: o vínculo (`id`, o de `users`) no estabelecimento da
 * sessão, com o nome e o e-mail da conta.
 */
export interface UsuarioDaSessao {
  id: string
  tenantId: string
  name: string
  email: string
  permissions: string[]
}

/** O usuário de cada requisição: o da sessão, e a conta dele — a mesma em todos os estabelecimentos. */
export interface AuthenticatedUser extends UsuarioDaSessao {
  accountId: string
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
  user: UsuarioDaSessao
  establishment: SessionEstablishment
}

/**
 * As permissões efetivas do usuário: todas, se é o proprietário; senão, as do
 * perfil dele. Só os códigos do catálogo, na ordem dele — uma permissão que
 * saiu do catálogo e ficou gravada num perfil não vale mais nada.
 *
 * É lido a cada requisição (`loadAuthenticatedUser`): mudar o perfil de alguém,
 * ou as permissões de um perfil, vale na requisição seguinte.
 */
async function loadPermissions(tx: TenantTransaction, userId: string): Promise<string[]> {
  const [usuario] = await tx
    .select({ isOwner: users.isOwner, profileId: users.profileId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!usuario) return []
  if (usuario.isOwner) return [...TODAS_AS_PERMISSOES]
  if (!usuario.profileId) return []

  const linhas = await tx
    .select({ permission: profilePermissions.permission })
    .from(profilePermissions)
    .where(eq(profilePermissions.profileId, usuario.profileId))
  const gravadas = new Set(linhas.map((linha) => linha.permission))
  return TODAS_AS_PERMISSOES.filter((codigo) => gravadas.has(codigo))
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
 * O vínculo, com o nome e o e-mail da conta dele, no estabelecimento do
 * contexto. A conta aparece pela policy `contas_da_equipe`: ela tem vínculo
 * aqui.
 */
async function carregarVinculo(tx: TenantTransaction, userId: string) {
  const [vinculo] = await tx
    .select({
      id: users.id,
      accountId: users.accountId,
      isActive: users.isActive,
      name: accounts.name,
      email: accounts.email,
    })
    .from(users)
    .innerJoin(accounts, eq(accounts.id, users.accountId))
    .where(eq(users.id, userId))
    .limit(1)
  return vinculo ?? null
}

/**
 * Abre uma sessão para o usuário, dentro da transação de quem chama. O login e
 * a renovação usam; o cadastro também, para quem se cadastra já entrar no
 * painel — se a transação do cadastro falhar, a sessão some junto.
 *
 * A sessão é de um estabelecimento, e o leva: quem entra informa só e-mail e
 * senha, e é daqui que o painel descobre o endereço (`/{slug}/admin/...`).
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
 * Autentica uma pessoa da equipe — o dono ou um funcionário — só com e-mail e
 * senha.
 *
 * O e-mail e a senha são da **conta**, uma só em todos os estabelecimentos em
 * que a pessoa trabalha. A senha é conferida uma vez, na conta; depois, a
 * pessoa entra no estabelecimento que usou por último (`decidirEntrada`), e
 * troca de um para outro pelo painel (`trocarDeEstabelecimento`). O tenant
 * nunca vem da requisição: sai dos vínculos da conta, lidos do banco.
 *
 * A ordem das verificações é deliberada. E-mail inexistente e senha errada
 * respondem a mesma coisa, para que o endpoint não sirva de oráculo de quais
 * e-mails existem. Só **depois** de a senha conferir é que um acesso
 * desativado ou um estabelecimento suspenso recebem uma mensagem específica —
 * aí já não há o que revelar a quem não sabia a senha, e a pessoa merece saber
 * por que não entra em vez de achar que digitou errado.
 */
export async function login(input: LoginInput): Promise<Session> {
  const email = input.email.toLowerCase()
  const conta = await withAccountEmail(email, (tx) => buscarContaPeloEmail(tx, email))

  if (!conta) {
    await wastePasswordTime()
    throw new UnauthorizedError()
  }

  // Fora de transação: o argon2 é lento de propósito, e não precisa segurar
  // uma conexão do pool enquanto calcula.
  if (!(await verifyPassword(conta.passwordHash, input.password))) {
    throw new UnauthorizedError()
  }

  const decisao = decidirEntrada(await withAccount(conta.id, (tx) => vinculosDaConta(tx, conta.id)))
  if (decisao.tipo === 'recusar') throw new ForbiddenError(MENSAGEM_DA_RECUSA[decisao.motivo])

  return entrarNoVinculo(decisao.vinculo, 'login')
}

/**
 * Abre a sessão num vínculo que a conta escolheu — pelo login ou pela troca.
 *
 * A escolha foi feita noutra transação, sem estabelecimento no contexto. Aqui,
 * já dentro dele, o vínculo é conferido de novo: desativado ou suspenso no
 * meio do caminho, ninguém entra.
 */
async function entrarNoVinculo(
  vinculo: { tenantId: string; userId: string },
  como: 'login' | 'troca',
): Promise<Session> {
  const context = tenantContextFromAccount(vinculo.tenantId)

  return withTenant(context, async (tx) => {
    const usuario = await carregarVinculo(tx, vinculo.userId)
    if (!usuario?.isActive || (await carregarEstabelecimento(tx, context)).status === 'SUSPENDED') {
      throw new UnauthorizedError()
    }

    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, usuario.id))

    const sessao = await emitirSessao(tx, context, usuario)

    // O registro fica em cada estabelecimento e não diz de qual a pessoa veio:
    // quem lê a auditoria de um não fica sabendo onde mais ela trabalha.
    await recordAudit(tx, context, {
      action: 'auth.login',
      entityType: 'user',
      entityId: usuario.id,
      actorUserId: usuario.id,
      ...(como === 'troca' && { metadata: { via: 'troca de estabelecimento' } }),
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

    // Estabelecimento suspenso não renova sessão. A suspensão já apaga as
    // sessões abertas; esta é a segunda barreira, e vem **antes** da detecção
    // de reuso para a recusa não virar um alerta de roubo.
    if ((await carregarEstabelecimento(tx, context)).status === 'SUSPENDED') {
      throw new UnauthorizedError('Sessão inválida.')
    }

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

    const usuario = await carregarVinculo(tx, registro.userId)
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
 * Troca a sessão de estabelecimento, sem pedir a senha de novo.
 *
 * Quem prova a conta é a sessão de agora — o refresh token do cookie, como na
 * renovação. O endereço pedido só **escolhe** entre os estabelecimentos em que
 * a conta tem um vínculo que entra (ativo, num estabelecimento não suspenso):
 * o de quem não é da equipe, ou foi desativado, responde 403, e o tenant da
 * sessão nova vem dos vínculos lidos do banco.
 *
 * A sessão nova abre antes de a anterior acabar: se a troca falhar no meio, a
 * pessoa continua onde estava. A anterior é revogada, como na rotação — um
 * token dela que reapareça é sinal de cópia.
 */
export async function trocarDeEstabelecimento(
  refreshToken: string,
  slug: string,
): Promise<Session> {
  const tenantId = parseRefreshTokenTenant(refreshToken)
  if (!tenantId) throw new UnauthorizedError('Sessão inválida.')

  const context = tenantContextFromToken(tenantId)
  const tokenHash = hashRefreshToken(refreshToken)

  const atual = await withTenant(context, async (tx) => {
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

    if (!registro || registro.revokedAt || registro.expiresAt.getTime() <= Date.now()) return null
    if ((await carregarEstabelecimento(tx, context)).status === 'SUSPENDED') return null

    const usuario = await carregarVinculo(tx, registro.userId)
    return usuario?.isActive ? { tokenId: registro.id, accountId: usuario.accountId } : null
  })

  if (!atual) throw new UnauthorizedError('Sessão inválida.')

  const vinculos = await withAccount(atual.accountId, (tx) => vinculosDaConta(tx, atual.accountId))
  const destino = vinculos.find((vinculo) => vinculo.slug === slug && vinculoQueEntra(vinculo))
  if (!destino) {
    throw new AppError('Você não tem acesso a este estabelecimento.', 403, 'NO_ACCESS')
  }

  const sessao = await entrarNoVinculo(destino, 'troca')

  await withTenant(context, async (tx) => {
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, atual.tokenId), isNull(refreshTokens.revokedAt)))
  })

  return sessao
}

/** Um estabelecimento em que a conta entra, para a troca pelo menu do painel. */
export interface EstabelecimentoDaConta {
  slug: string
  name: string
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING'
  /** É o da sessão de agora. */
  current: boolean
}

/**
 * Os estabelecimentos em que a conta da sessão entra, por nome. Os outros
 * vínculos — desativados, ou em estabelecimento suspenso — não aparecem: a
 * troca para eles seria recusada.
 */
export async function estabelecimentosDaConta(
  usuario: AuthenticatedUser,
): Promise<EstabelecimentoDaConta[]> {
  const vinculos = await withAccount(usuario.accountId, (tx) =>
    vinculosDaConta(tx, usuario.accountId),
  )
  return vinculos
    .filter(vinculoQueEntra)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((vinculo) => ({
      slug: vinculo.slug,
      name: vinculo.nome,
      status: vinculo.status,
      current: vinculo.tenantId === usuario.tenantId,
    }))
}

/**
 * Carrega o usuário de um token de acesso já verificado.
 *
 * Consulta o banco a cada requisição em vez de confiar apenas no conteúdo do
 * token. O custo é uma consulta indexada; o que se compra é que desativar um
 * usuário passe a valer **imediatamente**, e não só quando o token dele
 * expirar. Num sistema onde funcionário é desligado, quinze minutos de acesso
 * extra é tempo demais.
 *
 * O mesmo vale para o estabelecimento: suspenso pela plataforma, nenhum usuário
 * dele é carregado — a suspensão corta quem já estava logado na requisição
 * seguinte, na mesma consulta.
 */
export async function loadAuthenticatedUser(
  context: TenantContext,
  userId: string,
): Promise<AuthenticatedUser | null> {
  return withTenant(context, async (tx) => {
    const [usuario] = await tx
      .select({
        id: users.id,
        accountId: users.accountId,
        name: accounts.name,
        email: accounts.email,
        isActive: users.isActive,
        statusDoEstabelecimento: tenants.status,
      })
      .from(users)
      .innerJoin(accounts, eq(accounts.id, users.accountId))
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .where(eq(users.id, userId))
      .limit(1)

    if (!usuario?.isActive || usuario.statusDoEstabelecimento === 'SUSPENDED') return null

    return {
      id: usuario.id,
      tenantId: context.tenantId,
      accountId: usuario.accountId,
      name: usuario.name,
      email: usuario.email,
      permissions: await loadPermissions(tx, usuario.id),
    }
  })
}

export { hashPassword }
