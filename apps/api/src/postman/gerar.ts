import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { buildApp } from '../app.js'
import { closeDatabase } from '../db/index.js'
import { infraLogger } from '../lib/logger.js'
import { ARQUIVO_DA_COLECAO, gerarColecao, type DocumentoOpenApi } from './colecao.js'

/**
 * `pnpm postman`: regenera a coleção do Postman a partir das rotas.
 *
 * Monta a aplicação sem subir servidor e sem o canal ao vivo — então não
 * precisa do banco de pé —, lê a descrição OpenAPI e grava o arquivo. Depois é
 * só importar de novo no Postman, que reconhece a coleção e oferece substituir.
 */
const app = await buildApp({ rateLimit: false, tempoReal: false })

try {
  await app.ready()
  const colecao = gerarColecao(app.swagger() as unknown as DocumentoOpenApi)

  await mkdir(path.dirname(ARQUIVO_DA_COLECAO), { recursive: true })
  await writeFile(ARQUIVO_DA_COLECAO, `${JSON.stringify(colecao, null, 2)}\n`)

  const requisicoes = colecao.item.reduce((total, pasta) => total + pasta.item.length, 0)
  infraLogger.info(
    { arquivo: path.relative(process.cwd(), ARQUIVO_DA_COLECAO), requisicoes },
    'coleção do Postman gerada — importe de novo no Postman',
  )
} finally {
  await app.close()
  await closeDatabase()
}
