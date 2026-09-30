import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { currentUser, requireAuth, tenantContextOf } from '../auth/middleware.js'
import {
  removerImagem,
  substituirImagem,
  type ImagemDoEstabelecimento,
} from '../settings/images.js'
import { apresentarConfiguracoes } from '../settings/presenter.js'
import { storage } from '../storage/index.js'
import { configuracoesSchema } from './admin-settings.js'
import { DESCRICAO_DO_UPLOAD, lerArquivo } from './helpers/multipart.js'

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
          description: DESCRICAO_DO_UPLOAD,
          consumes: ['multipart/form-data'],
          response: { 200: configuracoesSchema },
          security: [{ bearerAuth: [] }],
        },
        onRequest: requireAuth('settings:update'),
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
        onRequest: requireAuth('settings:update'),
      },
      async (request) =>
        apresentarConfiguracoes(
          await removerImagem(storage, tenantContextOf(request), currentUser(request).id, qual),
          storage,
        ),
    )
  }
}
