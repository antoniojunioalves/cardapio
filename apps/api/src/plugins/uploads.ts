import { mkdir } from 'node:fs/promises'

import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import type { FastifyInstance } from 'fastify'

import { env } from '../config/env.js'
import { storage } from '../storage/index.js'

/**
 * Recebimento e entrega de arquivos enviados.
 *
 * Só se aplica ao provider local. Com S3, as imagens seriam servidas pelo
 * próprio bucket ou por uma CDN, e este plugin não serviria nada.
 */
export async function registerUploads(instance: FastifyInstance): Promise<void> {
  await instance.register(multipart, {
    limits: {
      // O limite é aplicado enquanto o arquivo chega, e não depois: um upload
      // de 2 GB é interrompido no byte 5.242.881, sem ocupar a memória toda.
      fileSize: env.UPLOAD_MAX_BYTES,
      files: 1,
      fields: 0,
    },
  })

  await mkdir(storage.diretorioRaiz, { recursive: true })

  await instance.register(async (escopo) => {
    // O helmet define `Cross-Origin-Resource-Policy: same-origin` em tudo. É o
    // certo para a API, mas bloquearia as imagens: o frontend roda em outra
    // origem (localhost:5173 em desenvolvimento, uma CDN em produção), e o
    // navegador recusaria o <img> em silêncio — só aparece como imagem
    // quebrada, sem erro na tela.
    escopo.addHook('onSend', async (_request, reply) => {
      reply.header('cross-origin-resource-policy', 'cross-origin')
      // Cada upload gera uma chave nova, então o conteúdo de uma URL nunca
      // muda: pode ficar em cache para sempre.
      reply.header('cache-control', 'public, max-age=31536000, immutable')
    })

    await escopo.register(fastifyStatic, {
      root: storage.diretorioRaiz,
      prefix: '/uploads/',
      decorateReply: false,
      index: false,
      list: false,
      dotfiles: 'deny',
    })
  })
}
