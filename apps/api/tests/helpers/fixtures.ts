import { TODAS_AS_PERMISSOES } from '@repo/shared'
import { and, eq, notExists } from 'drizzle-orm'

import { definirEmailDaConta, withAccount, withAccountEmail } from '../../src/accounts/context.js'
import { buscarContaPeloEmail, inserirConta } from '../../src/accounts/repository.js'
import { hashPassword } from '../../src/auth/password.js'
import type { Ator } from '../../src/auth/permissions.js'
import { db } from '../../src/db/index.js'
import {
  accounts,
  profilePermissions,
  profiles,
  tenants,
  users,
} from '../../src/db/schema/index.js'
import { tenantContextFromUser } from '../../src/tenant/context.js'
import { withTenant } from '../../src/tenant/with-tenant.js'

export const SENHA_PADRAO = 'senha-de-teste-123'

/**
 * Quem pode tudo, para chamar direto os serviços que conferem a permissão pelo
 * que o pedido muda. A conferência em si é testada pelas rotas.
 */
export const comTudo = (userId: string): Ator => ({
  id: userId,
  permissions: TODAS_AS_PERMISSOES,
})

export interface TenantDeTeste {
  tenantId: string
  slug: string
  /** O vínculo da pessoa com o estabelecimento (`users.id`). */
  userId: string
  /** A conta da pessoa: o e-mail e a senha. */
  accountId: string
  email: string
  /** O perfil do usuário criado; `null` quando ele é o proprietário. */
  profileId: string | null
}

function sufixo(): string {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Cria um estabelecimento com um usuário do painel.
 *
 * O usuário recebe um perfil só dele, com as permissões pedidas — os códigos
 * do catálogo (`@repo/shared`), como as rotas conferem. Com `dono`, ele é o
 * proprietário: sem perfil, e com todas as permissões.
 *
 * Os perfis são do estabelecimento, então cada chamada cria o seu e nenhum
 * teste disputa linha com outro.
 */
export async function criarTenantComUsuario(
  opcoes: {
    permissoes?: readonly string[]
    dono?: boolean
    ativo?: boolean
    senha?: string
  } = {},
): Promise<TenantDeTeste> {
  const id = sufixo()
  const permissoes = opcoes.permissoes ?? ['products:read']

  const [tenant] = await db
    .insert(tenants)
    .values({ slug: `teste-${id}`, name: `Estabelecimento ${id}` })
    .returning({ id: tenants.id, slug: tenants.slug })
  if (!tenant) throw new Error('falha ao criar tenant de teste')

  const email = `usuario-${id}@exemplo.com`
  const passwordHash = await hashPassword(opcoes.senha ?? SENHA_PADRAO)

  const criado = await withTenant(tenantContextFromUser(tenant.id), async (tx) => {
    let profileId: string | null = null
    if (!opcoes.dono) {
      profileId = await criarPerfilDeTeste(tx, tenant.id, 'Perfil de teste', permissoes)
    }

    const accountId = await criarContaNaTransacao(tx, email, `Usuário ${id}`, passwordHash)
    const [usuario] = await tx
      .insert(users)
      .values({
        tenantId: tenant.id,
        accountId,
        isActive: opcoes.ativo ?? true,
        isOwner: opcoes.dono ?? false,
        profileId,
      })
      .returning({ id: users.id })
    if (!usuario) throw new Error('falha ao criar usuário de teste')

    return { userId: usuario.id, accountId, profileId }
  })

  return { tenantId: tenant.id, slug: tenant.slug, email, ...criado }
}

/**
 * Mais uma pessoa num estabelecimento que já existe, com um perfil só dela.
 * Serve onde a regra depende de quem faz: duas pessoas do mesmo
 * estabelecimento, com permissões diferentes, diante do mesmo dado.
 */
export async function criarColega(
  de: TenantDeTeste,
  permissoes: readonly string[],
): Promise<TenantDeTeste> {
  const id = sufixo()
  const email = `colega-${id}@exemplo.com`
  const passwordHash = await hashPassword(SENHA_PADRAO)

  const criado = await withTenant(tenantContextFromUser(de.tenantId), async (tx) => {
    const profileId = await criarPerfilDeTeste(tx, de.tenantId, `Perfil ${id}`, permissoes)
    const accountId = await criarContaNaTransacao(tx, email, `Colega ${id}`, passwordHash)
    const [usuario] = await tx
      .insert(users)
      .values({ tenantId: de.tenantId, accountId, profileId })
      .returning({ id: users.id })
    if (!usuario) throw new Error('falha ao criar o colega de teste')
    return { userId: usuario.id, accountId, profileId }
  })

  return { tenantId: de.tenantId, slug: de.slug, email, ...criado }
}

/**
 * Põe a conta de uma pessoa na equipe de outro estabelecimento, com um perfil
 * só dela ali — a mesma pessoa em dois lugares, com o mesmo e-mail e a mesma
 * senha. Devolve o vínculo novo.
 */
export async function vincularConta(
  quem: TenantDeTeste,
  em: TenantDeTeste,
  opcoes: { permissoes?: readonly string[]; ativo?: boolean; dono?: boolean } = {},
): Promise<TenantDeTeste> {
  const criado = await withTenant(tenantContextFromUser(em.tenantId), async (tx) => {
    const profileId = opcoes.dono
      ? null
      : await criarPerfilDeTeste(
          tx,
          em.tenantId,
          `Perfil ${sufixo()}`,
          opcoes.permissoes ?? ['products:read'],
        )
    const [usuario] = await tx
      .insert(users)
      .values({
        tenantId: em.tenantId,
        accountId: quem.accountId,
        profileId,
        isOwner: opcoes.dono ?? false,
        isActive: opcoes.ativo ?? true,
      })
      .returning({ id: users.id })
    if (!usuario) throw new Error('falha ao vincular a conta de teste')
    return { userId: usuario.id, profileId }
  })

  return {
    tenantId: em.tenantId,
    slug: em.slug,
    email: quem.email,
    accountId: quem.accountId,
    ...criado,
  }
}

type TransacaoDeTenant = Parameters<Parameters<typeof withTenant>[1]>[0]

/** Uma conta, criada pelo mesmo caminho do código: com o e-mail dela no contexto (`conta_nova`). */
async function criarContaNaTransacao(
  tx: TransacaoDeTenant,
  email: string,
  nome: string,
  passwordHash: string,
): Promise<string> {
  await definirEmailDaConta(tx, email)
  return inserirConta(tx, { email, name: nome, passwordHash })
}

/** Um perfil com as permissões dadas, gravadas como vieram. */
export async function criarPerfilDeTeste(
  tx: TransacaoDeTenant,
  tenantId: string,
  nome: string,
  permissoes: readonly string[],
): Promise<string> {
  const [perfil] = await tx
    .insert(profiles)
    .values({ tenantId, name: nome })
    .returning({ id: profiles.id })
  if (!perfil) throw new Error('falha ao criar perfil de teste')
  if (permissoes.length > 0) {
    await tx
      .insert(profilePermissions)
      .values(permissoes.map((permission) => ({ tenantId, profileId: perfil.id, permission })))
  }
  return perfil.id
}

/**
 * Remove tudo que `criarTenantComUsuario` criou: o estabelecimento leva o resto
 * em cascata. As contas não são do estabelecimento — são globais —, então saem
 * à parte: as da equipe dele que ficaram sem vínculo nenhum.
 */
export async function removerTenantDeTeste(fixture: TenantDeTeste): Promise<void> {
  const contas = await withTenant(tenantContextFromUser(fixture.tenantId), (tx) =>
    tx.select({ id: users.accountId }).from(users),
  )
  await db.delete(tenants).where(eq(tenants.id, fixture.tenantId))
  for (const { id } of contas) await removerContaSemVinculo(id)
}

/** Apaga as contas destes e-mails que ficaram sem vínculo — as que um teste criou pela API. */
export async function removerContasSemVinculo(emails: readonly string[]): Promise<void> {
  for (const email of emails) {
    const minusculo = email.toLowerCase()
    const conta = await withAccountEmail(minusculo, (tx) => buscarContaPeloEmail(tx, minusculo))
    if (conta) await removerContaSemVinculo(conta.id)
  }
}

/** Apaga a conta, se ela não tiver mais vínculo em estabelecimento nenhum. */
export async function removerContaSemVinculo(accountId: string): Promise<void> {
  await withAccount(accountId, (tx) =>
    tx
      .delete(accounts)
      .where(
        and(
          eq(accounts.id, accountId),
          notExists(tx.select().from(users).where(eq(users.accountId, accountId))),
        ),
      ),
  )
}

/**
 * A sessão devolvida pelo login ou pela renovação, com o refresh token lido do
 * cookie — ele não vem mais no corpo da resposta.
 */
export function sessaoDe<T extends object>(resposta: {
  json: <R>() => R
  cookies: { name: string; value: string }[]
}): T & { refreshToken: string } {
  const cookie = resposta.cookies.find((c) => c.name === 'refresh_token')
  return { ...resposta.json<T>(), refreshToken: cookie?.value ?? '' }
}
