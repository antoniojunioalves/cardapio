import { createHash, randomBytes } from 'node:crypto'

import { createSigner, createVerifier } from 'fast-jwt'

import { env } from '../config/env.js'

export interface AccessTokenPayload {
  /** Id do usuário. */
  sub: string
  tenantId: string
}

const MINUTO_EM_MS = 60_000

const assinar = createSigner({
  key: env.JWT_SECRET,
  algorithm: 'HS256',
  expiresIn: env.JWT_ACCESS_TTL_MINUTES * MINUTO_EM_MS,
})

/**
 * O `algorithms` fixo não é detalhe: sem ele, um atacante pode apresentar um
 * token dizendo `alg: none` — ou trocar HMAC por RSA — e conseguir que a
 * biblioteca o aceite. Travar a lista fecha a família inteira de ataques de
 * confusão de algoritmo.
 */
const verificar = createVerifier({
  key: env.JWT_SECRET,
  algorithms: ['HS256'],
})

export function signAccessToken(payload: AccessTokenPayload): string {
  return assinar(payload)
}

/** Devolve o payload, ou `null` se o token for inválido, expirado ou forjado. */
export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const payload = verificar(token) as AccessTokenPayload
    return typeof payload.sub === 'string' && typeof payload.tenantId === 'string' ? payload : null
  } catch {
    return null
  }
}

/**
 * Token opaco de um tenant: `{tenantId}.{256 bits aleatórios}`. É o formato do
 * refresh token e do link de confirmação de e-mail do cadastro.
 *
 * **Não é um JWT**, e é uma escolha. Os dois já precisam de uma consulta ao
 * banco — para saber se o token foi revogado ou usado —, então a assinatura
 * não compraria nada que a consulta não dê, e em troca traria toda a
 * superfície de verificação de JWT. Um valor aleatório opaco de 256 bits faz o
 * mesmo trabalho com menos partes móveis.
 *
 * No banco fica só o hash SHA-256. Um vazamento da tabela não entrega sessão
 * nem confirmação nenhuma. SHA-256 e não argon2 porque aqui não há senha
 * escolhida por humano para proteger: são 256 bits aleatórios, sem dicionário
 * a atacar, e um hash lento só encareceria cada uso.
 */
export function generateTenantToken(tenantId: string): { token: string; tokenHash: string } {
  const token = `${tenantId}.${randomBytes(32).toString('base64url')}`
  return { token, tokenHash: hashToken(token) }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Extrai o tenant embutido no token.
 *
 * Existe para resolver um impasse: as tabelas de tokens são protegidas por
 * RLS, então encontrar a linha exige contexto de tenant — mas o contexto viria
 * justamente do token. O prefixo quebra o círculo.
 *
 * Ele é uma **dica de roteamento, não uma credencial**. Quem trocar o prefixo
 * por outro tenant muda o token inteiro, e o hash procurado deixa de existir:
 * a dica só consegue estreitar a busca, nunca alargá-la.
 */
export function parseTokenTenant(token: string): string | null {
  const prefixo = token.split('.')[0]
  return prefixo && UUID.test(prefixo) ? prefixo : null
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** O refresh token é um token de tenant; os nomes próprios deixam claro quem o usa. */
export const generateRefreshToken = generateTenantToken
export const parseRefreshTokenTenant = parseTokenTenant
export const hashRefreshToken = hashToken

export function refreshTokenExpiresAt(): Date {
  const agora = Date.now()
  return new Date(agora + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * MINUTO_EM_MS)
}
