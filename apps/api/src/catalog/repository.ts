import { and, asc, count, eq, sql } from 'drizzle-orm'

import { categories, products, type Category, type Product } from '../db/schema/index.js'
import type { TenantContext } from '../tenant/context.js'
import type { TenantTransaction } from '../tenant/with-tenant.js'

/**
 * Acesso a dados do catálogo. Toda função recebe a transação com o contexto de
 * tenant já aplicado, e nenhuma filtra por tenant à mão — quem filtra é o RLS.
 *
 * Por isso uma busca por id de outro estabelecimento simplesmente não encontra
 * nada, e quem chama responde 404.
 */

type Patch<T> = { [K in keyof T]?: T[K] | undefined }
type Editavel<T> = Omit<T, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>

export type DadosDeCategoria = Pick<Category, 'name'> &
  Patch<Omit<Editavel<Category>, 'name' | 'imageKey'>>
export type CategoriaPatch = Patch<Editavel<Category>>

export type DadosDeProduto = Pick<Product, 'name' | 'categoryId' | 'priceInCents'> &
  Patch<Omit<Editavel<Product>, 'name' | 'categoryId' | 'priceInCents' | 'imageKey'>>
export type ProdutoPatch = Patch<Editavel<Product>>

// --- Categorias -------------------------------------------------------------

export async function listCategories(tx: TenantTransaction): Promise<Category[]> {
  return tx.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name))
}

export async function findCategory(tx: TenantTransaction, id: string): Promise<Category | null> {
  const [categoria] = await tx.select().from(categories).where(eq(categories.id, id)).limit(1)
  return categoria ?? null
}

/** Próxima posição disponível, para a categoria nova entrar no fim da lista. */
async function proximaOrdemDeCategoria(tx: TenantTransaction): Promise<number> {
  const [linha] = await tx
    .select({ maximo: sql<number | null>`max(${categories.sortOrder})` })
    .from(categories)
  return (linha?.maximo ?? -10) + 10
}

export async function insertCategory(
  tx: TenantTransaction,
  context: TenantContext,
  dados: DadosDeCategoria,
): Promise<Category> {
  const [criada] = await tx
    .insert(categories)
    .values({
      ...dados,
      sortOrder: dados.sortOrder ?? (await proximaOrdemDeCategoria(tx)),
      tenantId: context.tenantId,
    })
    .returning()
  if (!criada) throw new Error('falha ao criar a categoria')
  return criada
}

export async function updateCategory(
  tx: TenantTransaction,
  id: string,
  patch: CategoriaPatch,
): Promise<Category | null> {
  const [atualizada] = await tx
    .update(categories)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(categories.id, id))
    .returning()
  return atualizada ?? null
}

export async function deleteCategory(tx: TenantTransaction, id: string): Promise<Category | null> {
  const [apagada] = await tx.delete(categories).where(eq(categories.id, id)).returning()
  return apagada ?? null
}

export async function countProductsInCategory(
  tx: TenantTransaction,
  categoryId: string,
): Promise<number> {
  const [linha] = await tx
    .select({ total: count() })
    .from(products)
    .where(eq(products.categoryId, categoryId))
  return linha?.total ?? 0
}

/**
 * Aplica a ordem informada: a primeira da lista fica em 0, a segunda em 10, e
 * assim por diante. O intervalo de dez deixa espaço para inserir no meio sem
 * renumerar tudo.
 *
 * Devolve quantas linhas foram atualizadas. Um id de outro estabelecimento é
 * invisível e não conta — quem chama compara com o tamanho da lista.
 */
export async function reorderCategories(
  tx: TenantTransaction,
  ids: readonly string[],
): Promise<number> {
  let atualizadas = 0

  for (const [indice, id] of ids.entries()) {
    const linhas = await tx
      .update(categories)
      .set({ sortOrder: indice * 10, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning({ id: categories.id })
    atualizadas += linhas.length
  }

  return atualizadas
}

// --- Produtos ---------------------------------------------------------------

export async function listProducts(
  tx: TenantTransaction,
  filtro: { categoryId?: string | undefined } = {},
): Promise<Product[]> {
  return tx
    .select()
    .from(products)
    .where(filtro.categoryId ? eq(products.categoryId, filtro.categoryId) : undefined)
    .orderBy(asc(products.categoryId), asc(products.sortOrder), asc(products.name))
}

export async function findProduct(tx: TenantTransaction, id: string): Promise<Product | null> {
  const [produto] = await tx.select().from(products).where(eq(products.id, id)).limit(1)
  return produto ?? null
}

/** Próxima posição disponível na categoria, para o produto entrar no fim dela. */
export async function proximaOrdemDeProduto(
  tx: TenantTransaction,
  categoryId: string,
): Promise<number> {
  const [linha] = await tx
    .select({ maximo: sql<number | null>`max(${products.sortOrder})` })
    .from(products)
    .where(eq(products.categoryId, categoryId))
  return (linha?.maximo ?? -10) + 10
}

export async function insertProduct(
  tx: TenantTransaction,
  context: TenantContext,
  dados: DadosDeProduto,
): Promise<Product> {
  const [criado] = await tx
    .insert(products)
    .values({
      ...dados,
      sortOrder: dados.sortOrder ?? (await proximaOrdemDeProduto(tx, dados.categoryId)),
      tenantId: context.tenantId,
    })
    .returning()
  if (!criado) throw new Error('falha ao criar o produto')
  return criado
}

export async function updateProduct(
  tx: TenantTransaction,
  id: string,
  patch: ProdutoPatch,
): Promise<Product | null> {
  const [atualizado] = await tx
    .update(products)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning()
  return atualizado ?? null
}

/**
 * Aplica a ordem informada aos produtos de uma categoria, de dez em dez, como
 * `reorderCategories`. Devolve quantas linhas foram atualizadas; um id de
 * outro estabelecimento ou de outra categoria não conta.
 */
export async function reorderProducts(
  tx: TenantTransaction,
  categoryId: string,
  ids: readonly string[],
): Promise<number> {
  let atualizadas = 0

  for (const [indice, id] of ids.entries()) {
    const linhas = await tx
      .update(products)
      .set({ sortOrder: indice * 10, updatedAt: new Date() })
      .where(and(eq(products.id, id), eq(products.categoryId, categoryId)))
      .returning({ id: products.id })
    atualizadas += linhas.length
  }

  return atualizadas
}

export async function deleteProduct(tx: TenantTransaction, id: string): Promise<Product | null> {
  const [apagado] = await tx.delete(products).where(eq(products.id, id)).returning()
  return apagado ?? null
}
