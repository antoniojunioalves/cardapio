import { Writable } from 'node:stream'

import { pino } from 'pino'
import { describe, expect, it } from 'vitest'

import { loggerOptions } from '../src/lib/logger.js'

/** Um logger com as opções da aplicação, escrevendo numa variável. */
function capturar() {
  let saida = ''
  const destino = new Writable({
    write(pedaco: Buffer, _codificacao, pronto) {
      saida += pedaco.toString()
      pronto()
    },
  })
  const { transport: _transport, ...opcoes } = loggerOptions
  return { log: pino({ ...opcoes, level: 'info' }, destino), saida: () => saida }
}

describe('o que não pode cair no log', () => {
  it('cabeçalhos de credencial, senha e tokens saem censurados', () => {
    const { log, saida } = capturar()

    log.info(
      {
        req: { headers: { authorization: 'Bearer eyJ.segredo', cookie: 'refresh_token=abc.def' } },
        res: { headers: { 'set-cookie': 'refresh_token=novo.segredo; HttpOnly' } },
        corpo: {
          password: 'minha-senha',
          passwordHash: '$argon2id$segredo',
          token: 'tok',
          accessToken: 'acesso',
          refreshToken: 'renovacao',
        },
      },
      'requisição',
    )

    const texto = saida()
    for (const segredo of [
      'eyJ.segredo',
      'abc.def',
      'novo.segredo',
      'minha-senha',
      '$argon2id$segredo',
      '"tok"',
      'acesso',
      'renovacao',
    ]) {
      expect(texto, segredo).not.toContain(segredo)
    }
    expect(texto).toContain('[REDACTED]')
  })
})
