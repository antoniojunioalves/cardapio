import { describe, expect, it } from 'vitest'

import { hashPassword, verifyPassword, wastePasswordTime } from '../src/auth/password.js'
import {
  generateRefreshToken,
  hashRefreshToken,
  parseRefreshTokenTenant,
  signAccessToken,
  verifyAccessToken,
} from '../src/auth/tokens.js'

describe('hash de senha', () => {
  it('usa argon2id', async () => {
    // A variante não é passada explicitamente porque o enum da biblioteca é
    // `const enum`, incompatível com verbatimModuleSyntax. Esta asserção é o
    // que impede uma atualização de degradar em silêncio para argon2i.
    expect(await hashPassword('qualquer')).toMatch(/^\$argon2id\$/)
  })

  it('aplica os parâmetros recomendados pela OWASP', async () => {
    expect(await hashPassword('qualquer')).toContain('$m=19456,t=2,p=1$')
  })

  it('gera hashes diferentes para a mesma senha', async () => {
    const [a, b] = await Promise.all([hashPassword('mesma'), hashPassword('mesma')])

    // Salt aleatório: sem ele, hashes iguais entregariam quais usuários
    // compartilham a mesma senha.
    expect(a).not.toBe(b)
  })

  it('confere a senha correta e recusa a errada', async () => {
    const hash = await hashPassword('a-senha-certa')

    expect(await verifyPassword(hash, 'a-senha-certa')).toBe(true)
    expect(await verifyPassword(hash, 'a-senha-errada')).toBe(false)
  })

  it('trata hash corrompido como credencial inválida, sem lançar', async () => {
    expect(await verifyPassword('isto-não-é-um-hash', 'qualquer')).toBe(false)
  })

  it('consome tempo comparável ao de uma verificação real', async () => {
    const hash = await hashPassword('referência')

    const t0 = performance.now()
    await verifyPassword(hash, 'errada')
    const real = performance.now() - t0

    const t1 = performance.now()
    await wastePasswordTime()
    const falsa = performance.now() - t1

    // Sem isso o login vira um oráculo de quais e-mails existem. A margem é
    // larga de propósito: o que importa é a ordem de grandeza, não o relógio.
    expect(falsa).toBeGreaterThan(real / 5)
  })
})

describe('token de acesso', () => {
  it('assina e verifica, preservando usuário e tenant', () => {
    const token = signAccessToken({ sub: 'usuario-1', tenantId: 'tenant-1' })

    expect(verifyAccessToken(token)).toMatchObject({ sub: 'usuario-1', tenantId: 'tenant-1' })
  })

  it('recusa token adulterado', () => {
    const token = signAccessToken({ sub: 'usuario-1', tenantId: 'tenant-1' })
    const [cabecalho, , assinatura] = token.split('.')
    const outroPayload = Buffer.from(
      JSON.stringify({ sub: 'usuario-1', tenantId: 'tenant-DE-OUTRO' }),
    ).toString('base64url')

    expect(verifyAccessToken(`${cabecalho}.${outroPayload}.${assinatura}`)).toBeNull()
  })

  it('recusa token sem assinatura, com alg none', () => {
    // O ataque clássico: trocar o algoritmo por "none" e remover a assinatura.
    // Só é recusado porque o verificador fixa a lista de algoritmos aceitos.
    const cabecalho = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(
      JSON.stringify({ sub: 'invasor', tenantId: 'tenant-alheio' }),
    ).toString('base64url')

    expect(verifyAccessToken(`${cabecalho}.${payload}.`)).toBeNull()
  })

  it('recusa lixo', () => {
    expect(verifyAccessToken('nem-parece-um-token')).toBeNull()
    expect(verifyAccessToken('')).toBeNull()
  })
})

describe('refresh token', () => {
  const tenantId = '01a0d928-2736-732c-99b0-3bbf8ab47876'

  it('carrega o tenant como prefixo e guarda apenas o hash', () => {
    const { token, tokenHash } = generateRefreshToken(tenantId)

    expect(parseRefreshTokenTenant(token)).toBe(tenantId)
    expect(tokenHash).toBe(hashRefreshToken(token))
    expect(tokenHash).not.toContain(token.split('.')[1] ?? '')
  })

  it('nunca repete', () => {
    const emitidos = new Set(
      Array.from({ length: 200 }, () => generateRefreshToken(tenantId).token),
    )

    expect(emitidos.size).toBe(200)
  })

  it('trocar o prefixo muda o hash — a dica não vira credencial', () => {
    const { token } = generateRefreshToken(tenantId)
    const outroTenant = '01a0d928-2790-7ac1-94b6-879802a87885'
    const adulterado = token.replace(tenantId, outroTenant)

    // O prefixo só estreita a busca. Trocado, o hash procurado deixa de
    // existir — não há como apontar um token válido para outro tenant.
    expect(parseRefreshTokenTenant(adulterado)).toBe(outroTenant)
    expect(hashRefreshToken(adulterado)).not.toBe(hashRefreshToken(token))
  })

  it('recusa prefixo que não é uuid', () => {
    expect(parseRefreshTokenTenant('nao-e-uuid.alguma-coisa')).toBeNull()
    expect(parseRefreshTokenTenant('sem-ponto')).toBeNull()
  })
})
