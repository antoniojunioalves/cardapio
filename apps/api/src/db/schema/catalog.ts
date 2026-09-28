import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { currentTenantId, primaryId, timestamps } from './shared.js'
import { tenants } from './tenants.js'

/**
 * Categorias do cardápio: Hambúrgueres, Pizzas, Bebidas, Sobremesas.
 *
 * `isActive` esconde a categoria inteira do cardápio público — é diferente da
 * disponibilidade de um produto, que diz "acabou por hoje".
 */
export const categories = pgTable(
  'categories',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    name: varchar({ length: 80 }).notNull(),
    description: text(),
    /** Opcional. Chave no storage, nunca URL. */
    imageKey: varchar({ length: 255 }),

    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),

    ...timestamps,
  },
  (table) => [
    // Sem diferenciar maiúsculas: "Bebidas" e "bebidas" lado a lado no cardápio
    // é erro de digitação, não duas categorias.
    uniqueIndex('categories_nome_unico').on(table.tenantId, sql`lower(${table.name})`),
    // Alvo da FK composta de `products`.
    unique('categories_tenant_id_id').on(table.tenantId, table.id),
    index('categories_tenant_ordem_idx').on(table.tenantId, table.sortOrder),
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
 * `SIMPLE` é um produto comum. `COMBO` é um produto composto de outros, listados
 * em `combo_items`.
 *
 * Combo como tipo de produto, e não como tabela à parte, porque no cardápio ele
 * se comporta exatamente como um produto: tem categoria, preço, imagem,
 * disponibilidade e ordem, e entra no carrinho do mesmo jeito. Uma tabela
 * `combos` separada duplicaria tudo isso e obrigaria o carrinho e o pedido a
 * tratar dois tipos de item.
 *
 * O tipo é definido na criação e não muda depois.
 */
export const productType = pgEnum('product_type', ['SIMPLE', 'COMBO'])

/**
 * Produtos do cardápio.
 *
 * O nome é genérico de propósito — `Product`, e não `Burger` —, porque o
 * sistema atende lanchonete, pizzaria, cafeteria e food truck.
 *
 * `isAvailable` é o controle de estoque do MVP: "acabou por hoje". Estoque com
 * quantidade e baixa automática estão no ROADMAP.
 *
 * O preço gravado aqui é o **atual**. Um pedido nunca o lê depois de criado:
 * na Fase 11 o preço é copiado para o item do pedido, e alterar o produto não
 * altera pedido antigo.
 */
export const products = pgTable(
  'products',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    categoryId: uuid().notNull(),
    type: productType().notNull().default('SIMPLE'),

    name: varchar({ length: 120 }).notNull(),
    description: text(),
    priceInCents: integer().notNull(),
    imageKey: varchar({ length: 255 }),

    isAvailable: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),

    ...timestamps,
  },
  (table) => [
    check('products_preco_nao_negativo', sql`${table.priceInCents} >= 0`),
    // Composta, e não `category_id → categories(id)`: a checagem de FK roda
    // por fora do RLS, e uma FK simples aceitaria um produto do Tenant A
    // dentro de uma categoria do Tenant B.
    //
    // RESTRICT e não CASCADE: excluir uma categoria não pode levar embora, em
    // silêncio, todos os produtos dela.
    foreignKey({
      name: 'products_categoria_mesmo_tenant',
      columns: [table.tenantId, table.categoryId],
      foreignColumns: [categories.tenantId, categories.id],
    }).onDelete('restrict'),
    // Alvo das FKs compostas de grupos de opção e combos, na Fase 7b.
    unique('products_tenant_id_id').on(table.tenantId, table.id),
    index('products_categoria_ordem_idx').on(table.tenantId, table.categoryId, table.sortOrder),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
).enableRLS()

export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
