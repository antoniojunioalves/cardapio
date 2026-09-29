import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

import { customers } from './customers.js'
import { paymentMethodKind } from './payments.js'
import { productType } from './catalog.js'
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
 * O caminho de um pedido. Só avança — a regra está em `src/orders/status.ts`.
 *
 * `OUT_FOR_DELIVERY` só existe para entrega; `COMPLETED` e `CANCELLED` são
 * finais.
 */
export const orderStatus = pgEnum('order_status', [
  'RECEIVED',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
  'CANCELLED',
])

export const fulfillmentType = pgEnum('fulfillment_type', ['DELIVERY', 'PICKUP'])

/**
 * Pedido.
 *
 * **É um registro histórico, não uma visão do cadastro.** Tudo que o pedido
 * mostra é copiado no momento em que ele nasce: nome e telefone do cliente,
 * endereço, região, forma de pagamento, valores. Mudar o cliente, a região ou
 * a forma de pagamento depois não pode reescrever um pedido antigo — e, em
 * alguns aspectos, ele é documento fiscal (ARCHITECTURE.md, 4.4).
 *
 * `number` é o "Pedido #152": sequencial **por estabelecimento**, para a
 * cozinha e o WhatsApp. Não vai para URL pública (ARCHITECTURE.md, 4.2).
 *
 * `idempotencyKey` é gerada pelo navegador a cada tentativa de envio: o
 * mesmo envio repetido — duplo clique, rede que caiu depois de o servidor
 * gravar — devolve o pedido já criado em vez de criar outro.
 */
export const orders = pgTable(
  'orders',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    number: integer().notNull(),
    status: orderStatus().notNull().default('RECEIVED'),
    idempotencyKey: uuid().notNull(),

    customerId: uuid().notNull(),
    customerName: varchar({ length: 120 }).notNull(),
    customerPhone: varchar({ length: 13 }).notNull(),

    fulfillment: fulfillmentType().notNull(),
    // Endereço copiado — preenchido só na entrega.
    addressPostalCode: varchar({ length: 8 }),
    addressStreet: varchar({ length: 120 }),
    addressNumber: varchar({ length: 20 }),
    addressComplement: varchar({ length: 80 }),
    addressNeighborhood: varchar({ length: 80 }),
    addressCity: varchar({ length: 80 }),
    addressReference: varchar({ length: 120 }),
    /** Nome da região copiado: as regiões são substituídas e mudam de id. */
    deliveryRegionName: varchar({ length: 80 }),

    paymentMethodCode: varchar({ length: 40 }).notNull(),
    paymentMethodName: varchar({ length: 80 }).notNull(),
    paymentMethodKind: paymentMethodKind().notNull(),
    changeForInCents: integer(),

    notes: text(),

    subtotalInCents: integer().notNull(),
    deliveryFeeInCents: integer().notNull(),
    totalInCents: integer().notNull(),

    cancellationReason: varchar({ length: 280 }),
    statusChangedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: 'orders_cliente_mesmo_tenant',
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
      // `no action`, não `restrict`: a checagem fica para o fim do comando.
      // Excluir o estabelecimento apaga clientes e pedidos em cascata, numa
      // ordem que o PostgreSQL não garante; com `restrict` a checagem seria
      // imediata e a exclusão poderia falhar no meio. Excluir um cliente que
      // tem pedidos continua recusado.
    }).onDelete('no action'),
    unique('orders_numero_unico').on(table.tenantId, table.number),
    unique('orders_idempotencia_unica').on(table.tenantId, table.idempotencyKey),
    unique('orders_tenant_id_id').on(table.tenantId, table.id),
    index('orders_recentes_idx').on(table.tenantId, table.createdAt),
    index('orders_status_idx').on(table.tenantId, table.status),
    check('orders_numero_positivo', sql`${table.number} >= 1`),
    check(
      'orders_valores_coerentes',
      sql`${table.subtotalInCents} >= 0 and ${table.deliveryFeeInCents} >= 0
          and ${table.totalInCents} = ${table.subtotalInCents} + ${table.deliveryFeeInCents}`,
    ),
    check(
      'orders_entrega_tem_endereco',
      sql`${table.fulfillment} <> 'DELIVERY' or (${table.addressStreet} is not null
          and ${table.addressNumber} is not null and ${table.addressNeighborhood} is not null)`,
    ),
    check(
      'orders_troco_cobre_o_total',
      sql`${table.changeForInCents} is null or ${table.changeForInCents} >= ${table.totalInCents}`,
    ),
    check(
      'orders_cancelado_tem_motivo',
      sql`${table.status} <> 'CANCELLED' or ${table.cancellationReason} is not null`,
    ),
    isolamento(table.tenantId),
  ],
).enableRLS()

/**
 * Item do pedido, com o produto **copiado**: nome, tipo, preço unitário já com
 * as opções, e a composição do combo.
 *
 * `productId` fica só como referência, sem chave estrangeira: o produto pode
 * ser excluído do cardápio, e o pedido de ontem continua existindo.
 */
export const orderItems = pgTable(
  'order_items',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    orderId: uuid().notNull(),
    productId: uuid().notNull(),

    productName: varchar({ length: 120 }).notNull(),
    productType: productType().notNull(),
    /** Preço base mais os acréscimos das opções, por unidade. */
    unitPriceInCents: integer().notNull(),
    quantity: integer().notNull(),
    totalInCents: integer().notNull(),
    notes: varchar({ length: 140 }),
    /** O que a cozinha monta num combo: `[{ name, quantity }]`. */
    comboComponents: jsonb().$type<{ name: string; quantity: number }[]>(),
    sortOrder: integer().notNull(),

    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: 'order_items_pedido_mesmo_tenant',
      columns: [table.tenantId, table.orderId],
      foreignColumns: [orders.tenantId, orders.id],
    }).onDelete('cascade'),
    unique('order_items_tenant_id_id').on(table.tenantId, table.id),
    index('order_items_pedido_idx').on(table.orderId, table.sortOrder),
    check('order_items_quantidade', sql`${table.quantity} between 1 and 50`),
    check(
      'order_items_total_coerente',
      sql`${table.unitPriceInCents} >= 0
          and ${table.totalInCents} = ${table.unitPriceInCents} * ${table.quantity}`,
    ),
    isolamento(table.tenantId),
  ],
).enableRLS()

/** Opção escolhida num item, copiada: grupo, opção e acréscimo. */
export const orderItemOptions = pgTable(
  'order_item_options',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    orderItemId: uuid().notNull(),

    groupName: varchar({ length: 80 }).notNull(),
    optionName: varchar({ length: 80 }).notNull(),
    priceDeltaInCents: integer().notNull(),
    sortOrder: integer().notNull(),

    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: 'order_item_options_item_mesmo_tenant',
      columns: [table.tenantId, table.orderItemId],
      foreignColumns: [orderItems.tenantId, orderItems.id],
    }).onDelete('cascade'),
    index('order_item_options_item_idx').on(table.orderItemId, table.sortOrder),
    check('order_item_options_acrescimo', sql`${table.priceDeltaInCents} >= 0`),
    isolamento(table.tenantId),
  ],
).enableRLS()

/**
 * O último número de pedido de cada estabelecimento.
 *
 * Uma linha por tenant, incrementada com `INSERT ... ON CONFLICT DO UPDATE
 * ... RETURNING` na mesma transação do pedido. A linha fica travada até o
 * commit, então dois pedidos simultâneos nunca recebem o mesmo número; e, se
 * o pedido falhar, o rollback devolve o número — sem buracos por erro.
 *
 * Não é uma `SEQUENCE` do PostgreSQL porque ela seria global (ou uma por
 * tenant, criada em DDL que a API não pode executar), e não volta no rollback.
 */
export const orderCounters = pgTable(
  'order_counters',
  {
    tenantId: uuid()
      .primaryKey()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    lastNumber: integer().notNull(),
  },
  (table) => [isolamento(table.tenantId)],
).enableRLS()

export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
export type OrderItem = typeof orderItems.$inferSelect
export type OrderItemOption = typeof orderItemOptions.$inferSelect
export type OrderStatus = (typeof orderStatus.enumValues)[number]
