import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'

import { profiles, refreshTokens, users } from '../db/schema/index.js'
import type { TenantTransaction } from '../tenant/with-tenant.js'

/**
 * Usuários do painel. Recebem a transação no contexto do tenant — o filtro por
 * estabelecimento é do RLS.
 */

export interface UsuarioDoPainel {
  id: string
  name: string
  email: string
  isActive: boolean
  /** O proprietário: tem todas as permissões e não tem perfil. */
  isOwner: boolean
  lastLoginAt: Date | null
  createdAt: Date
  perfil: { id: string; nome: string } | null
}

const colunas = {
  id: users.id,
  name: users.name,
  email: users.email,
  isActive: users.isActive,
  isOwner: users.isOwner,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
  perfilId: profiles.id,
  perfilNome: profiles.name,
}

type Linha = {
  [K in keyof typeof colunas]: (typeof colunas)[K]['_']['data'] | null
}

function montar(linha: Linha): UsuarioDoPainel {
  return {
    id: linha.id ?? '',
    name: linha.name ?? '',
    email: linha.email ?? '',
    isActive: linha.isActive ?? false,
    isOwner: linha.isOwner ?? false,
    lastLoginAt: linha.lastLoginAt,
    createdAt: linha.createdAt ?? new Date(0),
    perfil: linha.perfilId ? { id: linha.perfilId, nome: linha.perfilNome ?? '' } : null,
  }
}

/** O proprietário primeiro; depois, por nome. */
export async function listarUsuarios(tx: TenantTransaction): Promise<UsuarioDoPainel[]> {
  const linhas = await tx
    .select(colunas)
    .from(users)
    .leftJoin(profiles, eq(profiles.id, users.profileId))
    .orderBy(desc(users.isOwner), asc(sql`lower(${users.name})`))
  return linhas.map(montar)
}

export async function buscarUsuario(
  tx: TenantTransaction,
  id: string,
): Promise<UsuarioDoPainel | null> {
  const [linha] = await tx
    .select(colunas)
    .from(users)
    .leftJoin(profiles, eq(profiles.id, users.profileId))
    .where(eq(users.id, id))
    .limit(1)
  return linha ? montar(linha) : null
}

export async function inserirUsuario(
  tx: TenantTransaction,
  dados: {
    tenantId: string
    name: string
    email: string
    passwordHash: string
    profileId: string
  },
): Promise<string> {
  const [criado] = await tx.insert(users).values(dados).returning({ id: users.id })
  if (!criado) throw new Error('usuário não foi criado')
  return criado.id
}

/** Um perfil por pessoa: o novo substitui o anterior. */
export async function definirPerfil(
  tx: TenantTransaction,
  id: string,
  profileId: string,
): Promise<void> {
  await tx
    .update(users)
    .set({ profileId, updatedAt: sql`now()` })
    .where(eq(users.id, id))
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
 * Encerra todas as sessões abertas do usuário. O token de acesso ainda aberto
 * deixa de valer na próxima requisição (o usuário é recarregado a cada uma);
 * sem refresh, a sessão não se renova.
 *
 * **Apaga, em vez de marcar como revogada.** `revokedAt` é a marca da rotação:
 * um token revogado que reaparece é sinal de roubo, e derruba todas as sessões
 * da pessoa. Uma sessão encerrada por nós não é isso — o aparelho que ficou
 * com ela só precisa ouvir "sessão inválida". Marcada como revogada, ela
 * acusaria um roubo falso na auditoria e, com a pessoa reativada, derrubaria
 * as sessões novas dela.
 */
export async function encerrarSessoes(tx: TenantTransaction, userId: string): Promise<void> {
  await tx
    .delete(refreshTokens)
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
}
