import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  pgPolicy,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

import { currentTenantId, primaryId, timestamps } from './shared.js'
import { tenants } from './tenants.js'

const isolamento = (tenantId: AnyPgColumn) =>
  pgPolicy('tenant_isolation', {
    as: 'permissive',
    for: 'all',
    to: 'public',
    using: sql`${tenantId} = ${currentTenantId}`,
    withCheck: sql`${tenantId} = ${currentTenantId}`,
  })

/**
 * Cliente final de um estabelecimento.
 *
 * **Por estabelecimento, não da plataforma.** O mesmo telefone na lanchonete e
 * na pizzaria são dois clientes, sem ligação entre si: o dado serve a quem o
 * coletou, e a mais ninguém (SECURITY.md, LGPD). Por isso a unicidade é
 * `(tenant_id, phone)`.
 *
 * O telefone é guardado normalizado — só dígitos, com o país —, e a CHECK
 * recusa qualquer outra forma: `(11) 98765-4321` e `11987654321` não podem
 * virar dois clientes.
 *
 * Sem senha nem e-mail: no MVP o cliente é identificado pelo telefone, com a
 * dívida registrada em SECURITY.md. O cliente nasce no primeiro pedido (Fase 11).
 */
export const customers = pgTable(
  'customers',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    /** `5511987654321`. */
    phone: varchar({ length: 13 }).notNull(),
    name: varchar({ length: 120 }).notNull(),

    ...timestamps,
  },
  (table) => [
    check('customers_telefone_normalizado', sql`${table.phone} ~ '^55[1-9][0-9]{9,10}$'`),
    unique('customers_telefone_unico').on(table.tenantId, table.phone),
    unique('customers_tenant_id_id').on(table.tenantId, table.id),
    isolamento(table.tenantId),
  ],
).enableRLS()

/**
 * Endereços de entrega de um cliente.
 *
 * Não guarda a região de entrega: as regiões são salvas por substituição do
 * conjunto e mudam de id a cada edição do lojista. A região é escolhida a cada
 * pedido, e o pedido guarda a sua cópia (Fase 11).
 *
 * `lastUsedAt` ordena a lista — o endereço de ontem aparece primeiro.
 */
export const customerAddresses = pgTable(
  'customer_addresses',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    customerId: uuid().notNull(),

    /**
     * CEP, só os 8 dígitos. Anulável porque os endereços gravados antes dele
     * existir não o têm — inventar um valor seria pior. Todo endereço novo
     * passa pelo `enderecoSchema` de `@repo/shared`, que o exige.
     */
    postalCode: varchar({ length: 8 }),
    street: varchar({ length: 120 }).notNull(),
    number: varchar({ length: 20 }).notNull(),
    complement: varchar({ length: 80 }),
    neighborhood: varchar({ length: 80 }).notNull(),
    city: varchar({ length: 80 }),
    reference: varchar({ length: 120 }),

    lastUsedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: 'customer_addresses_cliente_mesmo_tenant',
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }).onDelete('cascade'),
    check('customer_addresses_cep_formato', sql`${table.postalCode} ~ '^[0-9]{8}$'`),
    unique('customer_addresses_tenant_id_id').on(table.tenantId, table.id),
    index('customer_addresses_cliente_idx').on(table.customerId, table.lastUsedAt),
    isolamento(table.tenantId),
  ],
).enableRLS()

export type Customer = typeof customers.$inferSelect
export type CustomerAddress = typeof customerAddresses.$inferSelect
