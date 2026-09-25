import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { currentTenantId, primaryId, timestamps } from './shared.js'
import { tenants } from './tenants.js'

/**
 * Planos da plataforma — dados globais, não pertencem a nenhum tenant.
 *
 * O código do plano é `varchar` e não enum de propósito: criar FREE, STARTER,
 * ADVANCED, PREMIUM ou CUSTOM passa a ser um INSERT, e não uma migration. O
 * requisito é explícito em não limitar o sistema a um conjunto fixo de planos.
 */
export const plans = pgTable('plans', {
  id: primaryId(),
  code: varchar({ length: 32 }).notNull().unique(),
  name: varchar({ length: 80 }).notNull(),
  description: text(),
  isActive: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
  ...timestamps,
})

/**
 * Recursos e limites de cada plano.
 *
 * Cobre as duas formas que um plano tem de diferenciar: ligar ou desligar um
 * recurso (`isEnabled`) e impor um teto numérico (`limitValue`).
 *
 * **`limitValue` nulo significa ilimitado**, e não zero. Zero é um limite
 * válido — "este plano não permite nenhum" — então precisava de uma
 * representação distinta de "sem teto".
 */
export const planFeatures = pgTable(
  'plan_features',
  {
    id: primaryId(),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),

    /** Chave estável, tratada programaticamente: `maxOrdersPerMonth`, `reports`. */
    key: varchar({ length: 64 }).notNull(),
    isEnabled: boolean().notNull().default(true),
    limitValue: integer(),

    ...timestamps,
  },
  (table) => [unique('plan_features_plan_key').on(table.planId, table.key)],
)

export const subscriptionStatus = pgEnum('subscription_status', ['ACTIVE', 'PAST_DUE', 'CANCELLED'])

/**
 * Assinatura de um tenant à plataforma.
 *
 * Atenção à distinção que o produto faz: isto é o estabelecimento pagando pelo
 * uso da plataforma. O cliente final que faz um pedido não paga online no MVP.
 *
 * Primeira tabela tenant-scoped do sistema, e por isso a primeira com RLS. A
 * policy vale para leitura e escrita: `using` filtra o que é visível e o alvo
 * de UPDATE/DELETE; `withCheck` é o que impede gravar uma linha marcada com o
 * tenant de outro.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),

    status: subscriptionStatus().notNull().default('ACTIVE'),

    /** Nulo enquanto não houver ciclo de cobrança definido — não há cobrança no MVP. */
    currentPeriodEnd: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    index('subscriptions_tenant_idx').on(table.tenantId),

    // Um tenant não pode ter duas assinaturas vigentes ao mesmo tempo. O
    // histórico de assinaturas encerradas continua permitido.
    uniqueIndex('subscriptions_one_active_per_tenant')
      .on(table.tenantId)
      .where(sql`${table.status} = 'ACTIVE'`),

    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
).enableRLS()

export type Plan = typeof plans.$inferSelect
export type PlanFeature = typeof planFeatures.$inferSelect
export type Subscription = typeof subscriptions.$inferSelect
export type NewSubscription = typeof subscriptions.$inferInsert
