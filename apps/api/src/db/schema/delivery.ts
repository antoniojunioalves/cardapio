import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgPolicy,
  pgTable,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { currentTenantId, primaryId, timestamps } from './shared.js'
import { tenants } from './tenants.js'

/**
 * Como a taxa de entrega é calculada.
 *
 * `FIXED` cobra o mesmo de todo mundo. `BY_REGION` cobra conforme a região
 * escolhida no checkout. Cálculo por distância depende de geocoding e está no
 * ROADMAP — não assumir que todo estabelecimento tem a mesma regra é
 * justamente o ponto deste enum.
 */
export const deliveryFeeMode = pgEnum('delivery_fee_mode', ['FIXED', 'BY_REGION'])

export const deliverySettings = pgTable(
  'delivery_settings',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .unique()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    /**
     * As duas nascem desligadas (Fase 22): o dono escolhe como entrega, em vez
     * de o cardápio ir ao ar com entrega grátis sem ele ter decidido nada. Até
     * lá, o cardápio não recebe pedidos (`temComoReceber`).
     */
    deliveryEnabled: boolean().notNull().default(false),
    /** Retirada no balcão. Um food truck pode só ter isto. */
    pickupEnabled: boolean().notNull().default(false),

    feeMode: deliveryFeeMode().notNull().default('FIXED'),
    /** Usada quando o modo é FIXED. Zero é válido: entrega grátis. */
    fixedFeeInCents: integer().notNull().default(0),

    estimatedMinMinutes: integer(),
    estimatedMaxMinutes: integer(),

    ...timestamps,
  },
  (table) => [
    check('delivery_settings_taxa_nao_negativa', sql`${table.fixedFeeInCents} >= 0`),
    check(
      'delivery_settings_estimativa_coerente',
      sql`${table.estimatedMinMinutes} is null or ${table.estimatedMaxMinutes} is null
          or ${table.estimatedMinMinutes} <= ${table.estimatedMaxMinutes}`,
    ),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
).enableRLS()

/**
 * Regiões de entrega, cada uma com a própria taxa.
 *
 * Só têm efeito quando `feeMode` é `BY_REGION`. Ficam guardadas de qualquer
 * jeito: alternar entre taxa fixa e por região não pode apagar o cadastro que
 * o lojista levou uma tarde para montar.
 */
export const deliveryRegions = pgTable(
  'delivery_regions',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    name: varchar({ length: 80 }).notNull(),
    feeInCents: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),

    ...timestamps,
  },
  (table) => [
    check('delivery_regions_taxa_nao_negativa', sql`${table.feeInCents} >= 0`),
    unique('delivery_regions_nome_unico').on(table.tenantId, table.name),
    index('delivery_regions_tenant_idx').on(table.tenantId),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
).enableRLS()

export type DeliverySettings = typeof deliverySettings.$inferSelect
export type DeliveryRegion = typeof deliveryRegions.$inferSelect
export type NewDeliveryRegion = typeof deliveryRegions.$inferInsert
