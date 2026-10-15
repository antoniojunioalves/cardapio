import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { withAccountEmail } from '../src/accounts/context.js'
import { buscarContaPeloEmail } from '../src/accounts/repository.js'
import { buildApp } from '../src/app.js'
import { generateTenantToken } from '../src/auth/tokens.js'
import { env } from '../src/config/env.js'
import { closeDatabase, db } from '../src/db/index.js'
import {
  accounts,
  auditLogs,
  invitations,
  planFeatures,
  plans,
  subscriptions,
  tenants,
  users,
} from '../src/db/schema/index.js'
import { inserirConvite } from '../src/invitations/repository.js'
import { criarPerfisProntos, listarPerfis } from '../src/profiles/repository.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'
import { aceitarConvite, caixaDeSaida, tokenDoConvitePara } from './helpers/convites.js'
import {
  criarPerfilDeTeste,
  criarTenantComUsuario,
  removerContasSemVinculo,
  removerTenantDeTeste,
  SENHA_PADRAO,
  sessaoDe,
  type TenantDeTeste,
} from './helpers/fixtures.js'

let app: FastifyInstance
/** A loja do dono, com os perfis prontos e um plano de 3 pessoas ativas. */
let loja: TenantDeTeste
/** Alguém de outro estabelecimento: já tem conta, com a senha padrão. */
let outraLoja: TenantDeTeste
/** Um estabelecimento sem assinatura — sem limite de pessoas —, para os tetos. */
let semLimite: TenantDeTeste
let planoId = ''
let tokenDoDono = ''
const perfil: Record<'Administrador' | 'Atendente' | 'Cozinha', string> = {
  Administrador: '',
  Atendente: '',
  Cozinha: '',
}
/** Os e-mails que os testes convidam: as contas novas saem no fim. */
const convidados: string[] = []

const SENHA_NOVA = 'Senha-da-pessoa-123'

interface Convite {
  id: string
  email: string
  profile: { id: string; name: string }
  invitedBy: string | null
  expiresAt: string
  sentAt: string
}

interface Sessao {
  accessToken: string
  user: { id: string; tenantId: string; name: string; email: string; permissions: string[] }
  establishment: { slug: string }
}

const erro = (r: { json: <T>() => T }) =>
  r.json<{ error: { code: string; message: string } }>().error

function chamar(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  token: string,
  payload?: object,
) {
  return app.inject({
    method,
    url: `/api/v1/admin${url}`,
    headers: { authorization: `Bearer ${token}` },
    ...(payload && { payload }),
  })
}

const entrar = (email: string, password: string) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } })

const consultar = (token: string) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/invitation', payload: { token } })

function novoEmail(prefixo = 'convidado') {
  const email = `${prefixo}-${randomUUID().slice(0, 8)}@exemplo.com`
  convidados.push(email)
  return email
}

function convidar(email: string, profileId = perfil.Atendente, token = tokenDoDono) {
  return chamar('POST', '/invitations', token, { email, profileId })
}

/** Desativa todos, menos o dono, e cancela os convites: cada teste começa com vagas. */
async function liberarVagas() {
  const lista = (await chamar('GET', '/users', tokenDoDono)).json<
    { id: string; isOwner: boolean; isActive: boolean }[]
  >()
  for (const u of lista) {
    if (!u.isOwner && u.isActive) await chamar('POST', `/users/${u.id}/deactivate`, tokenDoDono)
  }
  for (const c of (await chamar('GET', '/invitations', tokenDoDono)).json<Convite[]>()) {
    await chamar('DELETE', `/invitations/${c.id}`, tokenDoDono)
  }
}

/** Mexe no convite direto no banco: vencê-lo, ou fingir que o último envio foi há tempo. */
const ajustarConvite = (id: string, dados: { expiresAt?: Date; updatedAt?: Date }) =>
  withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
    tx.update(invitations).set(dados).where(eq(invitations.id, id)),
  )

const contaDe = (email: string) => withAccountEmail(email, (tx) => buscarContaPeloEmail(tx, email))

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()

  const [plano] = await db
    .insert(plans)
    .values({ code: `TESTE_${randomUUID().slice(0, 8)}`, name: 'Plano de teste' })
    .returning({ id: plans.id })
  planoId = plano?.id ?? ''
  await db.insert(planFeatures).values({ planId: planoId, key: 'maxUsers', limitValue: 3 })

  loja = await criarTenantComUsuario({ dono: true })
  outraLoja = await criarTenantComUsuario()
  semLimite = await criarTenantComUsuario({ dono: true })

  await withTenant(tenantContextFromUser(loja.tenantId), async (tx) => {
    await criarPerfisProntos(tx, loja.tenantId)
    for (const p of await listarPerfis(tx)) {
      if (p.name in perfil) perfil[p.name as keyof typeof perfil] = p.id
    }
    await tx.insert(subscriptions).values({ tenantId: loja.tenantId, planId: planoId })
  })
  tokenDoDono = (await entrar(loja.email, SENHA_PADRAO)).json<Sessao>().accessToken
})

beforeEach(() => {
  caixaDeSaida().limpar()
})

afterAll(async () => {
  await app.close()
  for (const f of [loja, outraLoja, semLimite]) await removerTenantDeTeste(f)
  await removerContasSemVinculo(convidados)
  await db.delete(plans).where(eq(plans.id, planoId))
  await closeDatabase()
})

describe('convidar', () => {
  it('manda o link ao e-mail, sem texto livre, e o convite aparece na lista', async () => {
    await liberarVagas()
    const email = novoEmail()

    const resposta = await convidar(email.toUpperCase())

    expect(resposta.statusCode, resposta.body).toBe(201)
    expect(resposta.json()).toMatchObject({
      emailSent: true,
      invitation: { email, profile: { id: perfil.Atendente, name: 'Atendente' } },
    })

    const [mensagem] = caixaDeSaida().enviados.filter((m) => m.para === email)
    expect(mensagem?.assunto).toMatch(/^Convite para a equipe de um estabelecimento/)
    expect(mensagem?.texto).toContain(`/${loja.slug}`)
    expect(mensagem?.texto).toMatch(/\/convite#token=\S+/)
    // O e-mail vai para quem outra pessoa digitou: não repete nome nenhum.
    const [estabelecimento] = await db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, loja.tenantId))
    expect(mensagem?.texto).not.toContain(estabelecimento?.name)
    expect(mensagem?.texto).not.toContain('Atendente')

    const lista = (await chamar('GET', '/invitations', tokenDoDono)).json<Convite[]>()
    expect(lista).toEqual([
      expect.objectContaining({ email, invitedBy: expect.any(String) as string }),
    ])

    const [registro] = await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
      tx
        .select({ metadata: auditLogs.metadata, actor: auditLogs.actorUserId })
        .from(auditLogs)
        .where(eq(auditLogs.action, 'invitation.created')),
    )
    expect(registro).toEqual({ metadata: { email, perfil: 'Atendente' }, actor: loja.userId })
  })

  it('quem já trabalha em outro estabelecimento é convidado, e a resposta não diz que tem conta', async () => {
    await liberarVagas()

    const resposta = await convidar(outraLoja.email)

    expect(resposta.statusCode, resposta.body).toBe(201)
    expect(Object.keys(resposta.json<{ invitation: object }>().invitation).sort()).toEqual(
      ['createdAt', 'email', 'expiresAt', 'id', 'invitedBy', 'profile', 'sentAt'].sort(),
    )
  })

  it('e-mail que já está na equipe: 409 — e, desativado, diz para reativar', async () => {
    await liberarVagas()
    const doDono = await convidar(loja.email)
    expect(doDono.statusCode).toBe(409)
    expect(erro(doDono)).toEqual({
      code: 'USER_ALREADY_MEMBER',
      message: 'Esta pessoa já está na equipe.',
      requestId: expect.any(String) as string,
    })

    const email = novoEmail()
    await convidar(email)
    await aceitarConvite(app, tokenDoConvitePara(email), { name: 'Saiu', password: SENHA_NOVA })
    await liberarVagas()
    const desativada = await convidar(email)
    expect(desativada.statusCode).toBe(409)
    expect(erro(desativada).message).toContain('reative-a')
  })

  it('convite repetido para o mesmo e-mail: 409', async () => {
    await liberarVagas()
    const email = novoEmail()
    await convidar(email)

    const repetido = await convidar(email.toUpperCase(), perfil.Cozinha)
    expect(repetido.statusCode).toBe(409)
    expect(erro(repetido).code).toBe('INVITATION_PENDING')
  })

  it('perfil de outro estabelecimento responde 404; sem perfil, 400', async () => {
    await liberarVagas()
    const deOutro = await convidar(novoEmail(), outraLoja.profileId ?? '')
    expect(deOutro.statusCode).toBe(404)

    const semPerfil = await chamar('POST', '/invitations', tokenDoDono, { email: novoEmail() })
    expect(semPerfil.statusCode).toBe(400)
    expect((await chamar('GET', '/invitations', tokenDoDono)).json()).toEqual([])
  })

  it('quem vê a equipe vê os convites, mas só quem convida convida', async () => {
    await liberarVagas()
    const soVe = await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
      criarPerfilDeTeste(tx, loja.tenantId, `Só vê ${randomUUID().slice(0, 6)}`, ['users:read']),
    )
    const email = novoEmail()
    await convidar(email, soVe)
    const sessao = (
      await aceitarConvite(app, tokenDoConvitePara(email), { name: 'Vê', password: SENHA_NOVA })
    ).json<Sessao>()

    expect((await chamar('GET', '/invitations', sessao.accessToken)).statusCode).toBe(200)
    expect((await convidar(novoEmail(), soVe, sessao.accessToken)).statusCode).toBe(403)
  })

  it('com o servidor de e-mail fora do ar, o convite vale e dá para reenviar', async () => {
    await liberarVagas()
    caixaDeSaida().falharOsProximos(1)

    const resposta = await convidar(novoEmail())

    expect(resposta.statusCode).toBe(201)
    expect(resposta.json<{ emailSent: boolean }>().emailSent).toBe(false)
    expect((await chamar('GET', '/invitations', tokenDoDono)).json()).toHaveLength(1)
  })

  it('até 20 convites pendentes por estabelecimento', async () => {
    const tokenDele = (await entrar(semLimite.email, SENHA_PADRAO)).json<Sessao>().accessToken
    const contexto = tenantContextFromUser(semLimite.tenantId)
    const perfilId = await withTenant(contexto, async (tx) => {
      const id = await criarPerfilDeTeste(tx, semLimite.tenantId, 'Qualquer', ['orders:read'])
      for (let i = 0; i < 20; i += 1) {
        await inserirConvite(tx, {
          tenantId: semLimite.tenantId,
          email: `teto-${String(i)}-${randomUUID().slice(0, 6)}@exemplo.com`,
          profileId: id,
          invitedByUserId: semLimite.userId,
          tokenHash: generateTenantToken(semLimite.tenantId).tokenHash,
          expiresAt: new Date(Date.now() + 60_000),
        })
      }
      return id
    })

    const resposta = await convidar(novoEmail(), perfilId, tokenDele)
    expect(resposta.statusCode).toBe(409)
    expect(erro(resposta).code).toBe('INVITATION_LIMIT')

    await withTenant(contexto, (tx) => tx.delete(invitations))
  })

  it('o estabelecimento manda um número limitado de convites por hora', async () => {
    const tokenDele = (await entrar(semLimite.email, SENHA_PADRAO)).json<Sessao>().accessToken
    const contexto = tenantContextFromUser(semLimite.tenantId)
    const perfilId = await withTenant(contexto, async (tx) => {
      const id = await criarPerfilDeTeste(tx, semLimite.tenantId, 'Envios', ['orders:read'])
      // Os envios de antes, como a auditoria os guarda — inclusive de convites já cancelados.
      await tx.insert(auditLogs).values(
        Array.from({ length: env.INVITATION_EMAILS_PER_HOUR }, () => ({
          tenantId: semLimite.tenantId,
          action: 'invitation.created',
          entityType: 'invitation',
        })),
      )
      return id
    })

    const resposta = await convidar(novoEmail(), perfilId, tokenDele)
    expect(resposta.statusCode).toBe(429)
    expect(erro(resposta).code).toBe('INVITATION_RATE_LIMIT')
  })
})

describe('vagas do plano', () => {
  it('um convite pendente ocupa vaga; cancelá-lo a devolve', async () => {
    await liberarVagas()
    // Dono + 2 convites = 3, o limite.
    const primeiro = (await convidar(novoEmail())).json<{ invitation: Convite }>().invitation
    await convidar(novoEmail())

    const cheio = await convidar(novoEmail())
    expect(cheio.statusCode).toBe(409)
    expect(erro(cheio).code).toBe('PLAN_USER_LIMIT')
    expect(erro(cheio).message).toContain('contando os convites pendentes')

    expect((await chamar('DELETE', `/invitations/${primeiro.id}`, tokenDoDono)).statusCode).toBe(
      204,
    )
    expect((await convidar(novoEmail())).statusCode).toBe(201)
  })

  it('o vencido não ocupa vaga — e reenviá-lo confere a vaga de novo', async () => {
    await liberarVagas()
    const vencido = (await convidar(novoEmail())).json<{ invitation: Convite }>().invitation
    await convidar(novoEmail())
    await ajustarConvite(vencido.id, {
      expiresAt: new Date(Date.now() - 1000),
      updatedAt: new Date(Date.now() - 120_000),
    })

    // O vencido saiu da conta: cabe mais um.
    expect((await convidar(novoEmail())).statusCode).toBe(201)

    const reenvio = await chamar('POST', `/invitations/${vencido.id}/resend`, tokenDoDono)
    expect(reenvio.statusCode).toBe(409)
    expect(erro(reenvio).code).toBe('PLAN_USER_LIMIT')
  })

  it('o plano que encheu depois do convite recusa o aceite, e o convite continua lá', async () => {
    await liberarVagas()
    const email = novoEmail()
    await convidar(email)
    await db
      .update(planFeatures)
      .set({ limitValue: 1 })
      .where(and(eq(planFeatures.planId, planoId), eq(planFeatures.key, 'maxUsers')))

    try {
      const aceite = await aceitarConvite(app, tokenDoConvitePara(email), {
        name: 'Atrasada',
        password: SENHA_NOVA,
      })
      expect(aceite.statusCode).toBe(409)
      expect(erro(aceite).code).toBe('PLAN_USER_LIMIT')
      expect((await chamar('GET', '/invitations', tokenDoDono)).json()).toHaveLength(1)
      expect(await contaDe(email)).toBeNull()
    } finally {
      await db
        .update(planFeatures)
        .set({ limitValue: 3 })
        .where(and(eq(planFeatures.planId, planoId), eq(planFeatures.key, 'maxUsers')))
    }
  })

  it('o uso do plano conta os convites', async () => {
    await liberarVagas()
    await convidar(novoEmail())

    const uso = (await chamar('GET', '/plan', tokenDoDono)).json<{ users: object }>()
    expect(uso.users).toEqual({ active: 1, invited: 1, limit: 3 })
  })
})

describe('reenviar e cancelar', () => {
  it('reenviar antes de um minuto: 429; depois, um link novo, e o antigo deixa de valer', async () => {
    await liberarVagas()
    const email = novoEmail()
    const convite = (await convidar(email)).json<{ invitation: Convite }>().invitation
    const linkAntigo = tokenDoConvitePara(email)

    const cedo = await chamar('POST', `/invitations/${convite.id}/resend`, tokenDoDono)
    expect(cedo.statusCode).toBe(429)
    expect(erro(cedo).code).toBe('RESEND_TOO_SOON')

    const prazoAntigo = new Date(Date.now() + 60_000)
    await ajustarConvite(convite.id, {
      updatedAt: new Date(Date.now() - 120_000),
      expiresAt: prazoAntigo,
    })
    const reenvio = await chamar('POST', `/invitations/${convite.id}/resend`, tokenDoDono)
    expect(reenvio.statusCode, reenvio.body).toBe(200)
    expect(reenvio.json<{ emailSent: boolean }>().emailSent).toBe(true)

    const linkNovo = tokenDoConvitePara(email)
    expect(linkNovo).not.toBe(linkAntigo)
    expect(erro(await consultar(linkAntigo)).code).toBe('INVITATION_INVALID')
    expect((await consultar(linkNovo)).statusCode).toBe(200)
    // O prazo recomeça.
    const [depois] = (await chamar('GET', '/invitations', tokenDoDono)).json<Convite[]>()
    expect(new Date(depois?.expiresAt ?? 0).getTime()).toBeGreaterThan(
      prazoAntigo.getTime() + 6 * 24 * 60 * 60_000,
    )
  })

  it('cancelar: o link deixa de valer, e o cancelamento fica na auditoria', async () => {
    await liberarVagas()
    const email = novoEmail()
    const convite = (await convidar(email)).json<{ invitation: Convite }>().invitation

    expect((await chamar('DELETE', `/invitations/${convite.id}`, tokenDoDono)).statusCode).toBe(204)

    expect(erro(await consultar(tokenDoConvitePara(email))).code).toBe('INVITATION_INVALID')
    const registros = await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
      tx
        .select({ metadata: auditLogs.metadata })
        .from(auditLogs)
        .where(
          and(eq(auditLogs.action, 'invitation.cancelled'), eq(auditLogs.entityId, convite.id)),
        ),
    )
    expect(registros).toEqual([{ metadata: { email } }])
  })

  it('o convite de outro estabelecimento não aparece: 404 ao reenviar e ao cancelar', async () => {
    const tokenDele = (await entrar(semLimite.email, SENHA_PADRAO)).json<Sessao>().accessToken
    await liberarVagas()
    const convite = (await convidar(novoEmail())).json<{ invitation: Convite }>().invitation

    expect((await chamar('POST', `/invitations/${convite.id}/resend`, tokenDele)).statusCode).toBe(
      404,
    )
    expect((await chamar('DELETE', `/invitations/${convite.id}`, tokenDele)).statusCode).toBe(404)
  })

  it('quem não alcança o perfil do convite não o reenvia nem o cancela', async () => {
    await liberarVagas()
    const recepcao = await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
      criarPerfilDeTeste(tx, loja.tenantId, `Recepção ${randomUUID().slice(0, 6)}`, [
        'users:read',
        'users:create',
      ]),
    )
    const email = novoEmail()
    await convidar(email, recepcao)
    const sessao = (
      await aceitarConvite(app, tokenDoConvitePara(email), { name: 'Rec', password: SENHA_NOVA })
    ).json<Sessao>()

    const doAdmin = (await convidar(novoEmail(), perfil.Administrador)).json<{
      invitation: Convite
    }>().invitation
    await ajustarConvite(doAdmin.id, { updatedAt: new Date(Date.now() - 120_000) })

    for (const tentativa of [
      await chamar('POST', `/invitations/${doAdmin.id}/resend`, sessao.accessToken),
      await chamar('DELETE', `/invitations/${doAdmin.id}`, sessao.accessToken),
    ]) {
      expect(tentativa.statusCode).toBe(403)
      expect(erro(tentativa).code).toBe('PROFILE_OUT_OF_REACH')
    }
  })

  it('um perfil com convite pendente não se exclui', async () => {
    await liberarVagas()
    const id = await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
      criarPerfilDeTeste(tx, loja.tenantId, `Com convite ${randomUUID().slice(0, 6)}`, [
        'orders:read',
      ]),
    )
    await convidar(novoEmail(), id)

    const exclusao = await chamar('DELETE', `/profiles/${id}`, tokenDoDono)
    expect(exclusao.statusCode).toBe(409)
    expect(erro(exclusao)).toMatchObject({
      code: 'PROFILE_IN_USE',
      message: 'Há um convite para a equipe com este perfil. Cancele-o antes de excluir o perfil.',
    })
  })
})

describe('pelo link', () => {
  it('a consulta mostra o estabelecimento, o perfil e quem convidou — e se o e-mail tem conta', async () => {
    await liberarVagas()
    const email = novoEmail()
    await convidar(email)
    await convidar(outraLoja.email, perfil.Cozinha)

    const nova = await consultar(tokenDoConvitePara(email))
    expect(nova.statusCode, nova.body).toBe(200)
    expect(nova.json()).toEqual({
      email,
      establishment: { name: expect.any(String) as string, slug: loja.slug },
      profile: 'Atendente',
      invitedBy: expect.any(String) as string,
      accountExists: false,
    })

    const deQuemTem = await consultar(tokenDoConvitePara(outraLoja.email))
    expect(deQuemTem.json()).toMatchObject({ profile: 'Cozinha', accountExists: true })
  })

  it('sem conta: cria a conta já confirmada, com o nome e a senha, e entra no estabelecimento', async () => {
    await liberarVagas()
    const email = novoEmail()
    await convidar(email)

    const resposta = await aceitarConvite(app, tokenDoConvitePara(email), {
      name: '  Nova Pessoa ',
      password: SENHA_NOVA,
    })

    expect(resposta.statusCode, resposta.body).toBe(200)
    const sessao = sessaoDe<Sessao>(resposta)
    expect(sessao.establishment.slug).toBe(loja.slug)
    expect(sessao.user).toMatchObject({ tenantId: loja.tenantId, name: 'Nova Pessoa', email })
    expect(sessao.user.permissions).toContain('orders:read')
    expect(sessao.refreshToken.startsWith(`${loja.tenantId}.`)).toBe(true)

    const conta = await contaDe(email)
    expect(conta?.emailVerifiedAt).toBeInstanceOf(Date)
    expect((await entrar(email, SENHA_NOVA)).statusCode).toBe(200)

    const lista = (await chamar('GET', '/users', tokenDoDono)).json<
      { id: string; profile: { name: string } | null }[]
    >()
    expect(lista.find((u) => u.id === sessao.user.id)?.profile?.name).toBe('Atendente')
    expect((await chamar('GET', '/invitations', tokenDoDono)).json()).toEqual([])

    const acoes = await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
      tx
        .select({ action: auditLogs.action, metadata: auditLogs.metadata })
        .from(auditLogs)
        .where(eq(auditLogs.actorUserId, sessao.user.id)),
    )
    expect(acoes).toEqual(
      expect.arrayContaining([
        { action: 'invitation.accepted', metadata: { email, perfil: 'Atendente' } },
        { action: 'auth.login', metadata: { via: 'convite' } },
      ]),
    )
  })

  it('sem conta: senha fraca ou sem nome é recusada, e nada é criado', async () => {
    await liberarVagas()
    const email = novoEmail()
    await convidar(email)
    const token = tokenDoConvitePara(email)

    const fraca = await aceitarConvite(app, token, { name: 'Pessoa', password: 'fraca' })
    expect(fraca.statusCode).toBe(400)
    expect(erro(fraca).code).toBe('WEAK_PASSWORD')

    const semNome = await aceitarConvite(app, token, { password: SENHA_NOVA })
    expect(semNome.statusCode).toBe(400)
    expect(erro(semNome).code).toBe('NAME_REQUIRED')

    expect(await contaDe(email)).toBeNull()
    expect((await consultar(token)).statusCode).toBe(200)
  })

  it('com conta: entra com a senha dela, o nome mandado é ignorado, e a conta fica nos dois', async () => {
    await liberarVagas()
    await convidar(outraLoja.email)
    const token = tokenDoConvitePara(outraLoja.email)

    const errada = await aceitarConvite(app, token, { password: 'Outra-senha-123' })
    expect(errada.statusCode).toBe(401)

    const resposta = await aceitarConvite(app, token, {
      name: 'Nome Que Não Vale',
      password: SENHA_PADRAO,
    })
    expect(resposta.statusCode, resposta.body).toBe(200)
    const sessao = resposta.json<Sessao>()
    expect(sessao.establishment.slug).toBe(loja.slug)
    expect(sessao.user.name).not.toBe('Nome Que Não Vale')

    const lista = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/establishments',
      headers: { authorization: `Bearer ${sessao.accessToken}` },
    })
    expect(
      lista
        .json<{ slug: string }[]>()
        .map((e) => e.slug)
        .sort(),
    ).toEqual([loja.slug, outraLoja.slug].sort())

    // Uma conta só: a mesma do outro estabelecimento.
    const vinculo = await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
      tx.select({ accountId: users.accountId }).from(users).where(eq(users.id, sessao.user.id)),
    )
    expect(vinculo).toEqual([{ accountId: outraLoja.accountId }])
  })

  it('o link vencido, cancelado, já usado ou adulterado não vale', async () => {
    await liberarVagas()
    const email = novoEmail()
    const convite = (await convidar(email)).json<{ invitation: Convite }>().invitation
    const token = tokenDoConvitePara(email)

    await ajustarConvite(convite.id, { expiresAt: new Date(Date.now() - 1000) })
    expect(erro(await consultar(token)).code).toBe('INVITATION_EXPIRED')
    expect(
      erro(await aceitarConvite(app, token, { name: 'Tarde', password: SENHA_NOVA })).code,
    ).toBe('INVITATION_EXPIRED')

    await ajustarConvite(convite.id, { expiresAt: new Date(Date.now() + 60_000) })
    const segredo = token.split('.')[1] ?? ''
    for (const adulterado of [`${outraLoja.tenantId}.${segredo}`, `${loja.tenantId}.x`, 'lixo']) {
      expect(erro(await consultar(adulterado)).code).toBe('INVITATION_INVALID')
    }

    expect(
      (await aceitarConvite(app, token, { name: 'Pessoa', password: SENHA_NOVA })).statusCode,
    ).toBe(200)
    const usado = await aceitarConvite(app, token, { name: 'Pessoa', password: SENHA_NOVA })
    expect(usado.statusCode).toBe(400)
    expect(erro(usado).code).toBe('INVITATION_INVALID')
  })

  it('dois aceites ao mesmo tempo: um entra, e o outro ouve que o convite não vale mais', async () => {
    await liberarVagas()
    const email = novoEmail()
    await convidar(email)
    const token = tokenDoConvitePara(email)

    const respostas = await Promise.all([
      aceitarConvite(app, token, { name: 'Um', password: SENHA_NOVA }),
      aceitarConvite(app, token, { name: 'Dois', password: SENHA_NOVA }),
    ])

    expect(respostas.map((r) => r.statusCode).sort()).toEqual([200, 400])
    const lista = (await chamar('GET', '/users', tokenDoDono)).json<{ email: string }[]>()
    expect(lista.filter((u) => u.email === email)).toHaveLength(1)
  })

  it('um aceite em andamento segura o outro, que encontra o convite já usado', async () => {
    await liberarVagas()
    const email = novoEmail()
    const convite = (await convidar(email)).json<{ invitation: Convite }>().invitation
    const token = tokenDoConvitePara(email)

    // O primeiro aceite, parado no meio: travou o convite, e ainda vai apagá-lo.
    let soltar = () => undefined as void
    const sinal = new Promise<void>((resolve) => {
      soltar = resolve
    })
    let travou = () => undefined as void
    const travado = new Promise<void>((resolve) => {
      travou = resolve
    })
    const primeiro = withTenant(tenantContextFromUser(loja.tenantId), async (tx) => {
      await tx.select().from(invitations).where(eq(invitations.id, convite.id)).for('update')
      travou()
      await sinal
      await tx.delete(invitations).where(eq(invitations.id, convite.id))
    })
    await travado

    // Sem a trava na releitura, o segundo seguiria, e o convite viraria um vínculo depois de usado.
    const segundo = aceitarConvite(app, token, { name: 'Dois', password: SENHA_NOVA })
    const aindaEsperando = await Promise.race([
      segundo.then(() => 'respondeu'),
      new Promise<string>((resolve) => setTimeout(resolve, 300, 'esperando')),
    ])
    // Solta o primeiro antes de conferir: se a conferência falhar, a transação
    // dele não fica aberta, segurando o convite.
    soltar()
    await primeiro
    expect(aindaEsperando).toBe('esperando')

    const resposta = await segundo
    expect(resposta.statusCode).toBe(400)
    expect(erro(resposta).code).toBe('INVITATION_INVALID')
    expect(await contaDe(email)).toBeNull()
  })

  it('quem aceita com outra sessão aberta sai dela', async () => {
    await liberarVagas()
    const anterior = sessaoDe<Sessao>(await entrar(outraLoja.email, SENHA_PADRAO))
    const email = novoEmail()
    await convidar(email)

    const aceite = await aceitarConvite(
      app,
      tokenDoConvitePara(email),
      { name: 'Outra Pessoa', password: SENHA_NOVA },
      anterior.refreshToken,
    )
    expect(aceite.statusCode).toBe(200)

    const renovar = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: anterior.refreshToken },
    })
    expect(renovar.statusCode).toBe(401)
  })

  it('o convite de um estabelecimento suspenso não abre', async () => {
    await liberarVagas()
    const email = novoEmail()
    await convidar(email)
    await db.update(tenants).set({ status: 'SUSPENDED' }).where(eq(tenants.id, loja.tenantId))

    try {
      const resposta = await consultar(tokenDoConvitePara(email))
      expect(resposta.statusCode).toBe(403)
    } finally {
      await db.update(tenants).set({ status: 'ACTIVE' }).where(eq(tenants.id, loja.tenantId))
    }
    expect(await db.select().from(accounts)).toEqual([])
  })
})
