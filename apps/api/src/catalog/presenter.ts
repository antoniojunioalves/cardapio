import type { Category, Product } from '../db/schema/index.js'
import { urlDaImagem, type StorageService } from '../storage/index.js'

export type CategoriaApresentada = Omit<Category, 'imageKey'> & { imageUrl: string | null }
export type ProdutoApresentado = Omit<Product, 'imageKey'> & { imageUrl: string | null }

/** Troca a chave de storage pela URL pública, na borda da resposta. */
export function apresentarCategoria(
  categoria: Category,
  service: StorageService,
): CategoriaApresentada {
  const { imageKey, ...resto } = categoria
  return { ...resto, imageUrl: urlDaImagem(service, imageKey) }
}

export function apresentarProduto(produto: Product, service: StorageService): ProdutoApresentado {
  const { imageKey, ...resto } = produto
  return { ...resto, imageUrl: urlDaImagem(service, imageKey) }
}
