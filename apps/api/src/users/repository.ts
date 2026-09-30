import { and, asc, eq, isNull, sql } from 'drizzle-orm'

import { refreshTokens, roles, userRoles, users } from '../db/schema/index.js'
import type { TenantTransaction } from '../tenant/with-tenant.js'

/**
 * Usuários do painel. Recebem a transação no contexto do tenant — o filtro por
 * estabelecimento é do RLS; `roles` é catálogo global.
 */

export interface UsuarioComPapel {
  id: string
  name: string
  email: string
  isActive: boolean
  lastLoginAt: Date | null
  createdAt: Date
  papel: { codigo: string; nome: string } | null
}

const colunas = {
  id: users.id,
  name: users.name,
  email: users.email,
  isActive: users.isActive,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
  papelCodigo: roles.code,
  papelNome: roles.name,
}

type Linha = {
  [K in keyof typeof colunas]: (typeof colunas)[K]['_']['data'] | null
}

function montar(linha: Linha): UsuarioComPapel {
  return {
    id: linha.id ?? '',
    name: linha.name ?? '',
    email: linha.email ?? '',
    isActive: linha.isActive ?? false,
    lastLoginAt: linha.lastLoginAt,
    createdAt: linha.createdAt ?? new Date(0),
    papel: linha.papelCodigo ? { codigo: linha.papelCodigo, nome: linha.papelNome ?? '' } : null,
  }
}

export async function listarUsuarios(tx: TenantTransaction): Promise<UsuarioComPapel[]> {
  const linhas = await tx
    .select(colunas)
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .orderBy(asc(roles.sortOrder), asc(users.name))
  return linhas.map(montar)
}

export async function buscarUsuario(
  tx: TenantTransaction,
  id: string,
): Promise<UsuarioComPapel | null> {
  const [linha] = await tx
    .select(colunas)
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(users.id, id))
    .limit(1)
  return linha ? montar(linha) : null
}

export async function buscarPapel(
  tx: TenantTransaction,
  codigo: string,
): Promise<{ id: string } | null> {
  const [papel] = await tx
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.code, codigo))
    .limit(1)
  return papel ?? null
}

export async function inserirUsuario(
  tx: TenantTransaction,
  dados: { tenantId: string; name: string; email: string; passwordHash: string },
): Promise<string> {
  const [criado] = await tx.insert(users).values(dados).returning({ id: users.id })
  if (!criado) throw new Error('usuário não foi criado')
  return criado.id
}

/** Um papel por usuário: o novo substitui o anterior. */
export async function definirPapel(
  tx: TenantTransaction,
  tenantId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  await tx.delete(userRoles).where(eq(userRoles.userId, userId))
  await tx.insert(userRoles).values({ tenantId, userId, roleId })
}

export async function alterarNome(tx: TenantTransaction, id: string, nome: string): Promise<void> {
  await tx
    .update(users)
    .set({ name: nome, updatedAt: sql`now()` })
    .where(eq(users.id, id))
}

export async function definirAtivo(
  tx: TenantTransaction,
  id: string,
  ativo: boolean,
): Promise<void> {
  await tx
    .update(users)
    .set({ isActive: ativo, updatedAt: sql`now()` })
    .where(eq(users.id, id))
}

/**
 * Revoga todas as sessões do usuário. O token de acesso ainda aberto deixa de
 * valer na próxima requisição (o usuário é recarregado a cada uma); sem
 * refresh, a sessão não se renova.
 */
export async function revogarSessoes(tx: TenantTransaction, userId: string): Promise<void> {
  await tx
    .update(refreshTokens)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
}
