import { randomUUID } from 'node:crypto'

import type { UsoDaImagem } from './process-image.js'

/**
 * Monta a chave de uma imagem nova.
 *
 * O nome enviado pelo cliente não participa: acentos, espaços, `../` e nomes
 * repetidos deixam de ser problema porque nunca chegam aqui. O prefixo do
 * tenant mantém os arquivos de cada estabelecimento separados, o que facilita
 * apagar tudo de um estabelecimento e, no S3, aplicar política por prefixo.
 *
 * Sempre `.webp`: é o formato em que toda imagem é guardada (`process-image.ts`).
 */
export function novaChaveDeImagem(tenantId: string, uso: UsoDaImagem): string {
  return `tenants/${tenantId}/${uso}/${randomUUID()}.webp`
}
