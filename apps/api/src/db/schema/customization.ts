import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  unique,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

import { products } from './catalog.js'
import { currentTenantId, primaryId, timestamps } from './shared.js'
import { tenants } from './tenants.js'

/** A mesma policy de isolamento das demais tabelas tenant-scoped. */
const isolamento = (tenantId: AnyPgColumn) =>
  pgPolicy('tenant_isolation', {
    as: 'permissive',
    for: 'all',
    to: 'public',
    using: sql`${tenantId} = ${currentTenantId}`,
    withCheck: sql`${tenantId} = ${currentTenantId}`,
  })

/**
 * Grupo de opções: "Tamanho", "Adicionais", "Remover ingredientes",
 * "Escolha a bebida".
 *
 * Um modelo só para as três coisas que o cardápio chama por nomes diferentes.
 * Todas são uma lista de escolhas com preço e um limite de seleções — muda
 * apenas o mínimo e o máximo:
 *
 * | Grupo      | mín | máx | exemplo                           |
 * | ---------- | --- | --- | --------------------------------- |
 * | Tamanho    | 1   | 1   | Normal +0, Grande +6,00           |
 * | Adicionais | 0   | 3   | Bacon +5,00, Cheddar +4,00        |
 * | Remover    | 0   | 2   | Sem cebola, Sem tomate            |
 *
 * Tabelas separadas para adicional e remoção duplicariam a estrutura e
 * obrigariam o cálculo de preço do pedido a ter duas regras em vez de uma.
 *
 * "Obrigatório" não é gravado: é `minSelections >= 1`. Gravar os dois permitiria
 * um grupo obrigatório com mínimo zero, e ninguém saberia qual vale.
 *
 * O grupo é **reutilizável**: "Adicionais" é criado uma vez e ligado aos dez
 * hambúrgueres por `product_option_groups`. Trocar o preço do bacon é uma
 * edição, não dez.
 */
export const optionGroups = pgTable(
  'option_groups',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    name: varchar({ length: 80 }).notNull(),
    /** Instrução para o cliente: "Escolha até 3". */
    description: text(),
    minSelections: integer().notNull().default(0),
    maxSelections: integer().notNull().default(1),

    ...timestamps,
  },
  (table) => [
    check('option_groups_minimo_nao_negativo', sql`${table.minSelections} >= 0`),
    check('option_groups_maximo_positivo', sql`${table.maxSelections} >= 1`),
    check('option_groups_minimo_ate_maximo', sql`${table.minSelections} <= ${table.maxSelections}`),
    unique('option_groups_tenant_id_id').on(table.tenantId, table.id),
    isolamento(table.tenantId),
  ],
).enableRLS()

/**
 * Uma escolha dentro de um grupo.
 *
 * **O acréscimo de preço não pode ser negativo.** O preço base do produto é o
 * do menor tamanho, e as opções só somam. Com desconto por opção, a soma de um
 * item poderia ficar negativa, e toda a conta do pedido precisaria de uma trava
 * a mais — que um dia alguém esqueceria.
 */
export const options = pgTable(
  'options',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    groupId: uuid().notNull(),

    name: varchar({ length: 80 }).notNull(),
    priceDeltaInCents: integer().notNull().default(0),
    /** "Acabou o bacon" sem precisar tirar o bacon do grupo. */
    isAvailable: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),

    ...timestamps,
  },
  (table) => [
    check('options_acrescimo_nao_negativo', sql`${table.priceDeltaInCents} >= 0`),
    foreignKey({
      name: 'options_grupo_mesmo_tenant',
      columns: [table.tenantId, table.groupId],
      foreignColumns: [optionGroups.tenantId, optionGroups.id],
    }).onDelete('cascade'),
    unique('options_tenant_id_id').on(table.tenantId, table.id),
    index('options_grupo_idx').on(table.groupId, table.sortOrder),
    isolamento(table.tenantId),
  ],
).enableRLS()

/**
 * Quais grupos cada produto usa, e em que ordem aparecem para o cliente.
 *
 * Excluir o produto desliga os grupos dele. Excluir um **grupo em uso** é
 * recusado: se "Tamanho" sumisse em silêncio, o produto passaria a ser vendido
 * sem tamanho, pelo preço base.
 */
export const productOptionGroups = pgTable(
  'product_option_groups',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    productId: uuid().notNull(),
    groupId: uuid().notNull(),
    sortOrder: integer().notNull().default(0),

    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: 'product_option_groups_produto_mesmo_tenant',
      columns: [table.tenantId, table.productId],
      foreignColumns: [products.tenantId, products.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'product_option_groups_grupo_mesmo_tenant',
      columns: [table.tenantId, table.groupId],
      foreignColumns: [optionGroups.tenantId, optionGroups.id],
    }).onDelete('restrict'),
    unique('product_option_groups_unico').on(table.productId, table.groupId),
    index('product_option_groups_grupo_idx').on(table.groupId),
    isolamento(table.tenantId),
  ],
).enableRLS()

/**
 * Componentes de um combo.
 *
 * O combo é um produto do tipo `COMBO`; cada linha aqui diz "este combo inclui
 * N unidades daquele produto".
 *
 * Excluir o combo leva os itens junto. Excluir um **produto que é componente**
 * é recusado: o combo passaria a ser vendido pelo mesmo preço com um item a
 * menos.
 */
export const comboItems = pgTable(
  'combo_items',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    comboProductId: uuid().notNull(),
    itemProductId: uuid().notNull(),
    quantity: integer().notNull().default(1),
    sortOrder: integer().notNull().default(0),

    ...timestamps,
  },
  (table) => [
    check('combo_items_quantidade_positiva', sql`${table.quantity} >= 1`),
    check('combo_items_nao_contem_a_si', sql`${table.comboProductId} <> ${table.itemProductId}`),
    foreignKey({
      name: 'combo_items_combo_mesmo_tenant',
      columns: [table.tenantId, table.comboProductId],
      foreignColumns: [products.tenantId, products.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'combo_items_item_mesmo_tenant',
      columns: [table.tenantId, table.itemProductId],
      foreignColumns: [products.tenantId, products.id],
    }).onDelete('restrict'),
    unique('combo_items_unico').on(table.comboProductId, table.itemProductId),
    index('combo_items_item_idx').on(table.itemProductId),
    isolamento(table.tenantId),
  ],
).enableRLS()

export type OptionGroup = typeof optionGroups.$inferSelect
export type Option = typeof options.$inferSelect
export type ProductOptionGroup = typeof productOptionGroups.$inferSelect
export type ComboItem = typeof comboItems.$inferSelect
