import { sql } from 'drizzle-orm'
import {
  boolean,
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
 * Natureza da forma de pagamento.
 *
 * Não é decoração: é o que permite tratar dinheiro diferente das outras na
 * hora do troco, e agrupar cartões e vales na interface sem depender do nome.
 * `OTHER` existe para o que não couber — uma bandeira regional, um convênio.
 */
export const paymentMethodKind = pgEnum('payment_method_kind', [
  'CASH',
  'PIX',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'MEAL_VOUCHER',
  'OTHER',
])

/**
 * Catálogo de formas de pagamento — global, como papéis e permissões.
 *
 * Global porque "Pix" significa o mesmo em todo estabelecimento; duplicá-lo
 * por tenant só criaria grafias divergentes e atrapalharia qualquer relatório
 * futuro. Acrescentar uma bandeira nova é um INSERT, não uma migration — o
 * requisito é explícito em não limitar o modelo a Pix, crédito e débito.
 *
 * **Nenhum pagamento é processado aqui.** No MVP o cliente apenas declara como
 * vai pagar ao receber; não há gateway nem cobrança online.
 */
export const paymentMethods = pgTable('payment_methods', {
  id: primaryId(),
  code: varchar({ length: 32 }).notNull().unique(),
  name: varchar({ length: 60 }).notNull(),
  kind: paymentMethodKind().notNull(),
  sortOrder: integer().notNull().default(0),
  isActive: boolean().notNull().default(true),
  ...timestamps,
})

/**
 * Quais formas cada estabelecimento aceita, e em que ordem exibi-las.
 *
 * A linha existir significa que o estabelecimento conhece aquela forma;
 * `isEnabled` diz se ela aparece no checkout. Guardar desabilitada em vez de
 * apagar preserva a ordenação que o lojista definiu quando ele voltar a
 * habilitar.
 */
export const tenantPaymentMethods = pgTable(
  'tenant_payment_methods',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    paymentMethodId: uuid()
      .notNull()
      .references(() => paymentMethods.id, { onDelete: 'cascade' }),

    isEnabled: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),

    ...timestamps,
  },
  (table) => [
    unique('tenant_payment_methods_unico').on(table.tenantId, table.paymentMethodId),
    index('tenant_payment_methods_tenant_idx').on(table.tenantId),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
).enableRLS()

export type PaymentMethod = typeof paymentMethods.$inferSelect
export type TenantPaymentMethod = typeof tenantPaymentMethods.$inferSelect
