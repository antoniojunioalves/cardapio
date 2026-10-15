import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { closeDatabase, db } from '../src/db/index.js'
import { auditLogs, refreshTokens, tenants, users } from '../src/db/schema/index.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'
import {
  criarTenantComUsuario,
  removerContaSemVinculo,
  removerTenantDeTeste,
  SENHA_PADRAO,
  sessaoDe,
  vincularConta,
  type TenantDeTeste,
} from './helpers/fixtures.js'

let app: FastifyInstance
let fixture: TenantDeTeste

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()
  fixture = await criarTenantComUsuario({ permissoes: ['products:read', 'orders:update'] })
})

afterAll(async () => {
  await app.close()
  await removerTenantDeTeste(fixture)
  await closeDatabase()
})

function entrar(corpo: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: corpo })
}

interface RespostaSessao {
  accessToken: string
  user: { id: string; tenantId: string; email: string; permissions: string[] }
  establishment: { id: string; slug: string; name: string; status: string }
}

describe('POST /api/v1/auth/login', () => {
  it('autentica só com e-mail e senha, e devolve sessão com as permissões efetivas', async () => {
    const resposta = await entrar({ email: fixture.email, password: SENHA_PADRAO })

    expect(resposta.statusCode).toBe(200)

    const sessao = sessaoDe<RespostaSessao>(resposta)
    expect(sessao.user).toMatchObject({ id: fixture.userId, tenantId: fixture.tenantId })
    // As do perfil dele, na ordem do catálogo.
    expect(sessao.user.permissions).toEqual(['orders:update', 'products:read'])
    expect(sessao.accessToken.split('.')).toHaveLength(3)
    expect(sessao.refreshToken.startsWith(`${fixture.tenantId}.`)).toBe(true)
  })

  it('devolve o estabelecimento a que a pessoa pertence, para o painel saber aonde ir', async () => {
    const resposta = await entrar({ email: fixture.email, password: SENHA_PADRAO })

    expect(sessaoDe<RespostaSessao>(resposta).establishment).toMatchObject({
      id: fixture.tenantId,
      slug: fixture.slug,
      status: 'ACTIVE',
    })
  })

  it('aceita o e-mail com maiúsculas', async () => {
    const resposta = await entrar({ email: fixture.email.toUpperCase(), password: SENHA_PADRAO })

    expect(resposta.statusCode).toBe(200)
  })

  it('nunca devolve o hash da senha', async () => {
    const resposta = await entrar({ email: fixture.email, password: SENHA_PADRAO })

    expect(resposta.body).not.toContain('argon2')
    expect(resposta.body).not.toContain('passwordHash')
  })

  it('registra a entrada na auditoria', async () => {
    await entrar({ email: fixture.email, password: SENHA_PADRAO })

    const registros = await withTenant(tenantContextFromUser(fixture.tenantId), (tx) =>
      tx.select({ action: auditLogs.action, actor: auditLogs.actorUserId }).from(auditLogs),
    )

    expect(registros.some((r) => r.action === 'auth.login' && r.actor === fixture.userId)).toBe(
      true,
    )
  })

  it('recusa senha errada com mensagem genérica', async () => {
    const resposta = await entrar({ email: fixture.email, password: 'senha-errada' })

    expect(resposta.statusCode).toBe(401)
    expect(resposta.json<{ error: { code: string } }>().error.code).toBe('UNAUTHORIZED')
  })

  it('responde a e-mail inexistente igual a senha errada', async () => {
    const resposta = await entrar({ email: 'ninguem@exemplo.com', password: SENHA_PADRAO })

    // Mesma resposta da senha errada: o endpoint não pode servir de oráculo
    // de quais e-mails estão cadastrados.
    expect(resposta.statusCode).toBe(401)
    expect(resposta.json<{ error: { code: string } }>().error.code).toBe('UNAUTHORIZED')
  })

  it('ignora um estabelecimento mandado no corpo: o tenant é o do e-mail', async () => {
    const outro = await criarTenantComUsuario()

    try {
      const resposta = await entrar({
        email: fixture.email,
        password: SENHA_PADRAO,
        tenantSlug: outro.slug,
        tenantId: outro.tenantId,
      })

      const sessao = sessaoDe<RespostaSessao>(resposta)
      expect(sessao.user.tenantId).toBe(fixture.tenantId)
      expect(sessao.establishment.slug).toBe(fixture.slug)
    } finally {
      await removerTenantDeTeste(outro)
    }
  })

  it('valida o corpo antes de tocar no banco', async () => {
    const resposta = await entrar({ email: 'não-é-email' })

    expect(resposta.statusCode).toBe(400)
    expect(resposta.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR')
  })
})

describe('conta desativada', () => {
  let desativado: TenantDeTeste

  beforeAll(async () => {
    desativado = await criarTenantComUsuario({ ativo: false })
  })

  afterAll(async () => {
    await removerTenantDeTeste(desativado)
  })

  it('só revela que o acesso está desativado depois de a senha conferir', async () => {
    const comSenhaCerta = await entrar({ email: desativado.email, password: SENHA_PADRAO })

    expect(comSenhaCerta.statusCode).toBe(403)
    expect(comSenhaCerta.json<{ error: { message: string } }>().error.message).toBe(
      'Seu acesso foi desativado. Fale com o administrador do estabelecimento.',
    )

    // Quem não sabe a senha continua recebendo o 401 genérico — a informação
    // só chega a quem já provou ser o dono da conta.
    const comSenhaErrada = await entrar({ email: desativado.email, password: 'chute' })

    expect(comSenhaErrada.statusCode).toBe(401)
  })
})

describe('estabelecimento suspenso', () => {
  let suspenso: TenantDeTeste

  beforeAll(async () => {
    suspenso = await criarTenantComUsuario()
    await db.update(tenants).set({ status: 'SUSPENDED' }).where(eq(tenants.id, suspenso.tenantId))
  })

  afterAll(async () => {
    await removerTenantDeTeste(suspenso)
  })

  it('só revela a suspensão depois de a senha conferir', async () => {
    const comSenhaCerta = await entrar({ email: suspenso.email, password: SENHA_PADRAO })

    expect(comSenhaCerta.statusCode).toBe(403)
    expect(comSenhaCerta.json<{ error: { message: string } }>().error.message).toContain('suspenso')
    expect(comSenhaCerta.cookies).toEqual([])

    // Sem a senha, não dá para descobrir que o e-mail é de um estabelecimento
    // suspenso — nem que o e-mail existe.
    const comSenhaErrada = await entrar({ email: suspenso.email, password: 'chute' })

    expect(comSenhaErrada.statusCode).toBe(401)
    expect(comSenhaErrada.json<{ error: { code: string } }>().error.code).toBe('UNAUTHORIZED')
  })

  it('não abre sessão nem registra a entrada', async () => {
    await entrar({ email: suspenso.email, password: SENHA_PADRAO })

    const { sessoes, entradas } = await withTenant(
      tenantContextFromUser(suspenso.tenantId),
      async (tx) => ({
        sessoes: await tx.select({ id: refreshTokens.id }).from(refreshTokens),
        entradas: await tx
          .select({ id: auditLogs.id })
          .from(auditLogs)
          .where(eq(auditLogs.action, 'auth.login')),
      }),
    )

    expect(sessoes).toEqual([])
    expect(entradas).toEqual([])
  })
})

describe('GET /api/v1/auth/me', () => {
  it('exige autenticação', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/api/v1/auth/me' })

    expect(resposta.statusCode).toBe(401)
  })

  it('recusa token forjado', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: 'Bearer nao.e.um.token' },
    })

    expect(resposta.statusCode).toBe(401)
  })

  it('devolve o usuário autenticado e suas permissões', async () => {
    const { accessToken } = sessaoDe<RespostaSessao>(
      await entrar({ email: fixture.email, password: SENHA_PADRAO }),
    )

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    })

    expect(resposta.statusCode).toBe(200)
    expect(resposta.json()).toMatchObject({ id: fixture.userId, tenantId: fixture.tenantId })
  })
})

describe('renovação de sessão', () => {
  it('rotaciona: o token antigo para de valer e o novo funciona', async () => {
    const primeira = sessaoDe<RespostaSessao>(
      await entrar({ email: fixture.email, password: SENHA_PADRAO }),
    )

    const renovada = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: primeira.refreshToken },
    })

    expect(renovada.statusCode).toBe(200)
    const nova = sessaoDe<RespostaSessao>(renovada)
    expect(nova.refreshToken).not.toBe(primeira.refreshToken)

    const comNovo = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: nova.refreshToken },
    })
    expect(comNovo.statusCode).toBe(200)
  })

  it('reapresentar um token já rotacionado derruba todas as sessões do usuário', async () => {
    const sessaoA = sessaoDe<RespostaSessao>(
      await entrar({ email: fixture.email, password: SENHA_PADRAO }),
    )
    const sessaoB = sessaoDe<RespostaSessao>(
      await entrar({ email: fixture.email, password: SENHA_PADRAO }),
    )

    // Rotaciona a sessão A normalmente.
    const rotacionada = sessaoDe<RespostaSessao>(
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: sessaoA.refreshToken },
      }),
    )

    // Alguém reapresenta o token antigo: ou é cópia roubada, ou o legítimo
    // usando um token que já devia ter sido descartado. Não há como saber
    // qual, então tudo cai.
    const reuso = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: sessaoA.refreshToken },
    })
    expect(reuso.statusCode).toBe(401)

    for (const token of [rotacionada.refreshToken, sessaoB.refreshToken]) {
      const depois = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: token },
      })
      expect(depois.statusCode).toBe(401)
    }

    const registros = await withTenant(tenantContextFromUser(fixture.tenantId), (tx) =>
      tx.select({ action: auditLogs.action }).from(auditLogs),
    )
    expect(registros.some((r) => r.action === 'auth.refresh_reuse_detected')).toBe(true)
  })
})

describe('POST /api/v1/auth/logout', () => {
  it('revoga o refresh token e é idempotente', async () => {
    const sessao = sessaoDe<RespostaSessao>(
      await entrar({ email: fixture.email, password: SENHA_PADRAO }),
    )

    const saida = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken: sessao.refreshToken },
    })
    expect(saida.statusCode).toBe(204)

    // Sair de novo não é erro — o cliente pode repetir a chamada.
    const denovo = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken: sessao.refreshToken },
    })
    expect(denovo.statusCode).toBe(204)

    const revogado = await withTenant(tenantContextFromUser(fixture.tenantId), (tx) =>
      tx
        .select({ revokedAt: refreshTokens.revokedAt })
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, fixture.userId)),
    )
    expect(revogado.some((r) => r.revokedAt !== null)).toBe(true)
  })
})

describe('o banco nunca guarda o refresh token em claro', () => {
  it('guarda apenas o hash', async () => {
    const sessao = sessaoDe<RespostaSessao>(
      await entrar({ email: fixture.email, password: SENHA_PADRAO }),
    )

    const linhas = await withTenant(tenantContextFromUser(fixture.tenantId), (tx) =>
      tx.select({ tokenHash: refreshTokens.tokenHash }).from(refreshTokens),
    )

    expect(linhas.every((l) => l.tokenHash !== sessao.refreshToken)).toBe(true)
    expect(linhas.every((l) => /^[0-9a-f]{64}$/.test(l.tokenHash))).toBe(true)
  })
})

describe('limite de tentativas de login', () => {
  it('bloqueia depois de poucas tentativas', async () => {
    const comLimite = await buildApp()
    await comLimite.ready()

    const alvo = { email: fixture.email, password: 'errada' }
    const codigos: number[] = []

    for (let i = 0; i < 7; i += 1) {
      const r = await comLimite.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: alvo,
      })
      codigos.push(r.statusCode)
    }

    // O custo do argon2 sozinho não impede força bruta; o limite dedicado sim.
    expect(codigos.filter((c) => c === 429).length).toBeGreaterThan(0)
    expect(codigos.at(-1)).toBe(429)

    await comLimite.close()
  })
})

describe('refresh token em cookie', () => {
  it('vai só no cookie httpOnly e SameSite=Strict, restrito às rotas de autenticação', async () => {
    const resposta = await entrar({
      email: fixture.email,
      password: SENHA_PADRAO,
    })

    expect(resposta.json()).not.toHaveProperty('refreshToken')
    const cookie = resposta.cookies.find((c) => c.name === 'refresh_token')
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/v1/auth' })
    expect(cookie?.value.startsWith(`${fixture.tenantId}.`)).toBe(true)
  })

  it('a renovação funciona só com o cookie, e troca o cookie', async () => {
    const primeira = sessaoDe<RespostaSessao>(
      await entrar({ email: fixture.email, password: SENHA_PADRAO }),
    )

    const renovada = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refresh_token: primeira.refreshToken },
    })

    expect(renovada.statusCode).toBe(200)
    expect(renovada.json()).not.toHaveProperty('refreshToken')
    const novo = renovada.cookies.find((c) => c.name === 'refresh_token')?.value
    expect(novo).toBeTruthy()
    expect(novo).not.toBe(primeira.refreshToken)
  })

  it('sem cookie e sem corpo, a renovação é recusada', async () => {
    const resposta = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh' })
    expect(resposta.statusCode).toBe(401)
  })

  it('o logout revoga e apaga o cookie', async () => {
    const sessao = sessaoDe<RespostaSessao>(
      await entrar({ email: fixture.email, password: SENHA_PADRAO }),
    )

    const saida = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { refresh_token: sessao.refreshToken },
    })

    expect(saida.statusCode).toBe(204)
    const apagado = saida.cookies.find((c) => c.name === 'refresh_token')
    expect(apagado?.value).toBe('')
    const depois = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refresh_token: sessao.refreshToken },
    })
    expect(depois.statusCode).toBe(401)
  })
})

describe('uma conta em mais de um estabelecimento', () => {
  /** A pessoa é dona da casa e também da equipe do outro, com a mesma conta. */
  let casa: TenantDeTeste
  let outro: TenantDeTeste
  let noOutro: TenantDeTeste
  /** Um estabelecimento em que a conta não está. */
  let alheio: TenantDeTeste

  beforeAll(async () => {
    casa = await criarTenantComUsuario({ dono: true })
    outro = await criarTenantComUsuario()
    noOutro = await vincularConta(casa, outro, { permissoes: ['orders:read'] })
    alheio = await criarTenantComUsuario()
  })

  afterAll(async () => {
    for (const f of [outro, alheio, casa]) await removerTenantDeTeste(f)
  })

  const trocar = (refreshToken: string | undefined, establishmentSlug: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/switch',
      payload: { establishmentSlug },
      ...(refreshToken !== undefined && { cookies: { refresh_token: refreshToken } }),
    })

  const renovar = (refreshToken: string) =>
    app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken } })

  const estabelecimentos = (accessToken: string) =>
    app.inject({
      method: 'GET',
      url: '/api/v1/auth/establishments',
      headers: { authorization: `Bearer ${accessToken}` },
    })

  /** Uma sessão na casa, qualquer que tenha sido o último estabelecimento usado. */
  async function sessaoNaCasa() {
    const login = sessaoDe<RespostaSessao>(
      await entrar({ email: casa.email, password: SENHA_PADRAO }),
    )
    if (login.establishment.slug === casa.slug) return login
    return sessaoDe<RespostaSessao>(await trocar(login.refreshToken, casa.slug))
  }

  const mudarVinculo = (vinculo: TenantDeTeste, isActive: boolean) =>
    withTenant(tenantContextFromUser(vinculo.tenantId), (tx) =>
      tx.update(users).set({ isActive }).where(eq(users.id, vinculo.userId)),
    )

  it('a senha é uma só, e o login entra no estabelecimento usado por último', async () => {
    const primeira = sessaoDe<RespostaSessao>(
      await entrar({ email: casa.email, password: SENHA_PADRAO }),
    )

    const paraOOutro = await trocar(primeira.refreshToken, outro.slug)
    expect(paraOOutro.statusCode, paraOOutro.body).toBe(200)
    const depoisDaTroca = await entrar({ email: casa.email, password: SENHA_PADRAO })
    expect(sessaoDe<RespostaSessao>(depoisDaTroca).establishment.slug).toBe(outro.slug)

    const paraACasa = await trocar(sessaoDe(depoisDaTroca).refreshToken, casa.slug)
    expect(paraACasa.statusCode, paraACasa.body).toBe(200)
    const deNovo = await entrar({ email: casa.email, password: SENHA_PADRAO })
    expect(sessaoDe<RespostaSessao>(deNovo).establishment.slug).toBe(casa.slug)
  })

  it('um estabelecimento mandado no corpo do login não escolhe nada', async () => {
    await sessaoNaCasa()

    const resposta = await entrar({
      email: casa.email,
      password: SENHA_PADRAO,
      establishmentSlug: outro.slug,
      tenantId: outro.tenantId,
    })
    expect(sessaoDe<RespostaSessao>(resposta).establishment.slug).toBe(casa.slug)
  })

  it('a lista traz os da conta, por nome, com o da sessão marcado — e nenhum alheio', async () => {
    const sessao = sessaoDe<RespostaSessao>(
      await entrar({ email: casa.email, password: SENHA_PADRAO }),
    )
    const lista = (await estabelecimentos(sessao.accessToken)).json<
      { slug: string; current: boolean }[]
    >()

    expect(lista.map((e) => e.slug).sort()).toEqual([casa.slug, outro.slug].sort())
    expect(lista.filter((e) => e.current).map((e) => e.slug)).toEqual([sessao.establishment.slug])
  })

  it('a troca abre a sessão no outro, com as permissões de lá, e revoga a anterior', async () => {
    const naCasa = await sessaoNaCasa()
    const resposta = await trocar(naCasa.refreshToken, outro.slug)
    const noOutroEstabelecimento = sessaoDe<RespostaSessao>(resposta)

    expect(noOutroEstabelecimento.establishment).toMatchObject({ id: outro.tenantId })
    expect(noOutroEstabelecimento.user).toMatchObject({
      id: noOutro.userId,
      tenantId: outro.tenantId,
      email: casa.email,
      permissions: ['orders:read'],
    })
    expect(noOutroEstabelecimento.refreshToken.startsWith(`${outro.tenantId}.`)).toBe(true)

    // A sessão de lá não lê dados da casa: o tenant é o do token.
    const eu = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${noOutroEstabelecimento.accessToken}` },
    })
    expect(eu.json<{ tenantId: string }>().tenantId).toBe(outro.tenantId)

    expect((await renovar(naCasa.refreshToken)).statusCode).toBe(401)
    expect((await renovar(noOutroEstabelecimento.refreshToken)).statusCode).toBe(200)
  })

  it('para um estabelecimento em que a conta não está, 403 — e a sessão continua', async () => {
    const sessao = await sessaoNaCasa()
    for (const slug of [alheio.slug, 'nao-existe-este-endereco']) {
      const resposta = await trocar(sessao.refreshToken, slug)
      expect(resposta.statusCode).toBe(403)
      expect(resposta.json<{ error: { code: string } }>().error.code).toBe('NO_ACCESS')
    }

    expect((await renovar(sessao.refreshToken)).statusCode).toBe(200)
  })

  it('nem para onde a pessoa foi desativada, nem para um estabelecimento suspenso', async () => {
    const sessao = await sessaoNaCasa()

    await mudarVinculo(noOutro, false)
    try {
      expect((await trocar(sessao.refreshToken, outro.slug)).statusCode).toBe(403)
      // Desativada lá, a pessoa entra na casa, e a lista não oferece o outro.
      const login = sessaoDe<RespostaSessao>(
        await entrar({ email: casa.email, password: SENHA_PADRAO }),
      )
      expect(login.establishment.slug).toBe(casa.slug)
      const lista = (await estabelecimentos(login.accessToken)).json<{ slug: string }[]>()
      expect(lista.map((e) => e.slug)).toEqual([casa.slug])
    } finally {
      await mudarVinculo(noOutro, true)
    }

    await db.update(tenants).set({ status: 'SUSPENDED' }).where(eq(tenants.id, outro.tenantId))
    try {
      expect((await trocar(sessao.refreshToken, outro.slug)).statusCode).toBe(403)
    } finally {
      await db.update(tenants).set({ status: 'ACTIVE' }).where(eq(tenants.id, outro.tenantId))
    }
  })

  it('sem sessão, com sessão inválida ou já revogada, a troca responde 401', async () => {
    const sessao = sessaoDe<RespostaSessao>(
      await entrar({ email: casa.email, password: SENHA_PADRAO }),
    )
    await trocar(sessao.refreshToken, outro.slug)

    expect((await trocar(undefined, outro.slug)).statusCode).toBe(401)
    expect((await trocar('lixo', outro.slug)).statusCode).toBe(401)
    expect((await trocar(`${casa.tenantId}.inventado`, outro.slug)).statusCode).toBe(401)
    // A anterior foi revogada pela troca.
    expect((await trocar(sessao.refreshToken, outro.slug)).statusCode).toBe(401)
  })

  it('valida o endereço antes de tocar no banco', async () => {
    const resposta = await trocar('qualquer', 'Não É Endereço')
    expect(resposta.statusCode).toBe(400)
  })

  it('a entrada fica na auditoria do destino, sem dizer de onde a pessoa veio', async () => {
    const naCasa = await sessaoNaCasa()
    await trocar(naCasa.refreshToken, outro.slug)

    const registros = await withTenant(tenantContextFromUser(outro.tenantId), (tx) =>
      tx
        .select({ action: auditLogs.action, metadata: auditLogs.metadata })
        .from(auditLogs)
        .where(eq(auditLogs.actorUserId, noOutro.userId)),
    )
    const troca = registros.find((r) => r.metadata?.via === 'troca de estabelecimento')
    expect(troca?.action).toBe('auth.login')
    expect(JSON.stringify(registros)).not.toContain(casa.slug)
    expect(JSON.stringify(registros)).not.toContain(casa.tenantId)
  })
})

describe('conta sem estabelecimento', () => {
  it('a senha certa recebe o motivo: a conta não está em equipe nenhuma', async () => {
    const sozinha = await criarTenantComUsuario()
    await withTenant(tenantContextFromUser(sozinha.tenantId), (tx) =>
      tx.delete(users).where(eq(users.id, sozinha.userId)),
    )

    try {
      const resposta = await entrar({ email: sozinha.email, password: SENHA_PADRAO })
      expect(resposta.statusCode).toBe(403)
      expect(resposta.json<{ error: { message: string } }>().error.message).toBe(
        'Esta conta não está na equipe de nenhum estabelecimento.',
      )
      expect((await entrar({ email: sozinha.email, password: 'chute' })).statusCode).toBe(401)
    } finally {
      await removerTenantDeTeste(sozinha)
      await removerContaSemVinculo(sozinha.accountId)
    }
  })
})
