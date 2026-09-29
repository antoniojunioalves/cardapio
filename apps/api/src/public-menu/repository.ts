import { asc, eq, inArray } from 'drizzle-orm'

import {
  categories,
  comboItems,
  optionGroups,
  options,
  productOptionGroups,
  products,
  type Category,
  type Option,
  type OptionGroup,
  type Product,
} from '../db/schema/index.js'
import type { TenantTransaction } from '../tenant/with-tenant.js'

/**
 * Leitura do cardápio para a área pública.
 *
 * Um número fixo de consultas — cinco —, independente do tamanho do cardápio.
 * Carregar os grupos produto a produto seria uma consulta por item, e o
 * cardápio público é a rota mais acessada do sistema.
 *
 * Como no resto do código, nenhuma consulta filtra por tenant: a transação
 * chega com o contexto aplicado e o RLS limita tudo ao estabelecimento do slug.
 */

export interface GrupoDoProduto extends OptionGroup {
  productId: string
  options: Option[]
}

export interface ComponenteDoCombo {
  comboProductId: string
  name: string
  quantity: number
  priceInCents: number
  isAvailable: boolean
}

export interface CardapioCarregado {
  categorias: Category[]
  produtos: Product[]
  grupos: GrupoDoProduto[]
  componentes: ComponenteDoCombo[]
}

export async function carregarCardapio(tx: TenantTransaction): Promise<CardapioCarregado> {
  const categorias = await tx
    .select()
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name))

  if (categorias.length === 0) return { categorias, produtos: [], grupos: [], componentes: [] }

  const produtos = await tx
    .select()
    .from(products)
    .where(
      inArray(
        products.categoryId,
        categorias.map((c) => c.id),
      ),
    )
    .orderBy(asc(products.sortOrder), asc(products.name))

  if (produtos.length === 0) return { categorias, produtos, grupos: [], componentes: [] }

  const idsDosProdutos = produtos.map((p) => p.id)

  const vinculos = await tx
    .select({ productId: productOptionGroups.productId, grupo: optionGroups })
    .from(productOptionGroups)
    .innerJoin(optionGroups, eq(optionGroups.id, productOptionGroups.groupId))
    .where(inArray(productOptionGroups.productId, idsDosProdutos))
    .orderBy(asc(productOptionGroups.sortOrder))

  // Um grupo reutilizado por dez produtos é carregado uma vez só.
  const idsDosGrupos = [...new Set(vinculos.map((v) => v.grupo.id))]
  const todasAsOpcoes =
    idsDosGrupos.length === 0
      ? []
      : await tx
          .select()
          .from(options)
          .where(inArray(options.groupId, idsDosGrupos))
          .orderBy(asc(options.sortOrder))

  const opcoesPorGrupo = new Map<string, Option[]>()
  for (const opcao of todasAsOpcoes) {
    const lista = opcoesPorGrupo.get(opcao.groupId) ?? []
    lista.push(opcao)
    opcoesPorGrupo.set(opcao.groupId, lista)
  }

  const grupos = vinculos.map((v) => ({
    ...v.grupo,
    productId: v.productId,
    options: opcoesPorGrupo.get(v.grupo.id) ?? [],
  }))

  const idsDosCombos = produtos.filter((p) => p.type === 'COMBO').map((p) => p.id)
  const componentes =
    idsDosCombos.length === 0
      ? []
      : await tx
          .select({
            comboProductId: comboItems.comboProductId,
            name: products.name,
            quantity: comboItems.quantity,
            priceInCents: products.priceInCents,
            isAvailable: products.isAvailable,
          })
          .from(comboItems)
          .innerJoin(products, eq(products.id, comboItems.itemProductId))
          .where(inArray(comboItems.comboProductId, idsDosCombos))
          .orderBy(asc(comboItems.sortOrder))

  return { categorias, produtos, grupos, componentes }
}
