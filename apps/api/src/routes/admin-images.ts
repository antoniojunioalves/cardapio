import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { currentUser, requireAuth, tenantContextOf } from '../auth/middleware.js'
import { AppError } from '../lib/errors.js'
import {
  removerImagem,
  substituirImagem,
  type ImagemDoEstabelecimento,
} from '../settings/images.js'
import { apresentarConfiguracoes } from '../settings/presenter.js'
import { storage } from '../storage/index.js'
import { configuracoesSchema } from './admin-settings.js'

/**
 * Lê o arquivo único do corpo multipart.
 *
 * O limite de tamanho já foi aplicado enquanto os bytes chegavam (ver
 * `plugins/uploads.ts`); `toBuffer` lança o 413 se ele estourar.
 */
async function lerArquivo(request: FastifyRequest): Promise<Uint8Array> {
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

export function adminImageRoutes(instance: FastifyInstance): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()
  const imagens: readonly ImagemDoEstabelecimento[] = ['logo', 'cover']
  const nome = { logo: 'o logo', cover: 'a capa' } as const

  for (const qual of imagens) {
    typed.put(
      `/settings/${qual}`,
      {
        schema: {
          tags: ['Configurações'],
          summary: `Envia ${nome[qual]} do estabelecimento`,
          description:
            'multipart/form-data com o campo `file`. Aceita JPEG, PNG e WebP, identificados pelo conteúdo — extensão e Content-Type são ignorados. SVG é recusado por poder carregar script.',
          consumes: ['multipart/form-data'],
          response: { 200: configuracoesSchema },
          security: [{ bearerAuth: [] }],
        },
        preHandler: requireAuth('settings:update'),
      },
      async (request) => {
        const conteudo = await lerArquivo(request)
        const atualizado = await substituirImagem(
          storage,
          tenantContextOf(request),
          currentUser(request).id,
          qual,
          conteudo,
        )
        return apresentarConfiguracoes(atualizado, storage)
      },
    )

    typed.delete(
      `/settings/${qual}`,
      {
        schema: {
          tags: ['Configurações'],
          summary: `Remove ${nome[qual]} do estabelecimento`,
          response: { 200: configuracoesSchema },
          security: [{ bearerAuth: [] }],
        },
        preHandler: requireAuth('settings:update'),
      },
      async (request) =>
        apresentarConfiguracoes(
          await removerImagem(storage, tenantContextOf(request), currentUser(request).id, qual),
          storage,
        ),
    )
  }
}
