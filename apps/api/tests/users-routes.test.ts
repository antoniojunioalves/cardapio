import { randomUUID } from 'node:crypto'

import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { closeDatabase, db } from '../src/db/index.js'
import {
  auditLogs,
  planFeatures,
  plans,
  refreshTokens,
  subscriptions,
} from '../src/db/schema/index.js'
import { criarPerfisProntos, listarPerfis } from '../src/profiles/repository.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'
import { RECURSO_USUARIOS } from '../src/plans/limits.js'
import { travarLimiteDoPlano } from '../src/plans/service.js'
import { generateTenantToken } from '../src/auth/tokens.js'
import { inserirConvite } from '../src/invitations/repository.js'
import { aceitarConvite, tokenDoConvitePara } from './helpers/convites.js'
import {
  criarPerfilDeTeste,
  criarTenantComUsuario,
  removerTenantDeTeste,
  SENHA_PADRAO,
  sessaoDe,
  type TenantDeTeste,
} from './helpers/fixtures.js'

let app: FastifyInstance
let loja: TenantDeTeste
let outraLoja: TenantDeTeste
let planoId = ''
let tokenDoDono = ''
/** Os perfis prontos da loja, pelo nome. */
const perfil: Record<'Administrador' | 'Atendente' | 'Cozinha' | 'Gerente do cardápio', string> = {
  Administrador: '',
  Atendente: '',
  Cozinha: '',
  'Gerente do cardápio': '',
}
type NomeDePerfil = keyof typeof perfil

interface Usuario {
  id: string
  email: string
  isActive: boolean
  isOwner: boolean
  profile: { id: string; name: string } | null
}

async function entrar(email: string, password = SENHA_PADRAO) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  })
}

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

/** A senha que cada pessoa escolhe ao aceitar o convite. */
const SENHA_DA_PESSOA = 'Senha-inicial-123'

/**
 * Põe uma pessoa nova na equipe pelo caminho de verdade: o convite, e o aceite
 * pelo link do e-mail. `resposta` é a do convite; recusado, não há aceite, e o
 * `id` vem vazio.
 */
async function criar(nomeDoPerfil: NomeDePerfil, token = tokenDoDono, perfilId?: string) {
  const email = `pessoa-${randomUUID().slice(0, 8)}@exemplo.com`
  const resposta = await chamar('POST', '/invitations', token, {
    email: email.toUpperCase(),
    profileId: perfilId ?? perfil[nomeDoPerfil],
  })
  if (resposta.statusCode !== 201) return { resposta, email, id: '' }

  const aceite = await aceitarConvite(app, tokenDoConvitePara(email), {
    name: 'Pessoa',
    password: SENHA_DA_PESSOA,
  })
  expect(aceite.statusCode, aceite.body).toBe(200)
  return { resposta, email, id: aceite.json<{ user: { id: string } }>().user.id }
}

/** Põe a pessoa na equipe com o perfil e entra com ela: o token e o id. */
async function entrarComo(nomeDoPerfil: NomeDePerfil) {
  await liberarVagas()
  const { email, id } = await criar(nomeDoPerfil)
  const token = (await entrar(email, SENHA_DA_PESSOA)).json<{
    accessToken: string
  }>().accessToken
  return { token, id }
}

/** Desativa todos, menos o dono, e cancela os convites, para cada teste começar com vagas. */
async function liberarVagas() {
  const lista = (await chamar('GET', '/users', tokenDoDono)).json<Usuario[]>()
  for (const u of lista) {
    if (!u.isOwner && u.isActive) {
      await chamar('POST', `/users/${u.id}/deactivate`, tokenDoDono)
    }
  }
  await limparConvites()
}

async function limparConvites() {
  const convites = (await chamar('GET', '/invitations', tokenDoDono)).json<{ id: string }[]>()
  for (const c of convites) await chamar('DELETE', `/invitations/${c.id}`, tokenDoDono)
}

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()

  // Plano de teste: 3 usuários ativos.
  const [plano] = await db
    .insert(plans)
    .values({ code: `TESTE_${randomUUID().slice(0, 8)}`, name: 'Plano de teste' })
    .returning({ id: plans.id })
  planoId = plano?.id ?? ''
  await db.insert(planFeatures).values({ planId: planoId, key: 'maxUsers', limitValue: 3 })

  // O usuário do fixture é o proprietário, e a loja tem os perfis prontos, como
  // todo estabelecimento que se cadastra.
  loja = await criarTenantComUsuario({ dono: true })
  outraLoja = await criarTenantComUsuario()

  await withTenant(tenantContextFromUser(loja.tenantId), async (tx) => {
    await criarPerfisProntos(tx, loja.tenantId)
    for (const p of await listarPerfis(tx)) perfil[p.name as NomeDePerfil] = p.id
    await tx.insert(subscriptions).values({ tenantId: loja.tenantId, planId: planoId })
  })
  tokenDoDono = (await entrar(loja.email)).json<{ accessToken: string }>().accessToken
})

afterAll(async () => {
  await app.close()
  for (const f of [loja, outraLoja]) await removerTenantDeTeste(f)
  await db.delete(plans).where(eq(plans.id, planoId))
  await closeDatabase()
})

describe('entrar na equipe', () => {
  it('a pessoa convidada aceita e aparece na lista, com o perfil, sem senha nenhuma', async () => {
    await liberarVagas()
    const { resposta, email, id } = await criar('Atendente')

    expect(resposta.statusCode, resposta.body).toBe(201)
    const lista = (await chamar('GET', '/users', tokenDoDono)).json<Usuario[]>()
    expect(lista.find((u) => u.id === id)).toMatchObject({
      email,
      isActive: true,
      isOwner: false,
      profile: { id: perfil.Atendente, name: 'Atendente' },
    })
    expect(JSON.stringify(lista)).not.toContain('password')

    expect((await entrar(email, SENHA_DA_PESSOA)).statusCode).toBe(200)
  })

  it('não há mais como criar alguém com uma senha escolhida por quem cadastra', async () => {
    const resposta = await chamar('POST', '/users', tokenDoDono, {
      name: 'Com senha',
      email: `com-senha-${randomUUID().slice(0, 8)}@exemplo.com`,
      password: SENHA_DA_PESSOA,
      profileId: perfil.Atendente,
    })
    expect(resposta.statusCode).toBe(404)
  })

  it('não há como convidar outro proprietário: o corpo não aceita o sinal de dono', async () => {
    await liberarVagas()
    const email = `dono2-${randomUUID().slice(0, 8)}@exemplo.com`
    const convite = await chamar('POST', '/invitations', tokenDoDono, {
      email,
      profileId: perfil.Atendente,
      isOwner: true,
    })
    expect(convite.statusCode).toBe(201)

    const aceite = await aceitarConvite(app, tokenDoConvitePara(email), {
      name: 'Outro dono',
      password: SENHA_DA_PESSOA,
    })
    const id = aceite.json<{ user: { id: string } }>().user.id

    // O campo a mais é ignorado: a pessoa entra com o perfil, e não como dona.
    const lista = (await chamar('GET', '/users', tokenDoDono)).json<Usuario[]>()
    expect(lista.find((u) => u.id === id)).toMatchObject({
      isOwner: false,
      profile: { name: 'Atendente' },
    })
  })
})

describe('limite de usuários do plano', () => {
  it('dois convites ao mesmo tempo: o segundo espera o primeiro e encontra o limite', async () => {
    await liberarVagas()
    await criar('Atendente')
    // Dono + 1 = 2 de 3: sobra exatamente uma vaga.
    const contexto = tenantContextFromUser(loja.tenantId)

    // O primeiro convite, parado no meio: travou o limite e gravou, mas ainda
    // não confirmou — a outra transação não enxerga o convite dele.
    let confirmar = () => undefined as void
    const sinal = new Promise<void>((resolve) => {
      confirmar = resolve
    })
    let inseriu = () => undefined as void
    const primeiraInseriu = new Promise<void>((resolve) => {
      inseriu = resolve
    })
    const primeira = withTenant(contexto, async (tx) => {
      await travarLimiteDoPlano(tx, contexto, RECURSO_USUARIOS)
      await inserirConvite(tx, {
        tenantId: loja.tenantId,
        email: `primeira-${randomUUID().slice(0, 8)}@exemplo.com`,
        profileId: perfil.Atendente,
        invitedByUserId: loja.userId,
        tokenHash: generateTenantToken(loja.tenantId).tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      })
      inseriu()
      await sinal
    })
    await primeiraInseriu

    // Sem a trava na conferência, a segunda contaria 2 de 3 e passaria na hora.
    const segunda = criar('Atendente').then(({ resposta }) => resposta)
    const aindaEsperando = await Promise.race([
      segunda.then(() => 'respondeu'),
      new Promise<string>((resolve) => setTimeout(resolve, 200, 'esperando')),
    ])
    // Solta a primeira antes de conferir: se a conferência falhar, a transação
    // dela não fica aberta, segurando a trava dos testes seguintes.
    confirmar()
    await primeira
    expect(aindaEsperando).toBe('esperando')

    const resposta = await segunda
    expect(resposta.statusCode).toBe(409)
    expect(resposta.json()).toMatchObject({ error: { code: 'PLAN_USER_LIMIT' } })
    await limparConvites()
  })

  it('conta só os ativos: cheio recusa, desativar abre vaga, reativar respeita o limite', async () => {
    await liberarVagas()
    // Dono + 2 = 3, o limite.
    await criar('Atendente')
    const { id: idDoSegundo } = await criar('Atendente')

    const cheio = await criar('Atendente')
    expect(cheio.resposta.statusCode).toBe(409)
    expect(cheio.resposta.json()).toMatchObject({ error: { code: 'PLAN_USER_LIMIT' } })
    expect(cheio.resposta.body).toContain('Plano de teste permite 3 usuários ativos')

    await chamar('POST', `/users/${idDoSegundo}/deactivate`, tokenDoDono)
    const { resposta: terceiro } = await criar('Atendente')
    expect(terceiro.statusCode).toBe(201)

    const reativar = await chamar('POST', `/users/${idDoSegundo}/reactivate`, tokenDoDono)
    expect(reativar.statusCode).toBe(409)
  })

  it('um convite pendente ocupa vaga: nem a reativação passa por cima dele', async () => {
    await liberarVagas()
    const { id } = await criar('Atendente')
    await chamar('POST', `/users/${id}/deactivate`, tokenDoDono)
    // Dono + 1 ativo + 1 convite = 3, o limite.
    await criar('Atendente')
    const convite = await chamar('POST', '/invitations', tokenDoDono, {
      email: `pendente-${randomUUID().slice(0, 8)}@exemplo.com`,
      profileId: perfil.Atendente,
    })
    expect(convite.statusCode).toBe(201)

    const reativar = await chamar('POST', `/users/${id}/reactivate`, tokenDoDono)
    expect(reativar.statusCode).toBe(409)
    expect(reativar.json()).toMatchObject({ error: { code: 'PLAN_USER_LIMIT' } })
    await limparConvites()
  })
})

describe('desativar', () => {
  it('encerra as sessões: o token para de valer, o refresh e o login são recusados', async () => {
    await liberarVagas()
    const { email, id } = await criar('Atendente')
    const sessao = sessaoDe<{ accessToken: string }>(await entrar(email, SENHA_DA_PESSOA))

    expect((await chamar('POST', `/users/${id}/deactivate`, tokenDoDono)).statusCode).toBe(200)

    expect((await chamar('GET', '/orders', sessao.accessToken)).statusCode).toBe(401)
    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: sessao.refreshToken },
    })
    expect(refresh.statusCode).toBe(401)
    expect((await entrar(email, SENHA_DA_PESSOA)).statusCode).toBe(403)

    // Segunda barreira: a renovação já recusa usuário inativo, mas nenhum
    // refresh token dele fica válido no banco.
    const validos = await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
      tx
        .select()
        .from(refreshTokens)
        .where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt))),
    )
    expect(validos).toEqual([])
  })

  /** As ações de auditoria registradas em nome do usuário. */
  const acoesDe = async (userId: string) =>
    (
      await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
        tx
          .select({ action: auditLogs.action })
          .from(auditLogs)
          .where(eq(auditLogs.entityId, userId)),
      )
    ).map((r) => r.action)

  const renovar = (refreshToken: string) =>
    app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken } })

  it('a renovação recusada de quem foi desativado não vira "token roubado" na auditoria', async () => {
    await liberarVagas()
    const { email, id } = await criar('Atendente')
    const sessao = sessaoDe<{ accessToken: string }>(await entrar(email, SENHA_DA_PESSOA))
    await chamar('POST', `/users/${id}/deactivate`, tokenDoDono)

    expect((await renovar(sessao.refreshToken)).statusCode).toBe(401)

    // Quem encerrou a sessão foi o dono, ao desativar: reapresentá-la não é roubo.
    expect(await acoesDe(id)).not.toContain('auth.refresh_reuse_detected')
  })

  it('reativado, o aparelho antigo não derruba a sessão nova nem acusa roubo', async () => {
    await liberarVagas()
    const { email, id } = await criar('Atendente')
    const antiga = sessaoDe<{ accessToken: string }>(await entrar(email, SENHA_DA_PESSOA))
    await chamar('POST', `/users/${id}/deactivate`, tokenDoDono)
    await chamar('POST', `/users/${id}/reactivate`, tokenDoDono)
    const nova = sessaoDe<{ accessToken: string }>(await entrar(email, SENHA_DA_PESSOA))

    // O celular que ficou com a sessão de antes tenta renovar.
    expect((await renovar(antiga.refreshToken)).statusCode).toBe(401)

    expect(await acoesDe(id)).not.toContain('auth.refresh_reuse_detected')
    expect((await renovar(nova.refreshToken)).statusCode).toBe(200)
  })

  it('ninguém desativa a própria conta', async () => {
    const proprio = await chamar('POST', `/users/${loja.userId}/deactivate`, tokenDoDono)
    expect(proprio.statusCode).toBe(409)
    expect(proprio.json()).toMatchObject({ error: { code: 'CANNOT_DEACTIVATE_SELF' } })
  })
})

describe('conexão ao vivo', () => {
  /** Conecta o painel ao vivo com o token e espera o `ready`. */
  async function aoVivo(token: string) {
    const ws = await app.injectWS('/api/v1/admin/orders/stream')
    const eventos: { tipo: 'mensagem' | 'fechou'; valor: string | number }[] = []
    ws.on('message', (d: Buffer) => eventos.push({ tipo: 'mensagem', valor: d.toString() }))
    ws.on('close', (codigo: number) => eventos.push({ tipo: 'fechou', valor: codigo }))
    ws.send(JSON.stringify({ type: 'auth', token }))
    const ate = async (fn: () => boolean) => {
      const limite = Date.now() + 3000
      while (!fn() && Date.now() < limite) await new Promise((r) => setTimeout(r, 20))
    }
    await ate(() => eventos.length > 0)
    expect(eventos[0]?.valor).toBe('{"type":"ready"}')
    return { ws, eventos, ate }
  }

  it('desativar o usuário fecha a conexão ao vivo dele na hora', async () => {
    await liberarVagas()
    const { email, id } = await criar('Atendente')
    const token = sessaoDe<{ accessToken: string }>(
      await entrar(email, SENHA_DA_PESSOA),
    ).accessToken
    const conexao = await aoVivo(token)

    await chamar('POST', `/users/${id}/deactivate`, tokenDoDono)

    await conexao.ate(() => conexao.eventos.some((e) => e.tipo === 'fechou'))
    expect(conexao.eventos.find((e) => e.tipo === 'fechou')?.valor).toBe(4001)
  })

  it('mudar o perfil também fecha, para a conexão voltar com as permissões novas', async () => {
    await liberarVagas()
    const { email, id } = await criar('Atendente')
    const token = sessaoDe<{ accessToken: string }>(
      await entrar(email, SENHA_DA_PESSOA),
    ).accessToken
    const conexao = await aoVivo(token)

    await chamar('PATCH', `/users/${id}`, tokenDoDono, {
      profileId: perfil.Administrador,
    })

    await conexao.ate(() => conexao.eventos.some((e) => e.tipo === 'fechou'))
    expect(conexao.eventos.find((e) => e.tipo === 'fechou')?.valor).toBe(4001)
  })
})

describe('o administrador', () => {
  it('convida e altera usuários, mas não desativa ninguém: o perfil pronto não traz essa permissão', async () => {
    const admin = await entrarComo('Administrador')
    const { resposta, id } = await criar('Atendente', admin.token)
    expect(resposta.statusCode).toBe(201)

    const mudado = await chamar('PATCH', `/users/${id}`, admin.token, {
      profileId: perfil.Cozinha,
    })
    expect(mudado.json()).toMatchObject({ profile: { name: 'Cozinha' } })

    expect((await chamar('POST', `/users/${id}/deactivate`, admin.token)).statusCode).toBe(403)
  })

  it('não mexe na conta do proprietário, nem muda o próprio perfil', async () => {
    const admin = await entrarComo('Administrador')

    const noDono = await chamar('PATCH', `/users/${loja.userId}`, admin.token, {
      profileId: perfil.Atendente,
    })
    expect(noDono.statusCode).toBe(403)

    const proprio = await chamar('PATCH', `/users/${admin.id}`, admin.token, {
      profileId: perfil.Atendente,
    })
    expect(proprio.statusCode).toBe(409)
    expect(proprio.json()).toMatchObject({ error: { code: 'CANNOT_CHANGE_OWN_PROFILE' } })
  })
})

describe('ninguém dá o que não tem', () => {
  /** Um perfil que cadastra e altera pessoas, e nada mais. */
  async function comoRecepcao() {
    const id = await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
      criarPerfilDeTeste(tx, loja.tenantId, `Recepção ${randomUUID().slice(0, 6)}`, [
        'users:read',
        'users:create',
        'users:update',
        'users:delete',
        'orders:read',
      ]),
    )
    await liberarVagas()
    const { email } = await criar('Atendente', tokenDoDono, id)
    const token = (await entrar(email, SENHA_DA_PESSOA)).json<{
      accessToken: string
    }>().accessToken
    return { token, perfilId: id }
  }

  it('quem não tem as permissões de um perfil não convida ninguém para ele', async () => {
    const recepcao = await comoRecepcao()

    // O atendente marca o que esgotou e cancela pedido: a recepção não tem nada disso.
    const { resposta } = await criar('Atendente', recepcao.token)

    expect(resposta.statusCode).toBe(403)
    expect(resposta.json()).toMatchObject({ error: { code: 'PROFILE_OUT_OF_REACH' } })
    expect(resposta.body).toContain('Marcar o que esgotou')
  })

  it('mas convida para o perfil que está ao alcance dela', async () => {
    const recepcao = await comoRecepcao()

    const resposta = await chamar('POST', '/invitations', recepcao.token, {
      email: `colega-${randomUUID().slice(0, 8)}@exemplo.com`,
      profileId: recepcao.perfilId,
    })

    expect(resposta.statusCode, resposta.body).toBe(201)
    await limparConvites()
  })

  it('não promove ninguém a um perfil acima do seu', async () => {
    const recepcao = await comoRecepcao()
    // A cozinha também está acima da recepção: marca o que esgotou.
    const { id } = await criar('Cozinha')

    const promover = await chamar('PATCH', `/users/${id}`, recepcao.token, {
      profileId: perfil.Administrador,
    })

    expect(promover.statusCode).toBe(403)
    expect(promover.json()).toMatchObject({ error: { code: 'PROFILE_OUT_OF_REACH' } })
  })

  it('não rebaixa nem desativa quem tem um perfil acima do seu', async () => {
    const recepcao = await comoRecepcao()
    const { id } = await criar('Administrador')

    const rebaixar = await chamar('PATCH', `/users/${id}`, recepcao.token, {
      profileId: recepcao.perfilId,
    })
    const desativar = await chamar('POST', `/users/${id}/deactivate`, recepcao.token)

    for (const tentativa of [rebaixar, desativar]) {
      expect(tentativa.statusCode).toBe(403)
      expect(tentativa.json()).toMatchObject({ error: { code: 'PROFILE_OUT_OF_REACH' } })
    }
    const lista = (await chamar('GET', '/users', tokenDoDono)).json<Usuario[]>()
    expect(lista.find((u) => u.id === id)).toMatchObject({
      isActive: true,
      profile: { name: 'Administrador' },
    })
  })

  it('o proprietário alcança qualquer perfil', async () => {
    await liberarVagas()

    expect((await criar('Administrador')).resposta.statusCode).toBe(201)
  })
})

describe('regras gerais', () => {
  it('a lista traz o proprietário primeiro, sem perfil, e cada pessoa com o seu', async () => {
    await liberarVagas()
    await criar('Cozinha')

    const lista = (await chamar('GET', '/users', tokenDoDono)).json<Usuario[]>()

    expect(lista[0]).toMatchObject({ id: loja.userId, isOwner: true, profile: null })
    expect(lista.slice(1).every((u) => !u.isOwner && u.profile !== null)).toBe(true)
  })

  it('o proprietário não ganha perfil, nem pelas próprias mãos', async () => {
    const resposta = await chamar('PATCH', `/users/${loja.userId}`, tokenDoDono, {
      profileId: perfil.Administrador,
    })
    expect(resposta.statusCode).toBe(409)
  })

  it('o nome não se muda por aqui, nem o do proprietário: é da conta da pessoa', async () => {
    const resposta = await chamar('PATCH', `/users/${loja.userId}`, tokenDoDono, {
      name: 'Dona Maria',
    })
    expect(resposta.statusCode).toBe(400)
  })

  it('o mesmo perfil de antes não muda nada, nem vai para a auditoria', async () => {
    await liberarVagas()
    const { id } = await criar('Cozinha')
    const mesma = await chamar('PATCH', `/users/${id}`, tokenDoDono, { profileId: perfil.Cozinha })
    expect(mesma.statusCode).toBe(200)

    const registros = await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
      tx
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, id), eq(auditLogs.action, 'user.updated'))),
    )
    expect(registros).toEqual([])
  })

  it('atendente não vê a lista de usuários', async () => {
    const atendente = await entrarComo('Atendente')
    expect((await chamar('GET', '/users', atendente.token)).statusCode).toBe(403)
  })

  it('usuário de outro estabelecimento responde 404', async () => {
    const resposta = await chamar('PATCH', `/users/${outraLoja.userId}`, tokenDoDono, {
      profileId: perfil.Atendente,
    })
    expect(resposta.statusCode).toBe(404)
  })

  it('entrar, mudar de perfil e desativar ficam na auditoria, com o perfil', async () => {
    await liberarVagas()
    const { id, email } = await criar('Atendente')
    await chamar('PATCH', `/users/${id}`, tokenDoDono, { profileId: perfil.Cozinha })

    const registros = await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
      tx
        .select({ action: auditLogs.action, metadata: auditLogs.metadata })
        .from(auditLogs)
        .where(and(eq(auditLogs.entityType, 'user'), eq(auditLogs.entityId, id))),
    )
    expect(registros.find((r) => r.action === 'invitation.accepted')?.metadata).toEqual({
      email,
      perfil: 'Atendente',
    })
    expect(registros.find((r) => r.action === 'user.updated')?.metadata).toEqual({
      perfil: { de: 'Atendente', para: 'Cozinha' },
    })
    const todas = await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
      tx
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(and(eq(auditLogs.entityType, 'user'), eq(auditLogs.actorUserId, loja.userId))),
    )
    expect(new Set(todas.map((r) => r.action))).toContain('user.deactivated')
  })
})
