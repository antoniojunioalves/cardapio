import { env } from '../config/env.js'
import { LocalStorageProvider } from './local-provider.js'
import type { StorageService } from './storage-service.js'

export { detectarTipoDeImagem, type TipoDeImagem } from './image-type.js'
export { novaChaveDeImagem } from './keys.js'
export { LocalStorageProvider } from './local-provider.js'
export type { UsoDaImagem } from './process-image.js'
export type { StorageService } from './storage-service.js'

/**
 * A instância usada pela aplicação. Único lugar que sabe qual provider está
 * ativo — o resto do código recebe um `StorageService`.
 */
export const storage: LocalStorageProvider = new LocalStorageProvider({
  raiz: env.STORAGE_LOCAL_PATH,
  urlBase: env.STORAGE_PUBLIC_URL,
})

/** URL pública de uma chave, ou nulo se não houver imagem. */
export function urlDaImagem(service: StorageService, key: string | null): string | null {
  return key ? service.publicUrl(key) : null
}
