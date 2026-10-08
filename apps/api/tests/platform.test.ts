import { VERSAO_DOS_TERMOS } from '@repo/shared'
import { eq, like, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { closeDatabase, db } from '../src/db/index.js'
import {
  auditLogs,
  emailVerificationTokens,
  plans,
  refreshTokens,
  subscriptions,
  tenants,
} from '../src/db/schema/index.js'
import { seedPlans } from '../src/db/seed-plans.js'
import { email, MemoryEmailProvider } from '../src/email/index.js'
import { interpretar } from '../src/platform/args.js'
import { executar, formatarLista } from '../src/platform/commands.js'
import {
  listarEstabelecimentos,
  reativarEstabelecimento,
  reenviarConfirmacaoPelaPlataforma,
  suspenderEstabelecimento,
  trocarPlano,
} from '../src/platform/service.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'

/**
 * Os comandos da plataforma (Fase 19): o que o Super Admin faz, sem rota HTTP.
 *
 * Os estabelecimentos nascem pelo cadastro de verdade, para terem dono, plano
 * e sessão como os de produção.
 */

let app: FastifyInstance
const PREFIXO = `plt${Math.random().toString(36).slice(2, 8)}`
let contador = 0
const OPERADOR = { operador: 'junio' }
const SENHA = 'Senha-forte-123'

function caixaDeSaida(): MemoryEmailProvider {
  if (!(email instanceof MemoryEmailProvider)) throw new Error('os testes usam EMAIL_DRIVER=memory')
  return email
}

interface Cadastrado {
  slug: string
  tenantId: string
  email: string
  accessToken: string
  cookie: string
}

async function cadastrar(): Promise<Cadastrado> {
  const slug = `${PREFIXO}-${String((contador += 1))}`
  const dono = `${slug}@exemplo.com`
  const resposta = await app.inject({
    method: 'POST',
    url: '/api/v1/public/signup',
    payload: {
      establishmentName: `Estabelecimento ${slug}`,
      slug,
      ownerName: 'Maria Dona',
      email: dono,
      password: SENHA,
      termsVersion: VERSAO_DOS_TERMOS,
    },
  })
  expect(resposta.statusCode, resposta.body).toBe(201)
  const corpo = resposta.json<{ accessToken: string; establishment: { id: string } }>()
  const cookie = resposta.cookies.find((c) => c.name === 'refresh_token')?.value ?? ''
  return {
    slug,
    tenantId: corpo.establishment.id,
    email: dono,
    accessToken: corpo.accessToken,
    cookie,
  }
}

/** Confirma o e-mail do dono pelo link enviado: o estabelecimento passa a `ACTIVE`. */
async function confirmar(e: Cadastrado): Promise<void> {
  const mensagens = caixaDeSaida().enviados.filter((m) => m.para === e.email)
  const token = /#token=(\S+)/.exec(mensagens.at(-1)?.texto ?? '')?.[1] ?? ''
  const resposta = await app.inject({
    method: 'POST',
    url: '/api/v1/public/signup/confirm-email',
    payload: { token },
  })
  expect(resposta.statusCode, resposta.body).toBe(200)
}

async function publicado(): Promise<Cadastrado> {
  const e = await cadastrar()
  await confirmar(e)
  return e
}

const noTenant = <T>(e: Cadastrado, fn: Parameters<typeof withTenant<T>>[1]) =>
  withTenant(tenantContextFromUser(e.tenantId), fn)

const auditoria = (e: Cadastrado) =>
  noTenant(e, (tx) =>
    tx
      .select({
        action: auditLogs.action,
        actor: auditLogs.actorUserId,
        metadata: auditLogs.metadata,
      })
      .from(auditLogs),
  )

async function statusDe(e: Cadastrado): Promise<string | undefined> {
  const [tenant] = await db
    .select({ status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, e.tenantId))
  return tenant?.status
}

const eu = (token: string) =>
  app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { authorization: `Bearer ${token}` },
  })

const renovar = (cookie: string) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/refresh', cookies: { refresh_token: cookie } })

const entrar = (e: Cadastrado, password = SENHA) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: e.email, password } })

const cardapio = (e: Cadastrado) =>
  app.inject({ method: 'GET', url: `/api/v1/public/${e.slug}/menu` })

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
  await db.delete(tenants).where(like(tenants.slug, `${PREFIXO}-%`))
  await closeDatabase()
})

describe('linha de comando', () => {
  it('entende as cinco ações', () => {
    expect(interpretar(['listar'])).toEqual({
      ok: true,
      comando: { acao: 'listar' },
      operador: null,
    })
    expect(interpretar(['listar', '--status', 'Suspenso'])).toMatchObject({
      comando: { acao: 'listar', status: 'SUSPENDED' },
    })
    expect(
      interpretar(['suspender', 'lanchonete-do-ze', '--motivo', ' conteúdo impróprio ']),
    ).toMatchObject({
      comando: { acao: 'suspender', slug: 'lanchonete-do-ze', motivo: 'conteúdo impróprio' },
    })
    expect(interpretar(['reativar', 'lanchonete-do-ze', '--operador', 'junio'])).toEqual({
      ok: true,
      comando: { acao: 'reativar', slug: 'lanchonete-do-ze' },
      operador: 'junio',
    })
    expect(interpretar(['plano', 'lanchonete-do-ze', 'PREMIUM'])).toMatchObject({
      comando: { acao: 'plano', slug: 'lanchonete-do-ze', plano: 'PREMIUM' },
    })
    expect(interpretar(['reenviar-confirmacao', 'lanchonete-do-ze'])).toMatchObject({
      comando: { acao: 'reenviar-confirmacao', slug: 'lanchonete-do-ze' },
    })
  })

  it.each([
    [[], 'Diga a ação.'],
    [['apagar', 'x'], 'Não conheço a ação "apagar".'],
    [['suspender'], '"suspender" precisa do endereço do estabelecimento.'],
    [['suspender', 'x'], 'Suspender exige --motivo "<por quê>".'],
    [['suspender', 'x', '--motivo', '   '], 'Suspender exige --motivo "<por quê>".'],
    [
      ['suspender', 'x', 'porque', 'sim'],
      'Sobrou um argumento. O motivo vai em --motivo "<por quê>".',
    ],
    [['plano', 'x'], 'Diga o código do plano, por exemplo PREMIUM.'],
    [['listar', '--status', 'fechado'], '--status aceita ativo, suspenso ou pendente.'],
    [['listar', 'x'], '"listar" não recebe endereço.'],
    [['reativar', 'x', '--operador', ' '], '--operador não pode ficar vazio.'],
  ])('recusa %j dizendo o que falta', (argumentos, mensagem) => {
    expect(interpretar(argumentos)).toEqual({ ok: false, erro: mensagem })
  })

  it('opção desconhecida é recusada, e não ignorada', () => {
    expect(interpretar(['listar', '--tudo'])).toMatchObject({ ok: false })
  })
})

describe('listar', () => {
  it('mostra status, plano, dono e se o e-mail foi confirmado', async () => {
    const pendente = await cadastrar()
    const ativo = await publicado()

    const lista = await listarEstabelecimentos()
    expect(lista.find((e) => e.slug === pendente.slug)).toMatchObject({
      status: 'PENDING',
      plano: 'FREE',
      dono: pendente.email,
      emailConfirmado: false,
      usuariosAtivos: 1,
    })
    expect(lista.find((e) => e.slug === ativo.slug)).toMatchObject({
      status: 'ACTIVE',
      emailConfirmado: true,
    })

    const soPendentes = await listarEstabelecimentos({ status: 'PENDING' })
    expect(soPendentes.some((e) => e.slug === pendente.slug)).toBe(true)
    expect(soPendentes.some((e) => e.slug === ativo.slug)).toBe(false)
  })

  it('a tabela diz o status em português e marca o e-mail não confirmado', async () => {
    const pendente = await cadastrar()
    const texto = await executar({ acao: 'listar', status: 'PENDING' }, OPERADOR)
    const linha = texto.split('\n').find((l) => l.startsWith(pendente.slug)) ?? ''

    expect(texto.split('\n')[0]).toMatch(/^ENDEREÇO\s+NOME\s+STATUS\s+PLANO\s+DONO/)
    expect(linha).toContain('aguardando e-mail')
    expect(linha).toContain(`${pendente.email} (não confirmado)`)
    expect(formatarLista([])).toBe('Nenhum estabelecimento.')
  })
})

describe('suspender', () => {
  it('tira o cardápio do ar e registra o motivo e o operador, sem usuário', async () => {
    const e = await publicado()
    expect((await cardapio(e)).statusCode).toBe(200)

    await suspenderEstabelecimento(e.slug, { ...OPERADOR, motivo: 'conteúdo impróprio' })

    expect(await statusDe(e)).toBe('SUSPENDED')
    expect((await cardapio(e)).statusCode).toBe(404)

    const registro = (await auditoria(e)).find((r) => r.action === 'tenant.suspended')
    expect(registro?.actor).toBeNull()
    expect(registro?.metadata).toMatchObject({
      por: 'plataforma',
      operador: 'junio',
      motivo: 'conteúdo impróprio',
      statusAnterior: 'ACTIVE',
      sessoesEncerradas: 1,
    })
  })

  it('derruba quem já estava logado: o token de acesso e a renovação param de valer', async () => {
    const e = await publicado()
    expect((await eu(e.accessToken)).statusCode).toBe(200)

    const resultado = await suspenderEstabelecimento(e.slug, { ...OPERADOR, motivo: 'teste' })
    expect(resultado.sessoesEncerradas).toBe(1)

    // O token de acesso ainda não expirou — e mesmo assim não entra mais.
    expect((await eu(e.accessToken)).statusCode).toBe(401)
    expect((await renovar(e.cookie)).statusCode).toBe(401)

    // As sessões encerradas pela plataforma somem do banco: não ficam como
    // "revogadas", que é a marca de token rotacionado.
    const sessoes = await noTenant(e, (tx) =>
      tx.select({ id: refreshTokens.id }).from(refreshTokens),
    )
    expect(sessoes).toEqual([])
  })

  it('a renovação recusada não vira "token roubado" na auditoria', async () => {
    const e = await publicado()
    await suspenderEstabelecimento(e.slug, { ...OPERADOR, motivo: 'teste' })

    await renovar(e.cookie)

    // As sessões foram revogadas pela plataforma: reapresentar o token não é reuso.
    const acoes = (await auditoria(e)).map((r) => r.action)
    expect(acoes).not.toContain('auth.refresh_reuse_detected')
  })

  it('segunda barreira: suspenso por fora do comando, a sessão aberta também não renova', async () => {
    const e = await publicado()
    // Direto no banco: as sessões continuam lá, só o status mudou.
    await db.update(tenants).set({ status: 'SUSPENDED' }).where(eq(tenants.id, e.tenantId))

    expect((await eu(e.accessToken)).statusCode).toBe(401)
    expect((await renovar(e.cookie)).statusCode).toBe(401)

    // A sessão não foi rotacionada nem tratada como roubada.
    const sessoes = await noTenant(e, (tx) =>
      tx.select({ revokedAt: refreshTokens.revokedAt }).from(refreshTokens),
    )
    expect(sessoes).toEqual([{ revokedAt: null }])
    expect((await auditoria(e)).map((r) => r.action)).not.toContain('auth.refresh_reuse_detected')
  })

  it('ninguém entra, e o motivo só aparece para quem sabe a senha', async () => {
    const e = await publicado()
    await suspenderEstabelecimento(e.slug, { ...OPERADOR, motivo: 'teste' })

    const comSenha = await entrar(e)
    expect(comSenha.statusCode).toBe(403)
    expect(comSenha.body).toContain('suspenso')
    expect((await entrar(e, 'Senha-errada-1')).statusCode).toBe(401)
  })

  it('fecha na hora as conexões ao vivo do estabelecimento — e só as dele', async () => {
    const e = await publicado()
    const outro = await publicado()

    const abrir = async (token: string) => {
      const ws = await app.injectWS('/api/v1/admin/orders/stream')
      const estado = { pronta: false, fechamento: null as number | null }
      ws.on('message', () => {
        estado.pronta = true
      })
      ws.on('close', (codigo: number) => {
        estado.fechamento = codigo
      })
      ws.send(JSON.stringify({ type: 'auth', token }))
      await ate(() => estado.pronta)
      return estado
    }
    const ate = async (condicao: () => boolean) => {
      const limite = Date.now() + 3000
      while (!condicao()) {
        if (Date.now() > limite) throw new Error('tempo esgotado')
        await new Promise((r) => setTimeout(r, 20))
      }
    }

    const doSuspenso = await abrir(e.accessToken)
    const doOutro = await abrir(outro.accessToken)

    await suspenderEstabelecimento(e.slug, { ...OPERADOR, motivo: 'teste' })

    await ate(() => doSuspenso.fechamento !== null)
    expect(doSuspenso.fechamento).toBe(4001)
    expect(doOutro.fechamento).toBeNull()
  })

  it('não mexe em outro estabelecimento', async () => {
    const e = await publicado()
    const outro = await publicado()

    await suspenderEstabelecimento(e.slug, { ...OPERADOR, motivo: 'teste' })

    expect(await statusDe(outro)).toBe('ACTIVE')
    expect((await eu(outro.accessToken)).statusCode).toBe(200)
    expect((await renovar(outro.cookie)).statusCode).toBe(200)
  })

  it('endereço que não existe e estabelecimento já suspenso são recusados', async () => {
    await expect(
      suspenderEstabelecimento(`${PREFIXO}-nao-existe`, { ...OPERADOR, motivo: 'x' }),
    ).rejects.toMatchObject({ statusCode: 404 })

    const e = await cadastrar()
    await suspenderEstabelecimento(e.slug, { ...OPERADOR, motivo: 'primeira' })
    await expect(
      suspenderEstabelecimento(e.slug, { ...OPERADOR, motivo: 'segunda' }),
    ).rejects.toMatchObject({ code: 'ALREADY_SUSPENDED' })
  })
})

describe('reativar', () => {
  it('quem estava publicado volta ao ar, e a pessoa entra de novo', async () => {
    const e = await publicado()
    await suspenderEstabelecimento(e.slug, { ...OPERADOR, motivo: 'teste' })

    expect(await reativarEstabelecimento(e.slug, OPERADOR)).toEqual({ status: 'ACTIVE' })

    expect((await cardapio(e)).statusCode).toBe(200)
    expect((await entrar(e)).statusCode).toBe(200)
    const registro = (await auditoria(e)).find((r) => r.action === 'tenant.reactivated')
    expect(registro?.actor).toBeNull()
    expect(registro?.metadata).toMatchObject({ operador: 'junio', status: 'ACTIVE' })
  })

  it('a sessão de antes da suspensão não volta a valer, e não derruba a nova nem acusa roubo', async () => {
    const e = await publicado()
    await suspenderEstabelecimento(e.slug, { ...OPERADOR, motivo: 'teste' })
    await reativarEstabelecimento(e.slug, OPERADOR)
    const nova = (await entrar(e)).cookies.find((c) => c.name === 'refresh_token')?.value ?? ''

    // O aparelho que ficou com a sessão de antes tenta renovar.
    expect((await renovar(e.cookie)).statusCode).toBe(401)

    expect((await auditoria(e)).map((r) => r.action)).not.toContain('auth.refresh_reuse_detected')
    expect((await renovar(nova)).statusCode).toBe(200)
  })

  it('quem nunca confirmou o e-mail volta para "aguardando", e não vai ao ar', async () => {
    const e = await cadastrar()
    await suspenderEstabelecimento(e.slug, { ...OPERADOR, motivo: 'teste' })

    expect(await reativarEstabelecimento(e.slug, OPERADOR)).toEqual({ status: 'PENDING' })
    expect((await cardapio(e)).statusCode).toBe(404)
  })

  it('publicado sem e-mail confirmado (como os do seed) volta ao ar', async () => {
    const e = await cadastrar()
    await db.update(tenants).set({ status: 'ACTIVE' }).where(eq(tenants.id, e.tenantId))
    await suspenderEstabelecimento(e.slug, { ...OPERADOR, motivo: 'teste' })

    // Vale o status de antes da suspensão, registrado na auditoria.
    expect(await reativarEstabelecimento(e.slug, OPERADOR)).toEqual({ status: 'ACTIVE' })
  })

  it('quem não está suspenso não é "reativado"', async () => {
    const e = await cadastrar()

    await expect(reativarEstabelecimento(e.slug, OPERADOR)).rejects.toMatchObject({
      code: 'NOT_SUSPENDED',
    })
    expect(await statusDe(e)).toBe('PENDING')
  })
})

describe('trocar o plano', () => {
  const assinaturas = (e: Cadastrado) =>
    noTenant(e, (tx) =>
      tx
        .select({
          plano: plans.code,
          status: subscriptions.status,
          cancelledAt: subscriptions.cancelledAt,
        })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId)),
    )

  it('encerra a assinatura vigente, abre a nova e guarda o histórico', async () => {
    const e = await cadastrar()

    expect(await trocarPlano(e.slug, 'premium', OPERADOR)).toEqual({ de: 'FREE', para: 'PREMIUM' })

    const todas = await assinaturas(e)
    expect(todas).toHaveLength(2)
    expect(todas.find((a) => a.plano === 'FREE')).toMatchObject({ status: 'CANCELLED' })
    expect(todas.find((a) => a.plano === 'FREE')?.cancelledAt).not.toBeNull()
    expect(todas.find((a) => a.plano === 'PREMIUM')).toMatchObject({ status: 'ACTIVE' })

    const registro = (await auditoria(e)).find((r) => r.action === 'subscription.changed')
    expect(registro?.actor).toBeNull()
    expect(registro?.metadata).toMatchObject({ operador: 'junio', de: 'FREE', para: 'PREMIUM' })
  })

  it('o painel passa a mostrar o plano novo', async () => {
    const e = await cadastrar()
    await trocarPlano(e.slug, 'PREMIUM', OPERADOR)

    const uso = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/plan',
      headers: { authorization: `Bearer ${e.accessToken}` },
    })
    expect(uso.json<{ plan: { code: string } }>().plan.code).toBe('PREMIUM')
  })

  it('plano que não existe é recusado, com a lista dos que existem', async () => {
    const e = await cadastrar()

    await expect(trocarPlano(e.slug, 'OURO', OPERADOR)).rejects.toThrow(/Planos: .*FREE.*PREMIUM/)
    expect(await assinaturas(e)).toHaveLength(1)
  })

  it('o mesmo plano é recusado, sem criar assinatura nova', async () => {
    const e = await cadastrar()

    await expect(trocarPlano(e.slug, 'FREE', OPERADOR)).rejects.toMatchObject({ code: 'SAME_PLAN' })
    expect(await assinaturas(e)).toHaveLength(1)
  })
})

describe('reenviar a confirmação', () => {
  const envelhecerLinks = (e: Cadastrado) =>
    noTenant(e, (tx) =>
      tx
        .update(emailVerificationTokens)
        .set({ createdAt: sql`now() - interval '2 minutes'` })
        .where(eq(emailVerificationTokens.tenantId, e.tenantId)),
    )

  it('manda um link novo ao dono, e registra o operador', async () => {
    const e = await cadastrar()
    await envelhecerLinks(e)
    caixaDeSaida().limpar()

    expect(await reenviarConfirmacaoPelaPlataforma(e.slug, OPERADOR)).toEqual({ email: e.email })

    expect(caixaDeSaida().enviados.map((m) => m.para)).toEqual([e.email])
    const registro = (await auditoria(e)).find((r) => r.action === 'email_confirmation.resent')
    expect(registro?.actor).toBeNull()
    expect(registro?.metadata).toMatchObject({ por: 'plataforma', operador: 'junio' })

    // O link enviado pela plataforma publica o cardápio como qualquer outro.
    await confirmar(e)
    expect(await statusDe(e)).toBe('ACTIVE')
  })

  it('respeita o intervalo entre envios, e não envia a quem já confirmou', async () => {
    const recente = await cadastrar()
    await expect(reenviarConfirmacaoPelaPlataforma(recente.slug, OPERADOR)).rejects.toMatchObject({
      code: 'RESEND_TOO_SOON',
    })

    const confirmado = await publicado()
    await expect(
      reenviarConfirmacaoPelaPlataforma(confirmado.slug, OPERADOR),
    ).rejects.toMatchObject({ code: 'ALREADY_CONFIRMED' })
  })
})

describe('o que o comando diz a quem o rodou', () => {
  it('cada ação responde em uma frase', async () => {
    const e = await publicado()

    expect(await executar({ acao: 'suspender', slug: e.slug, motivo: 'teste' }, OPERADOR)).toBe(
      `"${e.slug}" suspenso: o cardápio saiu do ar e ninguém entra no painel. Sessões encerradas: 1.`,
    )
    expect(await executar({ acao: 'reativar', slug: e.slug }, OPERADOR)).toBe(
      `"${e.slug}" reativado: o cardápio voltou ao ar.`,
    )
    expect(await executar({ acao: 'plano', slug: e.slug, plano: 'PREMIUM' }, OPERADOR)).toBe(
      `"${e.slug}" passou do plano FREE para o PREMIUM.`,
    )
  })

  it('reativar quem não confirmou o e-mail avisa que o cardápio continua fora do ar', async () => {
    const e = await cadastrar()
    await executar({ acao: 'suspender', slug: e.slug, motivo: 'teste' }, OPERADOR)

    expect(await executar({ acao: 'reativar', slug: e.slug }, OPERADOR)).toContain(
      'o dono ainda não confirmou o e-mail',
    )
  })
})
