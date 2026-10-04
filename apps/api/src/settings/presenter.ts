import type { TenantSettings } from '../db/schema/index.js'
import { urlDaImagem, type StorageService } from '../storage/index.js'

export type ConfiguracoesApresentadas<T extends TenantSettings = TenantSettings> = Omit<
  T,
  'logoKey' | 'coverKey'
> & {
  logoUrl: string | null
  coverUrl: string | null
}

/**
 * Troca as chaves de storage por URLs públicas na resposta.
 *
 * As chaves são detalhe interno — o cliente precisa de algo que possa pôr num
 * `<img src>`. Converter aqui, na borda, é o que permite o banco guardar só a
 * chave e continuar válido quando o storage mudar.
 */
export function apresentarConfiguracoes<T extends TenantSettings>(
  configuracoes: T,
  service: StorageService,
): ConfiguracoesApresentadas<T> {
  const { logoKey, coverKey, ...resto } = configuracoes

  return {
    ...resto,
    logoUrl: urlDaImagem(service, logoKey),
    coverUrl: urlDaImagem(service, coverKey),
  }
}
