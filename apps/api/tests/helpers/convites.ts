import type { FastifyInstance, LightMyRequestResponse } from 'fastify'

import { email, MemoryEmailProvider } from '../../src/email/index.js'

/** A caixa de saída dos testes: eles rodam com `EMAIL_DRIVER=memory`. */
export function caixaDeSaida(): MemoryEmailProvider {
  if (!(email instanceof MemoryEmailProvider)) throw new Error('os testes usam EMAIL_DRIVER=memory')
  return email
}

/** O token do último convite que saiu para o endereço, lido do link do e-mail. */
export function tokenDoConvitePara(para: string): string {
  const convites = caixaDeSaida().enviados.filter(
    (m) => m.para === para && m.assunto.startsWith('Convite'),
  )
  const token = /\/convite#token=(\S+)/.exec(convites.at(-1)?.texto ?? '')?.[1]
  if (!token) throw new Error(`nenhum convite para ${para}`)
  return token
}

/** Aceita o convite pela rota pública, como a página do link faz. */
export function aceitarConvite(
  app: FastifyInstance,
  token: string,
  dados: { password: string; name?: string },
  refreshToken?: string,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/invitation/accept',
    payload: { token, ...dados },
    ...(refreshToken && { cookies: { refresh_token: refreshToken } }),
  })
}
