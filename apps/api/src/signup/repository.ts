import { and, desc, eq, isNull } from 'drizzle-orm'

import {
  accounts,
  emailVerificationTokens,
  plans,
  subscriptions,
  tenants,
  users,
} from '../db/schema/index.js'
import type { TenantTransaction } from '../tenant/with-tenant.js'

/**
 * Acesso a dados do cadastro. Recebe a transação, nunca abre a sua.
 *
 * Toda escrita em tabela com escopo de tenant roda na transação do contexto do
 * estabelecimento, sob RLS. `tenants` e `plans` não têm RLS — são o
 * registro de estabelecimentos e os catálogos da plataforma.
 */

export async function buscarPlanoAtivo(
  tx: TenantTransaction,
  codigo: string,
): Promise<{ id: string } | null> {
  const [plano] = await tx
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.code, codigo), eq(plans.isActive, true)))
    .limit(1)
  return plano ?? null
}

export async function inserirEstabelecimento(
  tx: TenantTransaction,
  dados: {
    id: string
    slug: string
    name: string
    timezone: string
    status: 'PENDING' | 'ACTIVE'
  },
): Promise<void> {
  await tx.insert(tenants).values(dados)
}

export async function inserirAssinatura(
  tx: TenantTransaction,
  tenantId: string,
  planId: string,
): Promise<void> {
  await tx.insert(subscriptions).values({ tenantId, planId })
}

/**
 * O vínculo do proprietário: quem cadastra o estabelecimento. Tem todas as
 * permissões e não tem perfil. A conta já existe — nova, ou de quem já tinha.
 */
export async function inserirDono(
  tx: TenantTransaction,
  dados: { tenantId: string; accountId: string },
): Promise<{ id: string }> {
  const [dono] = await tx
    .insert(users)
    .values({ ...dados, isOwner: true })
    .returning({ id: users.id })
  if (!dono) throw new Error('o dono do estabelecimento não foi criado')
  return dono
}

/** O proprietário do estabelecimento — quem o cadastrou —, com o e-mail da conta dele. */
export async function buscarDono(
  tx: TenantTransaction,
): Promise<{ id: string; accountId: string; email: string } | null> {
  const [dono] = await tx
    .select({ id: users.id, accountId: users.accountId, email: accounts.email })
    .from(users)
    .innerJoin(accounts, eq(accounts.id, users.accountId))
    .where(eq(users.isOwner, true))
    .limit(1)
  return dono ?? null
}

export interface EstabelecimentoDoCadastro {
  slug: string
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING'
}

export async function buscarEstabelecimento(
  tx: TenantTransaction,
  tenantId: string,
): Promise<EstabelecimentoDoCadastro | null> {
  const [estabelecimento] = await tx
    .select({ slug: tenants.slug, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  return estabelecimento ?? null
}

/** Só sai de `PENDING`: um estabelecimento suspenso continua suspenso. */
export async function publicarEstabelecimento(
  tx: TenantTransaction,
  tenantId: string,
): Promise<boolean> {
  const publicados = await tx
    .update(tenants)
    .set({ status: 'ACTIVE', updatedAt: new Date() })
    .where(and(eq(tenants.id, tenantId), eq(tenants.status, 'PENDING')))
    .returning({ id: tenants.id })
  return publicados.length > 0
}

export async function inserirTokenDeConfirmacao(
  tx: TenantTransaction,
  dados: {
    tenantId: string
    userId: string
    email: string
    tokenHash: string
    expiresAt: Date
  },
): Promise<void> {
  await tx.insert(emailVerificationTokens).values(dados)
}

export async function buscarTokenDeConfirmacao(tx: TenantTransaction, tokenHash: string) {
  const [token] = await tx
    .select({
      id: emailVerificationTokens.id,
      userId: emailVerificationTokens.userId,
      email: emailVerificationTokens.email,
      expiresAt: emailVerificationTokens.expiresAt,
      usedAt: emailVerificationTokens.usedAt,
    })
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.tokenHash, tokenHash))
    .limit(1)
  return token ?? null
}

export async function marcarTokenUsado(tx: TenantTransaction, id: string): Promise<void> {
  await tx
    .update(emailVerificationTokens)
    .set({ usedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(emailVerificationTokens.id, id), isNull(emailVerificationTokens.usedAt)))
}

/** Quando saiu o último link, para o reenvio respeitar um intervalo. */
export async function ultimoEnvio(tx: TenantTransaction, userId: string): Promise<Date | null> {
  const [ultimo] = await tx
    .select({ criadoEm: emailVerificationTokens.createdAt })
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, userId))
    .orderBy(desc(emailVerificationTokens.createdAt))
    .limit(1)
  return ultimo?.criadoEm ?? null
}

/** A conta de um vínculo do estabelecimento. */
export async function contaDoVinculo(
  tx: TenantTransaction,
  userId: string,
): Promise<string | null> {
  const [vinculo] = await tx
    .select({ accountId: users.accountId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return vinculo?.accountId ?? null
}
