import { userInfo } from 'node:os'

import { closeDatabase } from '../db/index.js'
import { AppError } from '../lib/errors.js'
import { infraLogger } from '../lib/logger.js'
import { interpretar, USO } from './args.js'
import { executar } from './commands.js'

/**
 * O comando da plataforma: `pnpm plataforma <ação>`.
 *
 * É como o Super Admin age no MVP — listar, suspender, reativar, trocar o
 * plano e reenviar a confirmação. Roda no servidor, com o `.env` da API; não
 * há rota HTTP para estas ações, então quem não tem acesso ao servidor não as
 * alcança. Sai com 0 se deu certo, 1 se a ação foi recusada e 2 se o comando
 * foi digitado errado.
 */

const interpretado = interpretar(process.argv.slice(2))

if (!interpretado.ok) {
  process.stderr.write(`${interpretado.erro}\n\n${USO}\n`)
  process.exit(2)
}

let saida = 0
try {
  const operador = interpretado.operador ?? userInfo().username
  process.stdout.write(`${await executar(interpretado.comando, { operador })}\n`)
} catch (error) {
  saida = 1
  if (error instanceof AppError) {
    // Recusa esperada — endereço que não existe, já suspenso: só a mensagem.
    process.stderr.write(`${error.message}\n`)
  } else {
    infraLogger.fatal({ err: error }, 'falha no comando da plataforma')
  }
}

await closeDatabase()
process.exit(saida)
