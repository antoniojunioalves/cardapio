import { eq } from 'drizzle-orm'

import { db } from '../db/index.js'
import { tenants } from '../db/schema/index.js'

/**
 * O que o registro de tenants expõe. Campos deliberadamente poucos: é o
 * suficiente para resolver a URL pública e montar o cabeçalho do cardápio.
 */
export interface TenantRecord {
  id: string
  slug: string
  name: string
  timezone: string
  status: 'ACTIVE' | 'SUSPENDED'
}

const publicColumns = {
  id: tenants.id,
  slug: tenants.slug,
  name: tenants.name,
  timezone: tenants.timezone,
  status: tenants.status,
}

/**
 * Resolve o `slug` da URL pública num tenant.
 *
 * Esta é a única consulta do sistema que roda legitimamente **fora** de
 * contexto de tenant, e o motivo é circular por natureza: é ela que estabelece
 * o contexto. Exigir contexto aqui tornaria o cardápio público irresolvível.
 *
 * O que substitui o RLS neste caminho é o formato da função: ela recebe um
 * slug e devolve um tenant, sem listagem e sem filtro arbitrário. Não existe
 * `findTenants(criteria)` — uma consulta genérica sobre o registro seria
 * justamente o buraco que o RLS fecharia nas outras tabelas.
 *
 * O status é devolvido em vez de filtrado: quem chama decide o que fazer com
 * um estabelecimento suspenso. O cardápio público recusa; a área
 * administrativa precisa deixar o dono entrar para ver o motivo do bloqueio.
 */
export async function findTenantBySlug(slug: string): Promise<TenantRecord | null> {
  const [tenant] = await db
    .select(publicColumns)
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1)

  return tenant ?? null
}

/**
 * Carrega o tenant de um usuário já autenticado, para montar o contexto.
 * Recebe um id que veio do próprio banco — nunca um id vindo do cliente.
 */
export async function findTenantById(tenantId: string): Promise<TenantRecord | null> {
  const [tenant] = await db
    .select(publicColumns)
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)

  return tenant ?? null
}
