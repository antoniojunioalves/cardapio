/**
 * Contrato de armazenamento de arquivos.
 *
 * O domínio só conhece **chaves** — `tenants/{id}/logo/{uuid}.webp` — e nunca
 * um caminho de disco ou uma URL. É isso que permite trocar o disco local por
 * S3 (ROADMAP) escrevendo um provider novo, sem tocar em regra de negócio nem
 * migrar o que está gravado no banco.
 *
 * Pela mesma razão a URL pública não é gravada no banco: ela é calculada na
 * leitura por `publicUrl`, e muda sozinha quando o storage muda.
 */
export interface StorageService {
  put(key: string, conteudo: Uint8Array, contentType: string): Promise<void>
  /** Idempotente: apagar o que não existe não é erro. */
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  publicUrl(key: string): string
}

/**
 * Formato aceito para uma chave: segmentos com letras, dígitos, hífen e
 * sublinhado, e um ponto só na extensão final.
 *
 * As chaves são sempre montadas pelo servidor, então isto nunca deveria
 * recusar nada. Existe como segunda defesa: se um dia alguém montar uma chave
 * com dado vindo do cliente, `../../etc/passwd` morre aqui, em qualquer
 * provider.
 */
const CHAVE_VALIDA = /^[a-z0-9_-]+(\/[a-z0-9_-]+)*\.[a-z0-9]+$/

export function assertChaveValida(key: string): void {
  if (!CHAVE_VALIDA.test(key)) {
    throw new Error(`chave de storage inválida: ${JSON.stringify(key)}`)
  }
}
