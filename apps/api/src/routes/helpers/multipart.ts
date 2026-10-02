import type { FastifyRequest } from 'fastify'

import { AppError } from '../../lib/errors.js'

/**
 * Lê o arquivo único do corpo multipart.
 *
 * O limite de tamanho já foi aplicado enquanto os bytes chegavam (ver
 * `plugins/uploads.ts`); `toBuffer` lança o 413 se ele estourar.
 */
export async function lerArquivo(request: FastifyRequest): Promise<Uint8Array> {
  if (!request.isMultipart()) {
    throw new AppError(
      'Envie a imagem como multipart/form-data, no campo "file".',
      400,
      'MULTIPART_REQUIRED',
    )
  }

  const arquivo = await request.file()
  if (!arquivo) {
    throw new AppError('Nenhum arquivo enviado no campo "file".', 400, 'FILE_REQUIRED')
  }

  return arquivo.toBuffer()
}

/** Descrição do upload, repetida em toda rota de imagem da documentação. */
export const DESCRICAO_DO_UPLOAD =
  'multipart/form-data com o campo `file`. Aceita JPEG, PNG e WebP, identificados pelo conteúdo — extensão e Content-Type são ignorados. SVG é recusado por poder carregar script. A imagem é tratada antes de ser guardada: sai sem metadados (inclusive a localização da foto), girada como a câmera anotou, reduzida ao tamanho do uso e em WebP. Imagem que não abre responde 422 `UNREADABLE_IMAGE`; com mais de 50 megapixels, 422 `IMAGE_TOO_LARGE`.'
