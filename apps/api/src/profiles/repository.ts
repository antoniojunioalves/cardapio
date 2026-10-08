import { completarPermissoes, PERFIS_PRONTOS } from '@repo/shared'
import { asc, count, eq, sql } from 'drizzle-orm'

import { profilePermissions, profiles, users } from '../db/schema/index.js'
import type { TenantTransaction } from '../tenant/with-tenant.js'

/**
 * Perfis do estabelecimento. Recebem a transação no contexto do tenant — o
 * filtro por estabelecimento é do RLS.
 */

export interface Perfil {
  id: string
  name: string
  description: string | null
  /** Só os códigos do catálogo, na ordem dele. */
  permissions: string[]
  /** Quantas pessoas têm o perfil, ativas ou não: é o que impede de excluí-lo. */
  users: number
}

async function permissoesPorPerfil(tx: TenantTransaction): Promise<Map<string, string[]>> {
  const linhas = await tx
    .select({ profileId: profilePermissions.profileId, permission: profilePermissions.permission })
    .from(profilePermissions)
  const mapa = new Map<string, string[]>()
  for (const linha of linhas) {
    mapa.set(linha.profileId, [...(mapa.get(linha.profileId) ?? []), linha.permission])
  }
  return mapa
}

export async function listarPerfis(tx: TenantTransaction): Promise<Perfil[]> {
  const linhas = await tx
    .select({
      id: profiles.id,
      name: profiles.name,
      description: profiles.description,
      users: count(users.id),
    })
    .from(profiles)
    .leftJoin(users, eq(users.profileId, profiles.id))
    .groupBy(profiles.id)
    .orderBy(asc(sql`lower(${profiles.name})`))
  const permissoes = await permissoesPorPerfil(tx)

  return linhas.map((linha) => ({
    ...linha,
    permissions: completarPermissoes(permissoes.get(linha.id) ?? []),
  }))
}

export async function buscarPerfil(tx: TenantTransaction, id: string): Promise<Perfil | null> {
  return (await listarPerfis(tx)).find((perfil) => perfil.id === id) ?? null
}

export async function contarPerfis(tx: TenantTransaction): Promise<number> {
  const [linha] = await tx.select({ total: count() }).from(profiles)
  return linha?.total ?? 0
}

export async function inserirPerfil(
  tx: TenantTransaction,
  dados: { tenantId: string; name: string; description: string | null },
): Promise<string> {
  const [criado] = await tx.insert(profiles).values(dados).returning({ id: profiles.id })
  if (!criado) throw new Error('perfil não foi criado')
  return criado.id
}

export async function alterarPerfil(
  tx: TenantTransaction,
  id: string,
  dados: { name: string; description: string | null },
): Promise<void> {
  await tx
    .update(profiles)
    .set({ ...dados, updatedAt: sql`now()` })
    .where(eq(profiles.id, id))
}

/** As permissões do perfil: a lista nova substitui a anterior. */
export async function definirPermissoes(
  tx: TenantTransaction,
  tenantId: string,
  profileId: string,
  permissoes: readonly string[],
): Promise<void> {
  await tx.delete(profilePermissions).where(eq(profilePermissions.profileId, profileId))
  if (permissoes.length === 0) return
  await tx
    .insert(profilePermissions)
    .values(permissoes.map((permission) => ({ tenantId, profileId, permission })))
}

export async function excluirPerfil(tx: TenantTransaction, id: string): Promise<void> {
  await tx.delete(profiles).where(eq(profiles.id, id))
}

/** O perfil de uma pessoa; `null` para o proprietário, que não tem perfil. */
export async function perfilDoUsuario(
  tx: TenantTransaction,
  userId: string,
): Promise<string | null> {
  const [linha] = await tx
    .select({ profileId: users.profileId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return linha?.profileId ?? null
}

/** Quem tem o perfil: são as pessoas cujas permissões mudam quando ele muda. */
export async function usuariosDoPerfil(tx: TenantTransaction, id: string): Promise<string[]> {
  const linhas = await tx.select({ id: users.id }).from(users).where(eq(users.profileId, id))
  return linhas.map((linha) => linha.id)
}

/**
 * Os perfis com que um estabelecimento começa (`PERFIS_PRONTOS`). Roda no
 * cadastro, dentro da transação dele: não existe estabelecimento sem perfis
 * para dar à primeira pessoa da equipe.
 */
export async function criarPerfisProntos(tx: TenantTransaction, tenantId: string): Promise<void> {
  for (const pronto of PERFIS_PRONTOS) {
    const id = await inserirPerfil(tx, {
      tenantId,
      name: pronto.nome,
      description: pronto.descricao,
    })
    await definirPermissoes(tx, tenantId, id, pronto.permissoes)
  }
}
