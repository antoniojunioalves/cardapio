import type { TenantSettings } from '../db/schema/index.js'
import { urlDaImagem, type StorageService } from '../storage/index.js'

export type ConfiguracoesApresentadas = Omit<TenantSettings, 'logoKey' | 'coverKey'> & {
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
export function apresentarConfiguracoes(
  configuracoes: TenantSettings,
  service: StorageService,
): ConfiguracoesApresentadas {
  const { logoKey, coverKey, ...resto } = configuracoes

  return {
    ...resto,
    logoUrl: urlDaImagem(service, logoKey),
    coverUrl: urlDaImagem(service, coverKey),
  }
}
