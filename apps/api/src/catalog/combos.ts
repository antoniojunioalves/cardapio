import { asc, eq, inArray } from 'drizzle-orm'

import { recordAudit } from '../audit/record.js'
import { comboItems, products, type Product } from '../db/schema/index.js'
import { AppError, NotFoundError } from '../lib/errors.js'
import type { TenantContext } from '../tenant/context.js'
import { withTenant, type TenantTransaction } from '../tenant/with-tenant.js'
import { findProduct } from './repository.js'

/**
 * Componentes de um combo.
 *
 * O combo é um produto do tipo `COMBO`, com preço próprio. Os componentes dizem
 * o que ele contém — o que a cozinha prepara e o que aparece na mensagem do
 * pedido.
 */

export interface ItemDoCombo {
  productId: string
  name: string
  priceInCents: number
  isAvailable: boolean
  quantity: number
}

export interface ComposicaoDoCombo {
  items: ItemDoCombo[]
  /**
   * Quanto custariam os itens comprados separadamente. É o que permite ao
   * cardápio mostrar "economize R$ 5,00" sem o lojista ter de calcular.
   */
  precoAvulsoEmCentavos: number
  /**
   * Um combo com componente esgotado não pode ser vendido: seria vendido pelo
   * mesmo preço com um item a menos. O cardápio público usa isto na Fase 8.
   */
  todosDisponiveis: boolean
}

export interface ItemDeEntrada {
  productId: string
  quantity: number
}

const comboNaoEncontrado = () => new NotFoundError('Combo não encontrado.')

async function exigirCombo(tx: TenantTransaction, id: string): Promise<Product> {
  const produto = await findProduct(tx, id)
  if (!produto) throw comboNaoEncontrado()
  if (produto.type !== 'COMBO') {
    throw new AppError('Este produto não é um combo.', 400, 'NOT_A_COMBO')
  }
  return produto
}

async function composicao(tx: TenantTransaction, comboId: string): Promise<ComposicaoDoCombo> {
  const linhas = await tx
    .select({
      productId: products.id,
      name: products.name,
      priceInCents: products.priceInCents,
      isAvailable: products.isAvailable,
      quantity: comboItems.quantity,
    })
    .from(comboItems)
    .innerJoin(products, eq(products.id, comboItems.itemProductId))
    .where(eq(comboItems.comboProductId, comboId))
    .orderBy(asc(comboItems.sortOrder))

  return {
    items: linhas,
    precoAvulsoEmCentavos: linhas.reduce((soma, i) => soma + i.priceInCents * i.quantity, 0),
    todosDisponiveis: linhas.every((i) => i.isAvailable),
  }
}

export async function obterComposicao(
  context: TenantContext,
  comboId: string,
): Promise<ComposicaoDoCombo> {
  return withTenant(context, async (tx) => {
    await exigirCombo(tx, comboId)
    return composicao(tx, comboId)
  })
}

/**
 * Define os componentes do combo, substituindo os anteriores.
 *
 * Três recusas, cada uma por um motivo:
 * - **Combo dentro de combo.** A composição deixaria de ser uma lista e viraria
 *   árvore; a cozinha e a mensagem do pedido teriam de desdobrá-la, e um ciclo
 *   (A contém B, B contém A) seria possível.
 * - **O combo contendo a si mesmo.** O banco também recusa, por CHECK.
 * - **Produto inexistente ou de outro estabelecimento.** 404, e nada muda. A FK
 *   composta é a barreira de fundo.
 */
export async function definirComposicao(
  context: TenantContext,
  actorUserId: string,
  comboId: string,
  itens: readonly ItemDeEntrada[],
): Promise<ComposicaoDoCombo> {
  return withTenant(context, async (tx) => {
    await exigirCombo(tx, comboId)

    if (itens.some((i) => i.productId === comboId)) {
      throw new AppError('Um combo não pode conter a si mesmo.', 400, 'COMBO_CONTAINS_ITSELF')
    }

    const ids = itens.map((i) => i.productId)
    const encontrados = await tx
      .select({ id: products.id, type: products.type, name: products.name })
      .from(products)
      .where(inArray(products.id, ids))

    if (encontrados.length !== ids.length) throw new NotFoundError('Produto não encontrado.')

    const combosDentro = encontrados.filter((p) => p.type === 'COMBO')
    if (combosDentro.length > 0) {
      throw new AppError(
        `Um combo não pode conter outro combo: ${combosDentro.map((p) => p.name).join(', ')}.`,
        400,
        'COMBO_IN_COMBO',
      )
    }

    const anterior = await composicao(tx, comboId)

    await tx.delete(comboItems).where(eq(comboItems.comboProductId, comboId))
    await tx.insert(comboItems).values(
      itens.map((item, indice) => ({
        tenantId: context.tenantId,
        comboProductId: comboId,
        itemProductId: item.productId,
        quantity: item.quantity,
        sortOrder: indice * 10,
      })),
    )

    const atual = await composicao(tx, comboId)

    await recordAudit(tx, context, {
      action: 'combo.items_changed',
      entityType: 'product',
      entityId: comboId,
      actorUserId,
      metadata: {
        de: anterior.items.map((i) => `${String(i.quantity)}x ${i.name}`),
        para: atual.items.map((i) => `${String(i.quantity)}x ${i.name}`),
      },
    })

    return atual
  })
}

/**
 * Combos dos quais um produto faz parte. Usado para recusar a exclusão de um
 * componente com uma mensagem que diga **quais** combos seriam afetados.
 */
export async function combosQueContem(tx: TenantTransaction, productId: string): Promise<string[]> {
  const linhas = await tx
    .select({ name: products.name })
    .from(comboItems)
    .innerJoin(products, eq(products.id, comboItems.comboProductId))
    .where(eq(comboItems.itemProductId, productId))
    .orderBy(asc(products.name))

  return linhas.map((l) => l.name)
}
