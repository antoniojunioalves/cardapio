import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { closeDatabase } from '../src/db/index.js'
import { accounts, auditLogs } from '../src/db/schema/index.js'
import { autenticarConexao } from '../src/realtime/connection-auth.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'
import {
  criarColega,
  criarTenantComUsuario,
  removerTenantDeTeste,
  SENHA_PADRAO,
  sessaoDe,
  vincularConta,
  type TenantDeTeste,
} from './helpers/fixtures.js'

/**
 * "Minha conta" (Fase 25b): a pessoa troca o próprio nome e a própria senha. A
 * conta é uma só em todos os estabelecimentos dela, e a troca vale em todos.
 */

let app: FastifyInstance
/** A pessoa é dona da casa e também da equipe do outro, com a mesma conta. */
let casa: TenantDeTeste
let outro: TenantDeTeste
let noOutro: TenantDeTeste
/** Outra pessoa da casa: a troca de senha de uma não mexe nas sessões da outra. */
let colega: TenantDeTeste

/** Uma senha nas regras do cadastro, para a conta da casa. */
const SENHA_DA_CASA = 'Senha-da-casa-1'

interface Sessao {
  accessToken: string
  user: { id: string; tenantId: string; name: string; email: string }
  establishment: { slug: string }
}

const erro = (r: { json: <T>() => T }) =>
  r.json<{ error: { code: string; message: string } }>().error

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()
  casa = await criarTenantComUsuario({ dono: true, senha: SENHA_DA_CASA })
  outro = await criarTenantComUsuario()
  noOutro = await vincularConta(casa, outro, { permissoes: ['orders:read'] })
  colega = await criarColega(casa, ['orders:read'])
})

afterAll(async () => {
  await app.close()
  for (const f of [outro, casa]) await removerTenantDeTeste(f)
  await closeDatabase()
})

const entrar = (email: string, password: string) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } })

const renovar = (refreshToken: string) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken } })

const eu = (accessToken: string) =>
  app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { authorization: `Bearer ${accessToken}` },
  })

const renomear = (accessToken: string, name: string) =>
  app.inject({
    method: 'PATCH',
    url: '/api/v1/auth/account',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { name },
  })

const trocarSenha = (accessToken: string, currentPassword: string, newPassword: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/account/password',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { currentPassword, newPassword },
  })

/** Uma sessão na casa, qualquer que tenha sido o último estabelecimento usado. */
async function sessaoNaCasa(senha: string) {
  const login = sessaoDe<Sessao>(await entrar(casa.email, senha))
  if (login.establishment.slug === casa.slug) return login
  return sessaoDe<Sessao>(
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/switch',
      payload: { establishmentSlug: casa.slug, refreshToken: login.refreshToken },
    }),
  )
}

const acoesDaAuditoria = (tenantId: string, action: string) =>
  withTenant(tenantContextFromUser(tenantId), (tx) =>
    tx
      .select({ metadata: auditLogs.metadata, actor: auditLogs.actorUserId })
      .from(auditLogs)
      .where(eq(auditLogs.action, action)),
  )

describe('o próprio nome', () => {
  it('muda o nome da conta, e ele muda em todos os estabelecimentos da pessoa', async () => {
    const sessao = await sessaoNaCasa(SENHA_DA_CASA)

    const resposta = await renomear(sessao.accessToken, '  Maria da Casa  ')

    expect(resposta.statusCode, resposta.body).toBe(200)
    expect(resposta.json()).toMatchObject({ id: casa.userId, name: 'Maria da Casa' })
    expect((await eu(sessao.accessToken)).json<{ name: string }>().name).toBe('Maria da Casa')

    // No outro estabelecimento, a equipe vê o nome novo: a conta é a mesma.
    const [doOutro] = await withTenant(tenantContextFromUser(outro.tenantId), (tx) =>
      tx.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, casa.accountId)),
    )
    expect(doOutro?.name).toBe('Maria da Casa')
  })

  it('fica na auditoria do estabelecimento em que a pessoa estava, e só nele', async () => {
    const sessao = await sessaoNaCasa(SENHA_DA_CASA)
    await renomear(sessao.accessToken, 'Maria Auditada')

    const daCasa = await acoesDaAuditoria(casa.tenantId, 'account.renamed')
    expect(daCasa.at(-1)).toEqual({
      metadata: { nome: { de: expect.any(String) as string, para: 'Maria Auditada' } },
      actor: casa.userId,
    })
    expect(await acoesDaAuditoria(outro.tenantId, 'account.renamed')).toEqual([])
  })

  it('nome curto ou só de espaços é recusado', async () => {
    const sessao = await sessaoNaCasa(SENHA_DA_CASA)

    for (const name of ['M', '   ']) {
      expect((await renomear(sessao.accessToken, name)).statusCode).toBe(400)
    }
  })

  it('sem login, 401', async () => {
    const resposta = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/account',
      payload: { name: 'Invasor' },
    })
    expect(resposta.statusCode).toBe(401)
  })
})

describe('a própria senha', () => {
  // Cada teste que troca a senha devolve a anterior no fim, para o seguinte entrar com ela.
  let senhaAtual = SENHA_DA_CASA

  it('a senha atual errada é recusada, e nada muda', async () => {
    const sessao = await sessaoNaCasa(senhaAtual)

    const resposta = await trocarSenha(sessao.accessToken, 'nao-e-esta', 'Outra-senha-123')

    expect(resposta.statusCode).toBe(400)
    expect(erro(resposta)).toMatchObject({
      code: 'CURRENT_PASSWORD_INVALID',
      message: 'A senha atual não confere.',
    })
    expect((await entrar(casa.email, senhaAtual)).statusCode).toBe(200)
    expect((await eu(sessao.accessToken)).statusCode).toBe(200)
  })

  it('a nova igual à atual, ou fora das regras, é recusada', async () => {
    const sessao = await sessaoNaCasa(senhaAtual)

    const igual = await trocarSenha(sessao.accessToken, senhaAtual, senhaAtual)
    expect(igual.statusCode).toBe(400)
    expect(erro(igual).code).toBe('SAME_PASSWORD')

    const fraca = await trocarSenha(sessao.accessToken, senhaAtual, 'fraca')
    expect(fraca.statusCode).toBe(400)
    expect(erro(fraca).code).toBe('VALIDATION_ERROR')
  })

  it('troca: entra com a nova e não com a antiga, e este aparelho ganha uma sessão nova', async () => {
    const sessao = await sessaoNaCasa(senhaAtual)

    const resposta = await trocarSenha(sessao.accessToken, senhaAtual, 'Senha-nova-da-casa-2')

    expect(resposta.statusCode, resposta.body).toBe(200)
    const nova = sessaoDe<Sessao>(resposta)
    expect(nova.establishment.slug).toBe(casa.slug)
    expect(nova.refreshToken.startsWith(`${casa.tenantId}.`)).toBe(true)
    expect((await eu(nova.accessToken)).statusCode).toBe(200)

    expect((await entrar(casa.email, senhaAtual)).statusCode).toBe(401)
    expect((await entrar(casa.email, 'Senha-nova-da-casa-2')).statusCode).toBe(200)
    senhaAtual = 'Senha-nova-da-casa-2'

    const registros = await acoesDaAuditoria(casa.tenantId, 'account.password_changed')
    expect(registros.at(-1)).toEqual({ metadata: null, actor: casa.userId })
  })

  it('encerra as sessões da conta em todos os estabelecimentos, e o token de antes deixa de valer', async () => {
    const aqui = await sessaoNaCasa(senhaAtual)
    const outroAparelho = await sessaoNaCasa(senhaAtual)
    const noOutroEstabelecimento = sessaoDe<Sessao>(
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/switch',
        payload: {
          establishmentSlug: outro.slug,
          refreshToken: sessaoDe<Sessao>(await entrar(casa.email, senhaAtual)).refreshToken,
        },
      }),
    )
    expect(noOutroEstabelecimento.user.id).toBe(noOutro.userId)
    const daColega = sessaoDe<Sessao>(await entrar(colega.email, SENHA_PADRAO))

    // O `iat` é em segundos: os tokens de antes têm de ter saído num segundo anterior à troca.
    await new Promise((r) => setTimeout(r, 1100))
    const resposta = await trocarSenha(aqui.accessToken, senhaAtual, 'Senha-terceira-3')
    expect(resposta.statusCode, resposta.body).toBe(200)
    senhaAtual = 'Senha-terceira-3'

    for (const antiga of [aqui, outroAparelho, noOutroEstabelecimento]) {
      expect((await renovar(antiga.refreshToken)).statusCode).toBe(401)
      expect((await eu(antiga.accessToken)).statusCode).toBe(401)
    }
    // A conexão ao vivo também não aceita mais o token de antes.
    expect(await autenticarConexao(outroAparelho.accessToken, 'orders:read')).toMatchObject({
      ok: false,
      codigo: 4001,
    })

    // A sessão nova deste aparelho vale; a da colega, de outra conta, nem foi tocada.
    expect((await eu(sessaoDe<Sessao>(resposta).accessToken)).statusCode).toBe(200)
    expect((await renovar(daColega.refreshToken)).statusCode).toBe(200)
  })

  it('a conexão ao vivo aberta fecha na hora', async () => {
    const sessao = await sessaoNaCasa(senhaAtual)
    const ws = await app.injectWS('/api/v1/admin/orders/stream')
    const eventos: { tipo: 'mensagem' | 'fechou'; valor: string | number }[] = []
    ws.on('message', (d: Buffer) => eventos.push({ tipo: 'mensagem', valor: d.toString() }))
    ws.on('close', (codigo: number) => eventos.push({ tipo: 'fechou', valor: codigo }))
    ws.send(JSON.stringify({ type: 'auth', token: sessao.accessToken }))
    const ate = async (fn: () => boolean) => {
      const limite = Date.now() + 3000
      while (!fn() && Date.now() < limite) await new Promise((r) => setTimeout(r, 20))
    }
    await ate(() => eventos.length > 0)
    expect(eventos[0]?.valor).toBe('{"type":"ready"}')

    await trocarSenha(sessao.accessToken, senhaAtual, 'Senha-quarta-4')
    senhaAtual = 'Senha-quarta-4'

    await ate(() => eventos.some((e) => e.tipo === 'fechou'))
    expect(eventos.find((e) => e.tipo === 'fechou')?.valor).toBe(4001)
  })

  it('a troca não deixa rastro no outro estabelecimento da pessoa', async () => {
    const registros = await withTenant(tenantContextFromUser(outro.tenantId), (tx) =>
      tx
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(and(eq(auditLogs.actorUserId, noOutro.userId), eq(auditLogs.entityType, 'account'))),
    )
    expect(registros).toEqual([])
  })

  it('sem login, 401', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/account/password',
      payload: { currentPassword: 'x', newPassword: 'Senha-qualquer-1' },
    })
    expect(resposta.statusCode).toBe(401)
  })
})
