import { and, eq, sql } from 'drizzle-orm'

import { accounts, tenants, users } from '../db/schema/index.js'
import type { TenantTransaction } from '../tenant/with-tenant.js'

/**
 * Acesso às contas e aos vínculos delas. Recebe a transação, nunca abre a sua:
 * quem chama define antes o contexto (`accounts/context.ts`), e é ele que diz
 * qual conta aparece.
 */

export interface ContaComSenha {
  id: string
  email: string
  name: string
  passwordHash: string
  emailVerifiedAt: Date | null
}

/** A conta do e-mail. Só aparece com `app.account_email` definido para ele. */
export async function buscarContaPeloEmail(
  tx: TenantTransaction,
  email: string,
): Promise<ContaComSenha | null> {
  const [conta] = await tx
    .select({
      id: accounts.id,
      email: accounts.email,
      name: accounts.name,
      passwordHash: accounts.passwordHash,
      emailVerifiedAt: accounts.emailVerifiedAt,
    })
    .from(accounts)
    .where(eq(accounts.email, email))
    .limit(1)
  return conta ?? null
}

/** A conta do id. Aparece a própria conta (`app.account_id`) ou a de alguém da equipe do contexto. */
export async function buscarConta(
  tx: TenantTransaction,
  id: string,
): Promise<{ id: string; email: string; name: string } | null> {
  const [conta] = await tx
    .select({ id: accounts.id, email: accounts.email, name: accounts.name })
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1)
  return conta ?? null
}

/** Cria a conta. Só passa com `app.account_email` definido para o mesmo e-mail (`conta_nova`). */
export async function inserirConta(
  tx: TenantTransaction,
  dados: { email: string; name: string; passwordHash: string; emailVerifiedAt?: Date | null },
): Promise<string> {
  const [conta] = await tx.insert(accounts).values(dados).returning({ id: accounts.id })
  if (!conta) throw new Error('a conta não foi criada')
  return conta.id
}

/**
 * Marca o e-mail da conta como confirmado — se ainda for o mesmo para o qual o
 * link foi enviado. Devolve se a conta ainda tem aquele e-mail. Precisa de
 * `app.account_id` definido para ela (`conta_propria`).
 */
export async function marcarEmailConfirmado(
  tx: TenantTransaction,
  accountId: string,
  email: string,
): Promise<boolean> {
  const atualizadas = await tx
    .update(accounts)
    .set({
      emailVerifiedAt: sql`coalesce(${accounts.emailVerifiedAt}, now())`,
      updatedAt: new Date(),
    })
    .where(and(eq(accounts.id, accountId), eq(accounts.email, email)))
    .returning({ id: accounts.id })
  return atualizadas.length > 0
}

/** Um vínculo da conta, com o estabelecimento dele. */
export interface VinculoDaConta {
  userId: string
  tenantId: string
  slug: string
  nome: string
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING'
  isActive: boolean
  isOwner: boolean
  lastLoginAt: Date | null
  createdAt: Date
}

/**
 * Os vínculos da conta, em todos os estabelecimentos. Só funciona em
 * `withAccount`: sem estabelecimento no contexto, `users` mostra os vínculos da
 * conta e nada mais. O filtro pelo id é a segunda barreira, e não a primeira.
 */
export async function vinculosDaConta(
  tx: TenantTransaction,
  accountId: string,
): Promise<VinculoDaConta[]> {
  return tx
    .select({
      userId: users.id,
      tenantId: users.tenantId,
      slug: tenants.slug,
      nome: tenants.name,
      status: tenants.status,
      isActive: users.isActive,
      isOwner: users.isOwner,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .innerJoin(tenants, eq(tenants.id, users.tenantId))
    .where(eq(users.accountId, accountId))
}
