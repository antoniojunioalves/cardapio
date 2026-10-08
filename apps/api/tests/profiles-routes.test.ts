import { randomUUID } from 'node:crypto'

import { PERFIS_PRONTOS, TODAS_AS_PERMISSOES } from '@repo/shared'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { closeDatabase } from '../src/db/index.js'
import { auditLogs, profilePermissions } from '../src/db/schema/index.js'
import { criarPerfisProntos, listarPerfis } from '../src/profiles/repository.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'
import {
  criarTenantComUsuario,
  removerTenantDeTeste,
  SENHA_PADRAO,
  type TenantDeTeste,
} from './helpers/fixtures.js'

/**
 * Os perfis do estabelecimento: quem os vê, cria, altera e exclui — e o que
 * ninguém consegue fazer com eles, tenha a permissão que tiver.
 */

let app: FastifyInstance
let loja: TenantDeTeste
let outraLoja: TenantDeTeste
let tokenDoDono = ''

interface Perfil {
  id: string
  name: string
  description: string | null
  permissions: string[]
  users: number
}
interface Usuario {
  id: string
  profile: { id: string; name: string } | null
}

const entrar = async (email: string, password = SENHA_PADRAO) =>
  (
    await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } })
  ).json<{ accessToken: string }>().accessToken

function chamar(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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

const perfis = async (token = tokenDoDono) =>
  (await chamar('GET', '/profiles', token)).json<Perfil[]>()
const perfilPronto = async (nome: string) => {
  const achado = (await perfis()).find((p) => p.name === nome)
  if (!achado) throw new Error(`perfil ${nome} não encontrado`)
  return achado
}
const nomeUnico = (base: string) => `${base} ${randomUUID().slice(0, 6)}`

/** Cria um perfil pelo dono e devolve o que a API respondeu. */
async function criarPerfil(permissions: string[], name = nomeUnico('Perfil')) {
  const resposta = await chamar('POST', '/profiles', tokenDoDono, { name, permissions })
  expect(resposta.statusCode, resposta.body).toBe(201)
  return resposta.json<Perfil>()
}

/** Cria uma pessoa com o perfil e entra com ela. */
async function pessoaCom(profileId: string) {
  const email = `pessoa-${randomUUID().slice(0, 8)}@exemplo.com`
  const criada = await chamar('POST', '/users', tokenDoDono, {
    name: 'Pessoa',
    email,
    password: 'Senha-inicial-123',
    profileId,
  })
  expect(criada.statusCode, criada.body).toBe(201)
  return { id: criada.json<Usuario>().id, token: await entrar(email, 'Senha-inicial-123') }
}

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()

  // Sem assinatura, o estabelecimento não tem limite de usuários: os testes criam à vontade.
  loja = await criarTenantComUsuario({ dono: true })
  outraLoja = await criarTenantComUsuario()
  await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
    criarPerfisProntos(tx, loja.tenantId),
  )
  tokenDoDono = await entrar(loja.email)
})

afterAll(async () => {
  await app.close()
  for (const f of [loja, outraLoja]) await removerTenantDeTeste(f)
  await closeDatabase()
})

describe('listar perfis', () => {
  it('traz os do estabelecimento por nome, com as permissões e quantas pessoas os têm', async () => {
    const lista = await perfis()

    expect(lista.map((p) => p.name)).toEqual(
      expect.arrayContaining(PERFIS_PRONTOS.map((p) => p.nome)),
    )
    const nomes = lista.map((p) => p.name.toLowerCase())
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b)))
    const cozinha = lista.find((p) => p.name === 'Cozinha')
    expect(cozinha).toMatchObject({
      description: 'Vê os pedidos, muda o status e marca o que esgotou.',
      permissions: ['orders:read', 'orders:update', 'products:read', 'products:availability'],
      users: 0,
    })
  })

  it('conta quem tem o perfil', async () => {
    const perfil = await criarPerfil(['orders:read'])
    await pessoaCom(perfil.id)
    await pessoaCom(perfil.id)

    expect((await perfis()).find((p) => p.id === perfil.id)?.users).toBe(2)
  })

  it('não mostra os perfis de outro estabelecimento', async () => {
    expect((await perfis()).map((p) => p.id)).not.toContain(outraLoja.profileId)
  })

  it('uma permissão que saiu do catálogo e ficou gravada não aparece nem vale', async () => {
    const perfil = await criarPerfil(['orders:read'])
    await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
      tx.insert(profilePermissions).values({
        tenantId: loja.tenantId,
        profileId: perfil.id,
        permission: 'inventada:agora',
      }),
    )
    const pessoa = await pessoaCom(perfil.id)

    expect((await perfis()).find((p) => p.id === perfil.id)?.permissions).toEqual(['orders:read'])
    const eu = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${pessoa.token}` },
    })
    expect(eu.json<{ permissions: string[] }>().permissions).toEqual(['orders:read'])
  })

  it('quem não vê a equipe não vê os perfis', async () => {
    const cozinha = await pessoaCom((await perfilPronto('Cozinha')).id)

    expect((await chamar('GET', '/profiles', cozinha.token)).statusCode).toBe(403)
  })
})

describe('criar perfil', () => {
  it('grava o nome, a descrição e as permissões, na ordem do catálogo', async () => {
    const nome = nomeUnico('Caixa')
    const resposta = await chamar('POST', '/profiles', tokenDoDono, {
      name: `  ${nome} `,
      description: 'Atende e cancela.',
      permissions: ['orders:cancel', 'orders:read', 'orders:update'],
    })

    expect(resposta.statusCode, resposta.body).toBe(201)
    expect(resposta.json()).toMatchObject({
      name: nome,
      description: 'Atende e cancela.',
      permissions: ['orders:read', 'orders:update', 'orders:cancel'],
      users: 0,
    })
  })

  it('completa com o que cada permissão exige: quem altera preço vê o cardápio', async () => {
    const perfil = await criarPerfil(['products:price', 'orders:pause'])

    expect(perfil.permissions).toEqual([
      'orders:pause',
      'products:read',
      'products:price',
      'settings:read',
    ])
  })

  it('um perfil sem permissão nenhuma é aceito: a pessoa entra e não vê nada', async () => {
    const perfil = await criarPerfil([])

    expect(perfil.permissions).toEqual([])
  })

  it('permissão que não existe é recusada, e o perfil não é criado', async () => {
    const nome = nomeUnico('Inventado')
    const resposta = await chamar('POST', '/profiles', tokenDoDono, {
      name: nome,
      permissions: ['orders:read', 'cofre:abrir'],
    })

    expect(resposta.statusCode).toBe(400)
    expect(resposta.json()).toMatchObject({ error: { code: 'UNKNOWN_PERMISSION' } })
    expect(resposta.body).toContain('cofre:abrir')
    expect((await perfis()).map((p) => p.name)).not.toContain(nome)
  })

  it('nome repetido é recusado, sem diferenciar maiúsculas', async () => {
    const resposta = await chamar('POST', '/profiles', tokenDoDono, {
      name: 'ATENDENTE',
      permissions: [],
    })

    expect(resposta.statusCode).toBe(409)
    expect(resposta.json()).toMatchObject({ error: { code: 'PROFILE_NAME_TAKEN' } })
  })

  it('o mesmo nome pode existir em outro estabelecimento', async () => {
    // A outra loja tem o "Perfil de teste" dela; aqui o nome está livre.
    const resposta = await chamar('POST', '/profiles', tokenDoDono, {
      name: 'Perfil de teste',
      permissions: [],
    })

    expect(resposta.statusCode, resposta.body).toBe(201)
  })

  it('nome curto demais ou sem a lista de permissões não passa da validação', async () => {
    const semLista = await chamar('POST', '/profiles', tokenDoDono, { name: 'Sem lista' })
    const curto = await chamar('POST', '/profiles', tokenDoDono, { name: 'A', permissions: [] })

    expect(semLista.statusCode).toBe(400)
    expect(curto.statusCode).toBe(400)
  })

  it('fica na auditoria, com as permissões dadas', async () => {
    const perfil = await criarPerfil(['orders:read'])

    const [registro] = await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
      tx
        .select({ metadata: auditLogs.metadata, actor: auditLogs.actorUserId })
        .from(auditLogs)
        .where(and(eq(auditLogs.action, 'profile.created'), eq(auditLogs.entityId, perfil.id))),
    )
    expect(registro).toEqual({
      actor: loja.userId,
      metadata: { name: perfil.name, permissions: ['orders:read'] },
    })
  })
})

describe('ninguém dá o que não tem', () => {
  /** Alguém que gerencia perfis e pessoas, e vê os pedidos — nada além. */
  async function comoRecepcao() {
    const perfil = await criarPerfil(
      ['users:read', 'users:create', 'users:update', 'profiles:manage', 'orders:read'],
      nomeUnico('Recepção'),
    )
    return { perfil, ...(await pessoaCom(perfil.id)) }
  }

  it('quem gerencia perfis não cria um com permissão que não tem', async () => {
    const recepcao = await comoRecepcao()
    const nome = nomeUnico('Atalho')

    const resposta = await chamar('POST', '/profiles', recepcao.token, {
      name: nome,
      permissions: ['orders:read', 'settings:update'],
    })

    expect(resposta.statusCode).toBe(403)
    expect(resposta.json()).toMatchObject({
      error: {
        code: 'PROFILE_OUT_OF_REACH',
        details: { missing: ['settings:read', 'settings:update'] },
      },
    })
    expect(resposta.body).toContain('Alterar as configurações')
    expect((await perfis()).map((p) => p.name)).not.toContain(nome)
  })

  it('mas cria um com o que está ao alcance dele', async () => {
    const recepcao = await comoRecepcao()

    const resposta = await chamar('POST', '/profiles', recepcao.token, {
      name: nomeUnico('Portaria'),
      permissions: ['orders:read', 'users:read'],
    })

    expect(resposta.statusCode, resposta.body).toBe(201)
  })

  it('não acrescenta a um perfil uma permissão que não tem', async () => {
    const recepcao = await comoRecepcao()
    const alvo = await criarPerfil(['orders:read'])

    const resposta = await chamar('PUT', `/profiles/${alvo.id}`, recepcao.token, {
      name: alvo.name,
      permissions: ['orders:read', 'products:price'],
    })

    expect(resposta.statusCode).toBe(403)
    expect((await perfis()).find((p) => p.id === alvo.id)?.permissions).toEqual(['orders:read'])
  })

  it('não mexe num perfil que tem mais do que ele — nem para tirar permissões', async () => {
    const recepcao = await comoRecepcao()
    const administrador = await perfilPronto('Administrador')

    const esvaziar = await chamar('PUT', `/profiles/${administrador.id}`, recepcao.token, {
      name: administrador.name,
      permissions: ['orders:read'],
    })
    const excluir = await chamar(
      'DELETE',
      `/profiles/${(await criarPerfil(['settings:read'])).id}`,
      recepcao.token,
    )

    expect(esvaziar.statusCode).toBe(403)
    expect(esvaziar.json()).toMatchObject({ error: { code: 'PROFILE_OUT_OF_REACH' } })
    expect(excluir.statusCode).toBe(403)
    expect((await perfilPronto('Administrador')).permissions).toEqual(administrador.permissions)
  })

  it('ninguém altera o perfil que tem: nem para se dar mais, nem para se trancar', async () => {
    const recepcao = await comoRecepcao()

    const resposta = await chamar('PUT', `/profiles/${recepcao.perfil.id}`, recepcao.token, {
      name: recepcao.perfil.name,
      permissions: ['users:read'],
    })

    expect(resposta.statusCode).toBe(409)
    expect(resposta.json()).toMatchObject({ error: { code: 'CANNOT_CHANGE_OWN_PROFILE' } })
  })

  it('sem a permissão de gerenciar perfis, vê e não cria, não altera nem exclui', async () => {
    const soVe = await pessoaCom((await criarPerfil(['users:read'])).id)
    const alvo = await criarPerfil([])

    expect((await chamar('GET', '/profiles', soVe.token)).statusCode).toBe(200)
    const corpo = { name: nomeUnico('Não'), permissions: [] }
    expect((await chamar('POST', '/profiles', soVe.token, corpo)).statusCode).toBe(403)
    expect((await chamar('PUT', `/profiles/${alvo.id}`, soVe.token, corpo)).statusCode).toBe(403)
    expect((await chamar('DELETE', `/profiles/${alvo.id}`, soVe.token)).statusCode).toBe(403)
  })

  it('o proprietário alcança todos: cria um perfil com tudo', async () => {
    const perfil = await criarPerfil([...TODAS_AS_PERMISSOES])

    expect(perfil.permissions).toEqual([...TODAS_AS_PERMISSOES])
  })
})

describe('alterar perfil', () => {
  it('muda o nome, a descrição e a lista inteira das permissões', async () => {
    const perfil = await criarPerfil(['orders:read', 'orders:update'])
    const nome = nomeUnico('Renomeado')

    const resposta = await chamar('PUT', `/profiles/${perfil.id}`, tokenDoDono, {
      name: nome,
      description: 'Só marca o que esgotou.',
      permissions: ['products:availability'],
    })

    expect(resposta.statusCode, resposta.body).toBe(200)
    expect(resposta.json()).toMatchObject({
      id: perfil.id,
      name: nome,
      description: 'Só marca o que esgotou.',
      permissions: ['products:read', 'products:availability'],
    })
  })

  it('vale na hora para quem tem o perfil, com a sessão que já estava aberta', async () => {
    const perfil = await criarPerfil(['orders:read'])
    const pessoa = await pessoaCom(perfil.id)
    expect((await chamar('GET', '/orders', pessoa.token)).statusCode).toBe(200)
    expect((await chamar('GET', '/products', pessoa.token)).statusCode).toBe(403)

    await chamar('PUT', `/profiles/${perfil.id}`, tokenDoDono, {
      name: perfil.name,
      permissions: ['products:read'],
    })

    expect((await chamar('GET', '/orders', pessoa.token)).statusCode).toBe(403)
    expect((await chamar('GET', '/products', pessoa.token)).statusCode).toBe(200)
  })

  it('renomear para o nome de outro perfil é recusado', async () => {
    const perfil = await criarPerfil([])

    const resposta = await chamar('PUT', `/profiles/${perfil.id}`, tokenDoDono, {
      name: 'cozinha',
      permissions: [],
    })

    expect(resposta.statusCode).toBe(409)
    expect(resposta.json()).toMatchObject({ error: { code: 'PROFILE_NAME_TAKEN' } })
  })

  it('manter o próprio nome não é nome repetido', async () => {
    const perfil = await criarPerfil(['orders:read'])

    const resposta = await chamar('PUT', `/profiles/${perfil.id}`, tokenDoDono, {
      name: perfil.name,
      permissions: [],
    })

    expect(resposta.statusCode).toBe(200)
  })

  it('perfil de outro estabelecimento responde 404', async () => {
    const resposta = await chamar('PUT', `/profiles/${outraLoja.profileId ?? ''}`, tokenDoDono, {
      name: 'Tomado',
      permissions: [],
    })

    expect(resposta.statusCode).toBe(404)
  })

  it('a auditoria guarda o que foi dado e o que foi tirado', async () => {
    const perfil = await criarPerfil(['orders:read', 'orders:update'])
    await chamar('PUT', `/profiles/${perfil.id}`, tokenDoDono, {
      name: perfil.name,
      permissions: ['orders:read', 'orders:cancel'],
    })

    const [registro] = await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
      tx
        .select({ metadata: auditLogs.metadata })
        .from(auditLogs)
        .where(and(eq(auditLogs.action, 'profile.updated'), eq(auditLogs.entityId, perfil.id))),
    )
    expect(registro?.metadata).toEqual({
      permissoes: { dadas: ['orders:cancel'], tiradas: ['orders:update'] },
    })
  })
})

describe('excluir perfil', () => {
  it('sem ninguém dentro, exclui', async () => {
    const perfil = await criarPerfil(['orders:read'])

    const resposta = await chamar('DELETE', `/profiles/${perfil.id}`, tokenDoDono)

    expect(resposta.statusCode).toBe(204)
    expect((await perfis()).map((p) => p.id)).not.toContain(perfil.id)
  })

  it('com alguém dentro, não exclui, e diz quantas pessoas', async () => {
    const perfil = await criarPerfil(['orders:read'])
    await pessoaCom(perfil.id)

    const resposta = await chamar('DELETE', `/profiles/${perfil.id}`, tokenDoDono)

    expect(resposta.statusCode).toBe(409)
    expect(resposta.json()).toMatchObject({ error: { code: 'PROFILE_IN_USE' } })
    expect(resposta.body).toContain('Uma pessoa tem este perfil')
    expect((await perfis()).map((p) => p.id)).toContain(perfil.id)
  })

  it('os perfis prontos também se excluem, se ninguém os usa', async () => {
    const gerente = await perfilPronto('Gerente do cardápio')

    expect((await chamar('DELETE', `/profiles/${gerente.id}`, tokenDoDono)).statusCode).toBe(204)
  })

  it('perfil de outro estabelecimento responde 404, e continua lá', async () => {
    const resposta = await chamar('DELETE', `/profiles/${outraLoja.profileId ?? ''}`, tokenDoDono)

    expect(resposta.statusCode).toBe(404)
    const deLa = await withTenant(tenantContextFromUser(outraLoja.tenantId), (tx) =>
      listarPerfis(tx),
    )
    expect(deLa.map((p) => p.id)).toContain(outraLoja.profileId)
  })

  it('fica na auditoria', async () => {
    const perfil = await criarPerfil(['orders:read'])
    await chamar('DELETE', `/profiles/${perfil.id}`, tokenDoDono)

    const registros = await withTenant(tenantContextFromUser(loja.tenantId), (tx) =>
      tx
        .select({ metadata: auditLogs.metadata })
        .from(auditLogs)
        .where(and(eq(auditLogs.action, 'profile.deleted'), eq(auditLogs.entityId, perfil.id))),
    )
    expect(registros).toEqual([{ metadata: { name: perfil.name, permissions: ['orders:read'] } }])
  })
})
