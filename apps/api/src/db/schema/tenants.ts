import { sql } from 'drizzle-orm'
import { check, pgEnum, pgTable, varchar } from 'drizzle-orm/pg-core'

import { primaryId, timestamps } from './shared.js'

export const tenantStatus = pgEnum('tenant_status', ['ACTIVE', 'SUSPENDED'])

/**
 * Um tenant é um estabelecimento de alimentação.
 *
 * **Esta tabela não tem RLS, e é proposital.** Ela é o registro que resolve um
 * `slug` num tenant, e essa resolução acontece ANTES de existir contexto de
 * tenant — é ela que o estabelece. Uma policy `id = current_tenant` tornaria o
 * cardápio público irresolvível: seria preciso já saber o tenant para poder
 * descobri-lo.
 *
 * O que impede o vazamento aqui é a camada de aplicação: o repositório expõe
 * consultas estreitas e nomeadas, e não uma listagem genérica.
 *
 * Guarda de projeto que decorre disso: **nada sensível entra nesta tabela.**
 * Dados de cobrança, documento do responsável e afins vão para
 * `tenant_settings` (Fase 5), que é tenant-scoped e protegida por RLS. Se algum
 * dia parecer conveniente adicionar uma coluna sensível aqui, a resposta certa
 * é criar a coluna lá, não afrouxar isto.
 */
export const tenants = pgTable(
  'tenants',
  {
    id: primaryId(),

    /** Identificador na URL pública: `/lanchonete-do-ze`. */
    slug: varchar({ length: 63 }).notNull().unique(),
    name: varchar({ length: 120 }).notNull(),

    /**
     * Sem o fuso do estabelecimento não há como decidir se ele está aberto.
     * O padrão cobre a maior parte do Brasil, mas é por tenant de propósito.
     */
    timezone: varchar({ length: 64 }).notNull().default('America/Sao_Paulo'),

    status: tenantStatus().notNull().default('ACTIVE'),

    ...timestamps,
  },
  (table) => [
    // O slug vai para a URL: restringir o formato no banco impede que um
    // cadastro por outro caminho crie um endereço quebrado.
    check('tenants_slug_format', sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
)

export type Tenant = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert
