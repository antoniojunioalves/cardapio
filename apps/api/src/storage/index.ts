import { randomUUID } from 'node:crypto'

import { env } from '../config/env.js'
import { EXTENSAO, type TipoDeImagem } from './image-type.js'
import { LocalStorageProvider } from './local-provider.js'
import type { StorageService } from './storage-service.js'

export { detectarTipoDeImagem, type TipoDeImagem } from './image-type.js'
export { LocalStorageProvider } from './local-provider.js'
export type { StorageService } from './storage-service.js'

/**
 * A instância usada pela aplicação. Único lugar que sabe qual provider está
 * ativo — o resto do código recebe um `StorageService`.
 */
export const storage: LocalStorageProvider = new LocalStorageProvider({
  raiz: env.STORAGE_LOCAL_PATH,
  urlBase: env.STORAGE_PUBLIC_URL,
})

export type CategoriaDeImagem = 'logo' | 'cover' | 'products'

/**
 * Monta a chave de uma imagem nova.
 *
 * O nome enviado pelo cliente não participa: acentos, espaços, `../` e nomes
 * repetidos deixam de ser problema porque nunca chegam aqui. O prefixo do
 * tenant mantém os arquivos de cada estabelecimento separados, o que facilita
 * apagar tudo de um estabelecimento e, no S3, aplicar política por prefixo.
 */
export function novaChaveDeImagem(
  tenantId: string,
  categoria: CategoriaDeImagem,
  tipo: TipoDeImagem,
): string {
  return `tenants/${tenantId}/${categoria}/${randomUUID()}.${EXTENSAO[tipo]}`
}

/** URL pública de uma chave, ou nulo se não houver imagem. */
export function urlDaImagem(service: StorageService, key: string | null): string | null {
  return key ? service.publicUrl(key) : null
}
