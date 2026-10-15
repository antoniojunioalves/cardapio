import { and, count, desc, eq, gte, inArray } from 'drizzle-orm'

import { accounts, auditLogs, invitations, profiles, tenants, users } from '../db/schema/index.js'
import type { TenantTransaction } from '../tenant/with-tenant.js'

/**
 * Acesso aos convites para a equipe. Recebe a transação no contexto do
 * estabelecimento — o filtro é do RLS.
 */

export interface ConviteDoPainel {
  id: string
  email: string
  perfil: { id: string; nome: string }
  /** Quem convidou — `null` se o vínculo dele não aparece mais (não acontece hoje: ninguém é apagado). */
  convidadoPor: string | null
  expiresAt: Date
  /** Quando o último e-mail saiu: a criação ou o reenvio mais recente. */
  enviadoEm: Date
  createdAt: Date
}

const colunas = {
  id: invitations.id,
  email: invitations.email,
  perfilId: profiles.id,
  perfilNome: profiles.name,
  convidadoPor: accounts.name,
  expiresAt: invitations.expiresAt,
  enviadoEm: invitations.updatedAt,
  createdAt: invitations.createdAt,
}

function montar(linha: {
  id: string
  email: string
  perfilId: string
  perfilNome: string
  convidadoPor: string | null
  expiresAt: Date
  enviadoEm: Date
  createdAt: Date
}): ConviteDoPainel {
  return {
    id: linha.id,
    email: linha.email,
    perfil: { id: linha.perfilId, nome: linha.perfilNome },
    convidadoPor: linha.convidadoPor,
    expiresAt: linha.expiresAt,
    enviadoEm: linha.enviadoEm,
    createdAt: linha.createdAt,
  }
}

function consulta(tx: TenantTransaction) {
  return tx
    .select(colunas)
    .from(invitations)
    .innerJoin(profiles, eq(profiles.id, invitations.profileId))
    .leftJoin(users, eq(users.id, invitations.invitedByUserId))
    .leftJoin(accounts, eq(accounts.id, users.accountId))
}

/** Os convites pendentes, do mais novo para o mais antigo. */
export async function listarConvites(tx: TenantTransaction): Promise<ConviteDoPainel[]> {
  const linhas = await consulta(tx).orderBy(desc(invitations.createdAt))
  return linhas.map(montar)
}

export async function buscarConvite(
  tx: TenantTransaction,
  id: string,
): Promise<ConviteDoPainel | null> {
  const [linha] = await consulta(tx).where(eq(invitations.id, id)).limit(1)
  return linha ? montar(linha) : null
}

export async function buscarConviteDoEmail(
  tx: TenantTransaction,
  email: string,
): Promise<{ id: string } | null> {
  const [linha] = await tx
    .select({ id: invitations.id })
    .from(invitations)
    .where(eq(invitations.email, email))
    .limit(1)
  return linha ?? null
}

export interface ConviteDoToken {
  id: string
  email: string
  profileId: string
  perfilNome: string
  convidadoPor: string | null
  expiresAt: Date
  estabelecimento: { nome: string; slug: string; status: 'ACTIVE' | 'SUSPENDED' | 'PENDING' }
}

/**
 * O convite do link, com o estabelecimento e o perfil. `travar` segura a linha
 * até o fim da transação: dois aceites ao mesmo tempo não viram dois vínculos.
 */
export async function buscarConvitePeloToken(
  tx: TenantTransaction,
  tokenHash: string,
  opcoes: { travar?: boolean } = {},
): Promise<ConviteDoToken | null> {
  const selecao = tx
    .select({
      id: invitations.id,
      email: invitations.email,
      profileId: invitations.profileId,
      perfilNome: profiles.name,
      convidadoPor: accounts.name,
      expiresAt: invitations.expiresAt,
      estabelecimentoNome: tenants.name,
      estabelecimentoSlug: tenants.slug,
      estabelecimentoStatus: tenants.status,
    })
    .from(invitations)
    .innerJoin(profiles, eq(profiles.id, invitations.profileId))
    .innerJoin(tenants, eq(tenants.id, invitations.tenantId))
    .leftJoin(users, eq(users.id, invitations.invitedByUserId))
    .leftJoin(accounts, eq(accounts.id, users.accountId))
    .where(eq(invitations.tokenHash, tokenHash))
    .limit(1)
  const [linha] = await (opcoes.travar ? selecao.for('update', { of: invitations }) : selecao)
  if (!linha) return null
  return {
    id: linha.id,
    email: linha.email,
    profileId: linha.profileId,
    perfilNome: linha.perfilNome,
    convidadoPor: linha.convidadoPor,
    expiresAt: linha.expiresAt,
    estabelecimento: {
      nome: linha.estabelecimentoNome,
      slug: linha.estabelecimentoSlug,
      status: linha.estabelecimentoStatus,
    },
  }
}

export async function inserirConvite(
  tx: TenantTransaction,
  dados: {
    tenantId: string
    email: string
    profileId: string
    invitedByUserId: string
    tokenHash: string
    expiresAt: Date
  },
): Promise<string> {
  const [criado] = await tx.insert(invitations).values(dados).returning({ id: invitations.id })
  if (!criado) throw new Error('o convite não foi criado')
  return criado.id
}

/** Um link novo para o mesmo convite: o anterior deixa de valer, e o prazo recomeça. */
export async function renovarConvite(
  tx: TenantTransaction,
  id: string,
  dados: { tokenHash: string; expiresAt: Date },
): Promise<void> {
  await tx
    .update(invitations)
    .set({ ...dados, updatedAt: new Date() })
    .where(eq(invitations.id, id))
}

export async function excluirConvite(tx: TenantTransaction, id: string): Promise<void> {
  await tx.delete(invitations).where(eq(invitations.id, id))
}

/** Todos os convites pendentes, vencidos ou não: é o que o teto conta. */
export async function contarConvites(tx: TenantTransaction): Promise<number> {
  const [linha] = await tx.select({ total: count() }).from(invitations)
  return linha?.total ?? 0
}

export async function contarConvitesDoPerfil(
  tx: TenantTransaction,
  profileId: string,
): Promise<number> {
  const [linha] = await tx
    .select({ total: count() })
    .from(invitations)
    .where(eq(invitations.profileId, profileId))
  return linha?.total ?? 0
}

/**
 * Quantos e-mails de convite o estabelecimento mandou desde `desde`, criando ou
 * reenviando. Contados pela auditoria, que guarda cada envio — mesmo o de um
 * convite que já foi cancelado.
 */
export async function contarEnviosDesde(tx: TenantTransaction, desde: Date): Promise<number> {
  const [linha] = await tx
    .select({ total: count() })
    .from(auditLogs)
    .where(
      and(
        inArray(auditLogs.action, ['invitation.created', 'invitation.resent']),
        gte(auditLogs.createdAt, desde),
      ),
    )
  return linha?.total ?? 0
}
