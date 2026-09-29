import { recordAudit } from '../audit/record.js'
import type { Category, Product } from '../db/schema/index.js'
import { violacaoDoBanco, UNICIDADE } from '../lib/db-errors.js'
import { diferencas } from '../lib/diff.js'
import { AppError, ConflictError, NotFoundError } from '../lib/errors.js'
import { novaChaveDeImagem, type StorageService } from '../storage/index.js'
import { removerImagem, trocarImagem } from '../storage/replace.js'
import type { TenantContext } from '../tenant/context.js'
import { withTenant, type TenantTransaction } from '../tenant/with-tenant.js'
import { combosQueContem } from './combos.js'
import {
  countProductsInCategory,
  deleteCategory,
  deleteProduct,
  findCategory,
  findProduct,
  insertCategory,
  insertProduct,
  listCategories,
  listProducts,
  reorderCategories,
  updateCategory,
  updateProduct,
  type CategoriaPatch,
  type DadosDeCategoria,
  type DadosDeProduto,
  type ProdutoPatch,
} from './repository.js'

/**
 * Regras do catálogo. Cada mutação abre uma transação e grava a auditoria
 * dentro dela: ou a alteração e o registro acontecem juntos, ou nenhum.
 */

const categoriaNaoEncontrada = () => new NotFoundError('Categoria não encontrada.')
const produtoNaoEncontrado = () => new NotFoundError('Produto não encontrado.')

/** Traduz a restrição de nome único para uma mensagem que o lojista entende. */
function nomeRepetido(error: unknown): never {
  const violacao = violacaoDoBanco(error)
  if (violacao?.code === UNICIDADE && violacao.constraint === 'categories_nome_unico') {
    throw new ConflictError('Já existe uma categoria com esse nome.', 'CATEGORY_NAME_TAKEN')
  }
  throw error
}

async function exigirCategoria(tx: TenantTransaction, id: string): Promise<Category> {
  const categoria = await findCategory(tx, id)
  if (!categoria) throw categoriaNaoEncontrada()
  return categoria
}

// --- Categorias -------------------------------------------------------------

export async function listarCategorias(context: TenantContext): Promise<Category[]> {
  return withTenant(context, (tx) => listCategories(tx))
}

export async function criarCategoria(
  context: TenantContext,
  actorUserId: string,
  dados: DadosDeCategoria,
): Promise<Category> {
  try {
    return await withTenant(context, async (tx) => {
      const criada = await insertCategory(tx, context, dados)

      await recordAudit(tx, context, {
        action: 'category.created',
        entityType: 'category',
        entityId: criada.id,
        actorUserId,
        metadata: { name: criada.name },
      })

      return criada
    })
  } catch (error) {
    return nomeRepetido(error)
  }
}

export async function atualizarCategoria(
  context: TenantContext,
  actorUserId: string,
  id: string,
  patch: CategoriaPatch,
): Promise<Category> {
  try {
    return await withTenant(context, async (tx) => {
      const anterior = await exigirCategoria(tx, id)
      const atualizada = await updateCategory(tx, id, patch)
      if (!atualizada) throw categoriaNaoEncontrada()

      await recordAudit(tx, context, {
        action: 'category.updated',
        entityType: 'category',
        entityId: id,
        actorUserId,
        metadata: { alteracoes: diferencas(anterior, atualizada) },
      })

      return atualizada
    })
  } catch (error) {
    return nomeRepetido(error)
  }
}

/**
 * Exclui uma categoria vazia.
 *
 * Com produtos dentro, recusa com uma mensagem clara em vez de levá-los junto:
 * apagar uma categoria não pode, em silêncio, tirar trinta produtos do
 * cardápio. A chave estrangeira com RESTRICT é a segunda barreira, caso esta
 * verificação um dia seja removida.
 */
export async function excluirCategoria(
  service: StorageService,
  context: TenantContext,
  actorUserId: string,
  id: string,
): Promise<void> {
  await removerImagem({
    service,
    remover: () =>
      withTenant(context, async (tx) => {
        const categoria = await exigirCategoria(tx, id)

        const quantidade = await countProductsInCategory(tx, id)
        if (quantidade > 0) {
          throw new ConflictError(
            `A categoria tem ${String(quantidade)} produto(s). Mova-os ou exclua-os antes.`,
            'CATEGORY_NOT_EMPTY',
          )
        }

        await deleteCategory(tx, id)

        await recordAudit(tx, context, {
          action: 'category.deleted',
          entityType: 'category',
          entityId: id,
          actorUserId,
          metadata: { name: categoria.name },
        })

        return { resultado: undefined, chaveAntiga: categoria.imageKey }
      }),
  })
}

/**
 * Reordena as categorias.
 *
 * Exige a lista **completa**. Uma lista parcial deixaria as ausentes com a
 * ordem antiga, intercaladas de um jeito que ninguém pediu. A mesma regra
 * recusa um id de outro estabelecimento: ele não pertence ao conjunto, e a
 * operação inteira é desfeita.
 */
export async function reordenarCategorias(
  context: TenantContext,
  actorUserId: string,
  ids: readonly string[],
): Promise<Category[]> {
  return withTenant(context, async (tx) => {
    const existentes = new Set((await listCategories(tx)).map((c) => c.id))
    const informados = new Set(ids)

    const completa =
      informados.size === ids.length &&
      informados.size === existentes.size &&
      [...informados].every((id) => existentes.has(id))

    if (!completa) {
      throw new AppError(
        'Informe todas as categorias do estabelecimento, cada uma uma vez.',
        400,
        'ORDER_INCOMPLETE',
      )
    }

    await reorderCategories(tx, ids)

    await recordAudit(tx, context, {
      action: 'category.reordered',
      entityType: 'category',
      actorUserId,
      metadata: { ordem: ids },
    })

    return listCategories(tx)
  })
}

export async function trocarImagemDaCategoria(
  service: StorageService,
  context: TenantContext,
  actorUserId: string,
  id: string,
  conteudo: Uint8Array,
): Promise<Category> {
  return trocarImagem({
    service,
    conteudo,
    montarChave: (tipo) => novaChaveDeImagem(context.tenantId, 'categories', tipo),
    gravar: (chaveNova) =>
      withTenant(context, async (tx) => {
        const anterior = await exigirCategoria(tx, id)
        const atualizada = await updateCategory(tx, id, { imageKey: chaveNova })
        if (!atualizada) throw categoriaNaoEncontrada()

        await recordAudit(tx, context, {
          action: 'category.image_changed',
          entityType: 'category',
          entityId: id,
          actorUserId,
          metadata: { de: anterior.imageKey, para: chaveNova },
        })

        return { resultado: atualizada, chaveAntiga: anterior.imageKey }
      }),
  })
}

export async function removerImagemDaCategoria(
  service: StorageService,
  context: TenantContext,
  actorUserId: string,
  id: string,
): Promise<Category> {
  return removerImagem({
    service,
    remover: () =>
      withTenant(context, async (tx) => {
        const anterior = await exigirCategoria(tx, id)
        const atualizada = await updateCategory(tx, id, { imageKey: null })
        if (!atualizada) throw categoriaNaoEncontrada()

        if (anterior.imageKey) {
          await recordAudit(tx, context, {
            action: 'category.image_removed',
            entityType: 'category',
            entityId: id,
            actorUserId,
            metadata: { removida: anterior.imageKey },
          })
        }

        return { resultado: atualizada, chaveAntiga: anterior.imageKey }
      }),
  })
}

// --- Produtos ---------------------------------------------------------------

export async function listarProdutos(
  context: TenantContext,
  filtro: { categoryId?: string | undefined } = {},
): Promise<Product[]> {
  return withTenant(context, (tx) => listProducts(tx, filtro))
}

export async function obterProduto(context: TenantContext, id: string): Promise<Product> {
  return withTenant(context, async (tx) => {
    const produto = await findProduct(tx, id)
    if (!produto) throw produtoNaoEncontrado()
    return produto
  })
}

export async function criarProduto(
  context: TenantContext,
  actorUserId: string,
  dados: DadosDeProduto,
): Promise<Product> {
  return withTenant(context, async (tx) => {
    // Verificação explícita para responder "categoria não encontrada" em vez de
    // um erro de chave estrangeira. A FK composta continua sendo a barreira
    // real contra uma categoria de outro estabelecimento.
    await exigirCategoria(tx, dados.categoryId)

    const criado = await insertProduct(tx, context, dados)

    await recordAudit(tx, context, {
      action: 'product.created',
      entityType: 'product',
      entityId: criado.id,
      actorUserId,
      metadata: { name: criado.name, priceInCents: criado.priceInCents },
    })

    return criado
  })
}

/**
 * Altera um produto.
 *
 * Além do registro geral de alteração, preço e disponibilidade ganham
 * registros próprios. O histórico de preço de um produto passa a ser uma
 * consulta por `product.price_changed`, em vez de uma garimpagem em JSON — e
 * são justamente os dois eventos que o lojista mais vai querer rastrear.
 */
export async function atualizarProduto(
  context: TenantContext,
  actorUserId: string,
  id: string,
  patch: ProdutoPatch,
): Promise<Product> {
  return withTenant(context, async (tx) => {
    const anterior = await findProduct(tx, id)
    if (!anterior) throw produtoNaoEncontrado()

    // O tipo é definido na criação. Transformar um combo em produto simples
    // deixaria componentes órfãos; o contrário, um combo vazio à venda.
    if (patch.type !== undefined && patch.type !== anterior.type) {
      throw new AppError(
        'O tipo do produto não pode ser alterado depois de criado.',
        400,
        'PRODUCT_TYPE_IMMUTABLE',
      )
    }

    if (patch.categoryId !== undefined && patch.categoryId !== anterior.categoryId) {
      await exigirCategoria(tx, patch.categoryId)
    }

    const atualizado = await updateProduct(tx, id, patch)
    if (!atualizado) throw produtoNaoEncontrado()

    const alteracoes = diferencas(anterior, atualizado)
    const base = { entityType: 'product', entityId: id, actorUserId } as const

    await recordAudit(tx, context, {
      ...base,
      action: 'product.updated',
      metadata: { alteracoes },
    })

    if (alteracoes.priceInCents) {
      await recordAudit(tx, context, {
        ...base,
        action: 'product.price_changed',
        metadata: alteracoes.priceInCents,
      })
    }

    if (alteracoes.isAvailable) {
      await recordAudit(tx, context, {
        ...base,
        action: 'product.availability_changed',
        metadata: alteracoes.isAvailable,
      })
    }

    return atualizado
  })
}

/**
 * Exclui um produto.
 *
 * Pode ser físico porque pedidos não dependem dele: na Fase 11, cada item de
 * pedido guarda uma cópia do nome e do preço no momento da compra.
 *
 * Um produto que é componente de combo é recusado, com o nome dos combos
 * afetados: excluí-lo deixaria o combo à venda pelo mesmo preço com um item a
 * menos. A FK com RESTRICT é a segunda barreira.
 */
export async function excluirProduto(
  service: StorageService,
  context: TenantContext,
  actorUserId: string,
  id: string,
): Promise<void> {
  await removerImagem({
    service,
    remover: () =>
      withTenant(context, async (tx) => {
        const combos = await combosQueContem(tx, id)
        if (combos.length > 0) {
          throw new ConflictError(
            `O produto faz parte de: ${combos.join(', ')}. Tire-o desses combos antes.`,
            'PRODUCT_IN_COMBO',
          )
        }

        const produto = await deleteProduct(tx, id)
        if (!produto) throw produtoNaoEncontrado()

        await recordAudit(tx, context, {
          action: 'product.deleted',
          entityType: 'product',
          entityId: id,
          actorUserId,
          metadata: { name: produto.name, priceInCents: produto.priceInCents },
        })

        return { resultado: undefined, chaveAntiga: produto.imageKey }
      }),
  })
}

export async function trocarImagemDoProduto(
  service: StorageService,
  context: TenantContext,
  actorUserId: string,
  id: string,
  conteudo: Uint8Array,
): Promise<Product> {
  return trocarImagem({
    service,
    conteudo,
    montarChave: (tipo) => novaChaveDeImagem(context.tenantId, 'products', tipo),
    gravar: (chaveNova) =>
      withTenant(context, async (tx) => {
        const anterior = await findProduct(tx, id)
        if (!anterior) throw produtoNaoEncontrado()

        const atualizado = await updateProduct(tx, id, { imageKey: chaveNova })
        if (!atualizado) throw produtoNaoEncontrado()

        await recordAudit(tx, context, {
          action: 'product.image_changed',
          entityType: 'product',
          entityId: id,
          actorUserId,
          metadata: { de: anterior.imageKey, para: chaveNova },
        })

        return { resultado: atualizado, chaveAntiga: anterior.imageKey }
      }),
  })
}

export async function removerImagemDoProduto(
  service: StorageService,
  context: TenantContext,
  actorUserId: string,
  id: string,
): Promise<Product> {
  return removerImagem({
    service,
    remover: () =>
      withTenant(context, async (tx) => {
        const anterior = await findProduct(tx, id)
        if (!anterior) throw produtoNaoEncontrado()

        const atualizado = await updateProduct(tx, id, { imageKey: null })
        if (!atualizado) throw produtoNaoEncontrado()

        if (anterior.imageKey) {
          await recordAudit(tx, context, {
            action: 'product.image_removed',
            entityType: 'product',
            entityId: id,
            actorUserId,
            metadata: { removida: anterior.imageKey },
          })
        }

        return { resultado: atualizado, chaveAntiga: anterior.imageKey }
      }),
  })
}
