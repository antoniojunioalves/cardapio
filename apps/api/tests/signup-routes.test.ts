import { PERFIS_PRONTOS, TODAS_AS_PERMISSOES, VERSAO_DOS_TERMOS } from '@repo/shared'
import { and, eq, like, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { closeDatabase, db } from '../src/db/index.js'
import {
  auditLogs,
  emailVerificationTokens,
  plans,
  subscriptions,
  tenants,
  users,
} from '../src/db/schema/index.js'
import { seedPlans } from '../src/db/seed-plans.js'
import { email, MemoryEmailProvider } from '../src/email/index.js'
import { listarPerfis } from '../src/profiles/repository.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'

let app: FastifyInstance
const PREFIXO = `cad${Math.random().toString(36).slice(2, 8)}`
let contador = 0

function caixaDeSaida(): MemoryEmailProvider {
  if (!(email instanceof MemoryEmailProvider)) throw new Error('os testes usam EMAIL_DRIVER=memory')
  return email
}

const novoSlug = () => `${PREFIXO}-${String((contador += 1))}`

function cadastro(sobrescrever: Record<string, unknown> = {}) {
  const slug = novoSlug()
  return {
    establishmentName: 'Lanchonete do Teste',
    slug,
    ownerName: 'Maria Dona',
    email: `${slug}@Exemplo.com`,
    password: 'Senha-forte-123',
    termsVersion: VERSAO_DOS_TERMOS,
    ...sobrescrever,
  }
}

const cadastrar = (corpo: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/api/v1/public/signup', payload: corpo })

const confirmar = (token: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/public/signup/confirm-email',
    payload: { token },
  })

const cardapio = (slug: string) => app.inject({ method: 'GET', url: `/api/v1/public/${slug}/menu` })

/** O token do link, lido do fragmento do último e-mail enviado para o endereço. */
function tokenDoEmailPara(para: string): string {
  const mensagens = caixaDeSaida().enviados.filter((m) => m.para === para)
  const token = /#token=(\S+)/.exec(mensagens.at(-1)?.texto ?? '')?.[1]
  if (!token) throw new Error(`nenhum link de confirmação para ${para}`)
  return token
}

interface RespostaDoCadastro {
  accessToken: string
  user: { id: string; tenantId: string; email: string; permissions: string[] }
  establishment: { id: string; slug: string; name: string; status: string }
  confirmationEmailSent: boolean
}

async function cadastrarComSucesso(sobrescrever: Record<string, unknown> = {}) {
  const corpo = cadastro(sobrescrever)
  const resposta = await cadastrar(corpo)
  expect(resposta.statusCode, resposta.body).toBe(201)
  return { corpo, resposta, dados: resposta.json<RespostaDoCadastro>() }
}

async function auditoria(tenantId: string) {
  return withTenant(tenantContextFromUser(tenantId), (tx) =>
    tx.select({ action: auditLogs.action, metadata: auditLogs.metadata }).from(auditLogs),
  )
}

beforeAll(async () => {
  await seedPlans()
  app = await buildApp({ rateLimit: false })
  await app.ready()
})

beforeEach(() => {
  caixaDeSaida().limpar()
})

afterAll(async () => {
  await app.close()
  // Em cascata: dono, assinatura, links, sessões e auditoria de cada um.
  await db.delete(tenants).where(like(tenants.slug, `${PREFIXO}-%`))
  await closeDatabase()
})

describe('cadastro pela página', () => {
  it('cria o estabelecimento aguardando confirmação, com o dono, o plano gratuito e a sessão aberta', async () => {
    const { corpo, resposta, dados } = await cadastrarComSucesso()

    expect(dados.establishment).toMatchObject({ slug: corpo.slug, status: 'PENDING' })
    expect(dados.confirmationEmailSent).toBe(true)
    expect(dados.accessToken).toEqual(expect.any(String))
    // Proprietário: todas as permissões do catálogo.
    expect(dados.user.permissions).toEqual([...TODAS_AS_PERMISSOES])
    expect(dados.user.email).toBe(corpo.email.toLowerCase())

    const cookie = resposta.cookies.find((c) => c.name === 'refresh_token')
    expect(cookie?.httpOnly).toBe(true)
    expect(resposta.json()).not.toHaveProperty('refreshToken')

    const tenantId = dados.establishment.id
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId))
    expect(tenant).toMatchObject({ status: 'PENDING', timezone: 'America/Sao_Paulo' })

    const detalhes = await withTenant(tenantContextFromUser(tenantId), async (tx) => ({
      plano: await tx
        .select({ code: plans.code })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId)),
      dono: await tx.select({ isOwner: users.isOwner, profileId: users.profileId }).from(users),
      perfis: await listarPerfis(tx),
    }))
    expect(detalhes.plano).toEqual([{ code: 'FREE' }])
    // O proprietário não tem perfil: tem tudo, e isso não se edita.
    expect(detalhes.dono).toEqual([{ isOwner: true, profileId: null }])
    // O estabelecimento nasce com os perfis prontos, para dar à primeira pessoa da equipe.
    expect(detalhes.perfis.map((p) => p.name).sort()).toEqual(
      PERFIS_PRONTOS.map((p) => p.nome).sort(),
    )
    for (const pronto of PERFIS_PRONTOS) {
      expect(detalhes.perfis.find((p) => p.name === pronto.nome)?.permissions).toEqual([
        ...pronto.permissoes,
      ])
    }

    const registros = await auditoria(tenantId)
    expect(registros.map((r) => r.action)).toEqual(
      expect.arrayContaining(['tenant.created', 'terms.accepted']),
    )
    const aceite = registros.find((r) => r.action === 'terms.accepted')?.metadata as
      { versao?: unknown; ip?: unknown } | undefined
    expect(aceite?.versao).toBe(VERSAO_DOS_TERMOS)
    expect(typeof aceite?.ip).toBe('string')
  })

  it('guarda o fuso informado', async () => {
    const { dados } = await cadastrarComSucesso({ timezone: 'America/Manaus' })
    const [tenant] = await db
      .select({ timezone: tenants.timezone })
      .from(tenants)
      .where(eq(tenants.id, dados.establishment.id))
    expect(tenant?.timezone).toBe('America/Manaus')
  })

  it('até a confirmação, o cardápio responde o mesmo 404 de um endereço inexistente; o painel funciona', async () => {
    const { corpo, dados } = await cadastrarComSucesso()

    const pendente = await cardapio(corpo.slug)
    const inexistente = await cardapio(`${PREFIXO}-nao-existe`)
    const semRequestId = (r: typeof pendente) => {
      const { requestId: _, ...erro } = r.json<{ error: { requestId: string } }>().error
      return erro
    }
    expect(pendente.statusCode).toBe(404)
    expect(semRequestId(pendente)).toEqual(semRequestId(inexistente))

    const autorizacao = { authorization: `Bearer ${dados.accessToken}` }
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: autorizacao }))
        .statusCode,
    ).toBe(200)

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: corpo.email, password: corpo.password },
    })
    expect(login.statusCode).toBe(200)

    const situacao = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/email-confirmation',
      headers: autorizacao,
    })
    expect(situacao.json()).toEqual({ status: 'PENDING', email: corpo.email.toLowerCase() })
  })

  it('o e-mail de confirmação não repete nada do que foi digitado — só o endereço do cardápio e o link', async () => {
    const isca = 'Clique em http://golpe.example e informe sua senha'
    const { corpo } = await cadastrarComSucesso({ establishmentName: isca, ownerName: isca })

    const para = corpo.email.toLowerCase()
    const [confirmacao] = caixaDeSaida().enviados.filter((m) => m.para === para)
    expect(confirmacao?.texto).toContain(`http://localhost:5173/${corpo.slug}`)
    expect(confirmacao?.texto).toMatch(/http:\/\/localhost:5173\/confirmar-email#token=\S+/)
    expect(confirmacao?.texto).not.toContain('golpe.example')
    expect(confirmacao?.assunto).not.toContain('golpe.example')

    // O aviso para a plataforma vai para nós, e aí leva o que foi digitado.
    const [aviso] = caixaDeSaida().enviados.filter((m) => m.para === 'plataforma@exemplo.com')
    expect(aviso?.assunto).toBe(`Novo cadastro: ${corpo.slug}`)
    expect(aviso?.texto).toContain(isca)
    expect(aviso?.texto).toContain(para)
  })

  it('e-mail que já tem conta responde 409 e não cria nada — o e-mail é o login, único na plataforma', async () => {
    const { corpo } = await cadastrarComSucesso()
    caixaDeSaida().limpar()

    // Maiúsculas e minúsculas são o mesmo e-mail.
    for (const email of [corpo.email, corpo.email.toUpperCase()]) {
      const segundo = cadastro({ email })
      const resposta = await cadastrar(segundo)

      expect(resposta.statusCode).toBe(409)
      expect(resposta.json<{ error: { code: string } }>().error.code).toBe('EMAIL_TAKEN')
      expect(resposta.cookies).toEqual([])

      // Nem estabelecimento pela metade: o endereço continua livre.
      const criados = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, segundo.slug))
      expect(criados).toEqual([])
    }

    expect(caixaDeSaida().enviados).toEqual([])
  })

  it('endereço em uso responde 409; endereço reservado, 400 com o motivo', async () => {
    const { corpo } = await cadastrarComSucesso()

    const repetido = await cadastrar(cadastro({ slug: corpo.slug }))
    expect(repetido.statusCode).toBe(409)
    expect(repetido.json<{ error: { code: string } }>().error.code).toBe('SLUG_TAKEN')

    const reservado = await cadastrar(cadastro({ slug: 'cadastro' }))
    expect(reservado.statusCode).toBe(400)
    expect(reservado.body).toContain('Este endereço é reservado. Escolha outro.')
  })

  it('termos de outra versão, senha fraca e campo-armadilha são recusados sem criar nada', async () => {
    const recusados = [
      cadastro({ termsVersion: '2020-01-01' }),
      cadastro({ password: '1234567' }),
      cadastro({ password: 'senha-sem-maiuscula-1' }),
      cadastro({ password: 'SenhaSemEspecial1' }),
      cadastro({ website: 'http://spam.example' }),
    ]

    for (const corpo of recusados) {
      const resposta = await cadastrar(corpo)
      expect(resposta.statusCode, JSON.stringify(corpo)).toBe(400)
      const [criado] = await db.select().from(tenants).where(eq(tenants.slug, corpo.slug))
      expect(criado).toBeUndefined()
    }

    const armadilha = await cadastrar(cadastro({ website: 'x' }))
    expect(armadilha.json<{ error: { code: string } }>().error.code).toBe('SIGNUP_REJECTED')
    expect(caixaDeSaida().enviados).toEqual([])
  })

  it('servidor de e-mail fora do ar não desfaz o cadastro: ele vale, e o painel oferece o reenvio', async () => {
    caixaDeSaida().falharOsProximos(2)

    const { dados } = await cadastrarComSucesso()

    expect(dados.confirmationEmailSent).toBe(false)
    const [tenant] = await db
      .select({ status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, dados.establishment.id))
    expect(tenant?.status).toBe('PENDING')
  })

  it('sem o plano gratuito no banco, o cadastro fica indisponível — nada de estabelecimento sem plano', async () => {
    await db.update(plans).set({ isActive: false }).where(eq(plans.code, 'FREE'))
    try {
      const corpo = cadastro()
      const resposta = await cadastrar(corpo)
      expect(resposta.statusCode).toBe(503)
      expect(resposta.json<{ error: { code: string } }>().error.code).toBe('SIGNUP_UNAVAILABLE')
      const [criado] = await db.select().from(tenants).where(eq(tenants.slug, corpo.slug))
      expect(criado).toBeUndefined()
    } finally {
      await db.update(plans).set({ isActive: true }).where(eq(plans.code, 'FREE'))
    }
  })
})

describe('confirmação do e-mail', () => {
  it('o link publica o cardápio; o segundo clique diz que já está confirmado', async () => {
    const { corpo, dados } = await cadastrarComSucesso()
    const token = tokenDoEmailPara(corpo.email.toLowerCase())

    const primeira = await confirmar(token)
    expect(primeira.statusCode, primeira.body).toBe(200)
    expect(primeira.json()).toEqual({ status: 'CONFIRMED', slug: corpo.slug })
    expect((await cardapio(corpo.slug)).statusCode).toBe(200)

    const segunda = await confirmar(token)
    expect(segunda.json()).toEqual({ status: 'ALREADY_CONFIRMED', slug: corpo.slug })

    const tenantId = dados.establishment.id
    const [dono] = await withTenant(tenantContextFromUser(tenantId), (tx) =>
      tx.select({ confirmadoEm: users.emailVerifiedAt }).from(users),
    )
    expect(dono?.confirmadoEm).toBeInstanceOf(Date)

    const acoes = (await auditoria(tenantId)).map((r) => r.action)
    expect(acoes).toEqual(expect.arrayContaining(['user.email_confirmed', 'tenant.published']))

    const situacao = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/email-confirmation',
      headers: { authorization: `Bearer ${dados.accessToken}` },
    })
    expect(situacao.json<{ status: string }>().status).toBe('CONFIRMED')
  })

  it('link inventado ou com o tenant trocado não confirma nada', async () => {
    const { corpo } = await cadastrarComSucesso()
    const { dados: outro } = await cadastrarComSucesso()
    const token = tokenDoEmailPara(corpo.email.toLowerCase())

    const inventado = await confirmar('qualquer-coisa')
    expect(inventado.statusCode).toBe(400)
    expect(inventado.json<{ error: { code: string } }>().error.code).toBe('CONFIRMATION_INVALID')

    // O prefixo é só dica de roteamento: trocá-lo muda o hash, e a busca falha.
    const [, segredo] = token.split('.')
    const trocado = await confirmar(`${outro.establishment.id}.${segredo ?? ''}`)
    expect(trocado.statusCode).toBe(400)

    expect((await cardapio(corpo.slug)).statusCode).toBe(404)
  })

  it('confirmar não reativa um estabelecimento suspenso pela plataforma', async () => {
    const { corpo, dados } = await cadastrarComSucesso()
    const token = tokenDoEmailPara(corpo.email.toLowerCase())
    await db
      .update(tenants)
      .set({ status: 'SUSPENDED' })
      .where(eq(tenants.id, dados.establishment.id))

    expect((await confirmar(token)).statusCode).toBe(200)

    const [tenant] = await db
      .select({ status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, dados.establishment.id))
    expect(tenant?.status).toBe('SUSPENDED')
    expect((await cardapio(corpo.slug)).statusCode).toBe(404)
  })

  it('link expirado não confirma, e o cardápio continua fora do ar', async () => {
    const { corpo, dados } = await cadastrarComSucesso()
    const token = tokenDoEmailPara(corpo.email.toLowerCase())

    await withTenant(tenantContextFromUser(dados.establishment.id), (tx) =>
      tx.update(emailVerificationTokens).set({ expiresAt: sql`now() - interval '1 minute'` }),
    )

    const resposta = await confirmar(token)
    expect(resposta.statusCode).toBe(400)
    expect(resposta.json<{ error: { code: string } }>().error.code).toBe('CONFIRMATION_EXPIRED')
    expect((await cardapio(corpo.slug)).statusCode).toBe(404)
  })
})

describe('reenvio da confirmação', () => {
  const reenviar = (accessToken?: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/admin/email-confirmation/resend',
      ...(accessToken ? { headers: { authorization: `Bearer ${accessToken}` } } : {}),
    })

  /** Como se o último link tivesse saído há dois minutos. */
  const envelhecerLinks = (tenantId: string) =>
    withTenant(tenantContextFromUser(tenantId), (tx) =>
      tx
        .update(emailVerificationTokens)
        .set({ createdAt: sql`now() - interval '2 minutes'` })
        .where(eq(emailVerificationTokens.tenantId, tenantId)),
    )

  it('exige login', async () => {
    expect((await reenviar()).statusCode).toBe(401)
  })

  it('respeita um minuto entre envios, e o link novo publica o cardápio', async () => {
    const { corpo, dados } = await cadastrarComSucesso()
    const para = corpo.email.toLowerCase()

    const cedo = await reenviar(dados.accessToken)
    expect(cedo.statusCode).toBe(429)
    expect(cedo.json<{ error: { code: string } }>().error.code).toBe('RESEND_TOO_SOON')

    await envelhecerLinks(dados.establishment.id)
    const antigo = tokenDoEmailPara(para)

    const reenvio = await reenviar(dados.accessToken)
    expect(reenvio.statusCode, reenvio.body).toBe(202)
    expect(reenvio.json()).toEqual({ email: para })

    const novo = tokenDoEmailPara(para)
    expect(novo).not.toBe(antigo)
    expect((await confirmar(novo)).json<{ status: string }>().status).toBe('CONFIRMED')
    expect((await cardapio(corpo.slug)).statusCode).toBe(200)

    const depois = await reenviar(dados.accessToken)
    expect(depois.statusCode).toBe(409)
    expect(depois.json<{ error: { code: string } }>().error.code).toBe('ALREADY_CONFIRMED')
  })

  it('vai sempre para quem cadastrou, mesmo pedido por outro usuário', async () => {
    const { corpo, dados } = await cadastrarComSucesso()
    const autorizacao = { authorization: `Bearer ${dados.accessToken}` }

    const admin = {
      name: 'Admin',
      email: `${corpo.slug}-admin@exemplo.com`,
      password: 'Senha-123!',
    }
    // O estabelecimento nasce com os perfis prontos: o administrador é um deles.
    const perfis = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/profiles',
      headers: autorizacao,
    })
    const administrador = perfis
      .json<{ id: string; name: string }[]>()
      .find((perfil) => perfil.name === 'Administrador')
    const criado = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: autorizacao,
      payload: { ...admin, profileId: administrador?.id },
    })
    expect(criado.statusCode, criado.body).toBe(201)

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: admin.email, password: admin.password },
    })
    const tokenDoAdmin = login.json<{ accessToken: string }>().accessToken

    await envelhecerLinks(dados.establishment.id)
    caixaDeSaida().limpar()

    const reenvio = await reenviar(tokenDoAdmin)
    expect(reenvio.statusCode).toBe(202)
    expect(caixaDeSaida().enviados.map((m) => m.para)).toEqual([corpo.email.toLowerCase()])
  })
})

describe('disponibilidade do endereço', () => {
  const consultar = (slug: string) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/public/signup/slug-availability?slug=${encodeURIComponent(slug)}`,
    })

  it('livre, em uso, reservado e fora do formato — sempre 200, com o motivo', async () => {
    const { corpo } = await cadastrarComSucesso()

    const livre = await consultar(`  ${PREFIXO}-LIVRE `)
    expect(livre.json()).toEqual({ slug: `${PREFIXO}-livre`, available: true, reason: null })

    type Disponibilidade = { available: boolean; reason: string | null }

    const emUso = (await consultar(corpo.slug)).json<Disponibilidade>()
    expect(emUso.available).toBe(false)
    expect(emUso.reason).toContain('em uso')

    const reservado = (await consultar('termos')).json<Disponibilidade>()
    expect(reservado.available).toBe(false)
    expect(reservado.reason).toContain('reservado')

    const invalido = await consultar('com espaço')
    expect(invalido.statusCode).toBe(200)
    expect(invalido.json<Disponibilidade>().available).toBe(false)
    expect(invalido.json<Disponibilidade>().reason).toEqual(expect.any(String))
  })
})

describe('isolamento dos links de confirmação', () => {
  it('um estabelecimento não enxerga os links do outro, nem sabendo o hash', async () => {
    const { dados: a } = await cadastrarComSucesso()
    const { dados: b } = await cadastrarComSucesso()

    const deB = await withTenant(tenantContextFromUser(b.establishment.id), (tx) =>
      tx.select({ hash: emailVerificationTokens.tokenHash }).from(emailVerificationTokens),
    )
    expect(deB).toHaveLength(1)

    const vistoPorA = await withTenant(tenantContextFromUser(a.establishment.id), (tx) =>
      tx
        .select()
        .from(emailVerificationTokens)
        .where(eq(emailVerificationTokens.tokenHash, deB[0]?.hash ?? '')),
    )
    expect(vistoPorA).toEqual([])

    const apagadosPorA = await withTenant(tenantContextFromUser(a.establishment.id), (tx) =>
      tx
        .delete(emailVerificationTokens)
        .where(and(eq(emailVerificationTokens.tenantId, b.establishment.id)))
        .returning({ id: emailVerificationTokens.id }),
    )
    expect(apagadosPorA).toEqual([])
  })
})

describe('limite de cadastros por IP', () => {
  it('o cadastro tem limite próprio, bem abaixo do global', async () => {
    const comLimite = await buildApp()
    await comLimite.ready()
    try {
      const tentativa = () =>
        comLimite.inject({ method: 'POST', url: '/api/v1/public/signup', payload: {} })
      for (let i = 0; i < 10; i += 1) expect((await tentativa()).statusCode).toBe(400)
      expect((await tentativa()).statusCode).toBe(429)
    } finally {
      await comLimite.close()
    }
  })
})
