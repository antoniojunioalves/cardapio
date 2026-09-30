import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import { closeDatabase } from '../src/db/index.js'
import { auditLogs } from '../src/db/schema/index.js'
import { storage } from '../src/storage/index.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'
import {
  criarTenantComUsuario,
  removerTenantDeTeste,
  SENHA_PADRAO,
  type TenantDeTeste,
} from './helpers/fixtures.js'
import { corpoMultipart, JPEG, PNG, texto, WEBP } from './helpers/imagens.js'

let app: FastifyInstance
let dono: TenantDeTeste
let atendente: TenantDeTeste
let token = ''
let tokenDoAtendente = ''

async function entrar(f: TenantDeTeste): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { tenantSlug: f.slug, email: f.email, password: SENHA_PADRAO },
  })
  return r.json<{ accessToken: string }>().accessToken
}

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()
  dono = await criarTenantComUsuario({
    permissoes: ['settings:read', 'settings:update'],
    permissoesReais: true,
  })
  atendente = await criarTenantComUsuario({ permissoes: ['settings:read'], permissoesReais: true })
  token = await entrar(dono)
  tokenDoAtendente = await entrar(atendente)
})

afterAll(async () => {
  await app.close()
  await removerTenantDeTeste(dono)
  await removerTenantDeTeste(atendente)
  await closeDatabase()
})

function enviar(qual: 'logo' | 'cover', conteudo: Uint8Array, opcoes = {}, comToken = token) {
  const { payload, headers } = corpoMultipart(conteudo, opcoes)
  return app.inject({
    method: 'PUT',
    url: `/api/v1/admin/settings/${qual}`,
    payload,
    headers: { ...headers, authorization: `Bearer ${comToken}` },
  })
}

/** Caminho da URL pública, para buscar a imagem pelo próprio app. */
const caminhoDe = (url: string) => new URL(url).pathname

/** A chave de storage correspondente a uma URL pública. */
const chaveDe = (url: string) => caminhoDe(url).replace(/^\/uploads\//, '')

interface Configuracoes {
  logoUrl: string | null
  coverUrl: string | null
}

describe('proteção', () => {
  it('exige autenticação', async () => {
    const { payload, headers } = corpoMultipart(PNG)
    const r = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/logo',
      payload,
      headers,
    })

    expect(r.statusCode).toBe(401)
  })

  it('exige settings:update — só ler não basta', async () => {
    expect((await enviar('logo', PNG, {}, tokenDoAtendente)).statusCode).toBe(403)
  })
})

describe('envio', () => {
  it('aceita PNG e devolve a URL pública', async () => {
    const r = await enviar('logo', PNG)

    expect(r.statusCode).toBe(200)
    const { logoUrl } = r.json<Configuracoes>()
    expect(logoUrl).toMatch(/\/uploads\/tenants\/.+\/logo\/[0-9a-f-]+\.png$/)
  })

  it('uma foto de verdade, maior que o limite do corpo JSON, continua passando', async () => {
    // O limite de 64 KB é do JSON; o upload tem o seu (UPLOAD_MAX_BYTES). Se um
    // valesse para o outro, toda foto de celular seria recusada.
    const foto = Uint8Array.from([...PNG, ...new Uint8Array(300 * 1024)])
    const resposta = await enviar('cover', foto)
    expect(resposta.statusCode, resposta.body).toBe(200)
  })

  it('guarda o arquivo dentro do prefixo do próprio estabelecimento', async () => {
    const { logoUrl } = (await enviar('logo', PNG)).json<Configuracoes>()

    expect(chaveDe(logoUrl ?? '')).toMatch(new RegExp(`^tenants/${dono.tenantId}/logo/`))
  })

  it('aceita JPEG e WebP, com a extensão tirada do conteúdo', async () => {
    const jpeg = (await enviar('cover', JPEG, { nome: 'foto.png' })).json<Configuracoes>()
    expect(jpeg.coverUrl).toMatch(/\.jpg$/)

    const webp = (await enviar('cover', WEBP, { nome: 'foto.gif' })).json<Configuracoes>()
    expect(webp.coverUrl).toMatch(/\.webp$/)
  })

  it('ignora o nome enviado — nem acento nem ../ chegam ao disco', async () => {
    const r = await enviar('logo', PNG, { nome: '../../../ç ã é.png' })

    expect(r.statusCode).toBe(200)
    expect(r.json<Configuracoes>().logoUrl).not.toContain('..')
  })

  it('registra a troca na auditoria', async () => {
    await enviar('logo', PNG)

    const registros = await withTenant(tenantContextFromUser(dono.tenantId), (tx) =>
      tx.select({ action: auditLogs.action }).from(auditLogs),
    )
    expect(registros.some((r) => r.action === 'settings.logo_changed')).toBe(true)
  })
})

describe('recusa pelo conteúdo', () => {
  it('recusa SVG com 415', async () => {
    const svg = texto('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    const r = await enviar('logo', svg, { nome: 'logo.svg', contentType: 'image/svg+xml' })

    expect(r.statusCode).toBe(415)
  })

  it('recusa HTML disfarçado de PNG — nome e Content-Type não enganam', async () => {
    const r = await enviar('logo', texto('<!doctype html><script>roubar()</script>'), {
      nome: 'foto.png',
      contentType: 'image/png',
    })

    expect(r.statusCode).toBe(415)
  })

  it('um upload recusado não deixa nada no banco', async () => {
    const antes = (await enviar('logo', PNG)).json<Configuracoes>().logoUrl
    await enviar('logo', texto('não é imagem'))

    const depois = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/settings',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(depois.json<Configuracoes>().logoUrl).toBe(antes)
  })

  it('recusa arquivo acima do limite com 413', async () => {
    const grande = new Uint8Array(env.UPLOAD_MAX_BYTES + 1)
    grande.set(PNG)

    expect((await enviar('logo', grande)).statusCode).toBe(413)
  })

  it('recusa corpo que não é multipart', async () => {
    const r = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings/logo',
      payload: { file: 'base64...' },
      headers: { authorization: `Bearer ${token}` },
    })

    expect(r.statusCode).toBe(400)
  })
})

describe('substituição e remoção', () => {
  it('trocar a imagem apaga a anterior do disco', async () => {
    const primeira = (await enviar('cover', PNG)).json<Configuracoes>().coverUrl ?? ''
    expect(await storage.exists(chaveDe(primeira))).toBe(true)

    const segunda = (await enviar('cover', JPEG)).json<Configuracoes>().coverUrl ?? ''

    expect(segunda).not.toBe(primeira)
    expect(await storage.exists(chaveDe(segunda))).toBe(true)
    expect(await storage.exists(chaveDe(primeira))).toBe(false)
  })

  it('remover zera a URL e apaga o arquivo', async () => {
    const url = (await enviar('logo', PNG)).json<Configuracoes>().logoUrl ?? ''

    const r = await app.inject({
      method: 'DELETE',
      url: '/api/v1/admin/settings/logo',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(r.statusCode).toBe(200)
    expect(r.json<Configuracoes>().logoUrl).toBeNull()
    expect(await storage.exists(chaveDe(url))).toBe(false)
  })
})

describe('entrega da imagem', () => {
  it('serve o mesmo conteúdo que foi enviado, com o tipo certo', async () => {
    const url = (await enviar('logo', PNG)).json<Configuracoes>().logoUrl ?? ''
    const r = await app.inject({ method: 'GET', url: caminhoDe(url) })

    expect(r.statusCode).toBe(200)
    expect(r.headers['content-type']).toBe('image/png')
    expect(new Uint8Array(r.rawPayload)).toEqual(PNG)
  })

  it('permite uso por outra origem — senão o <img> do frontend quebraria em silêncio', async () => {
    const url = (await enviar('logo', PNG)).json<Configuracoes>().logoUrl ?? ''
    const r = await app.inject({ method: 'GET', url: caminhoDe(url) })

    expect(r.headers['cross-origin-resource-policy']).toBe('cross-origin')
  })

  it('pode ficar em cache para sempre, porque cada envio gera URL nova', async () => {
    const url = (await enviar('logo', PNG)).json<Configuracoes>().logoUrl ?? ''
    const r = await app.inject({ method: 'GET', url: caminhoDe(url) })

    expect(r.headers['cache-control']).toContain('immutable')
  })

  it('as rotas da API continuam com a política restritiva', async () => {
    const r = await app.inject({ method: 'GET', url: '/health' })

    expect(r.headers['cross-origin-resource-policy']).toBe('same-origin')
  })

  it('não lista diretórios nem entrega arquivos ocultos', async () => {
    // O código é 403, e não 404. Distinguir "diretório existe" de "não existe"
    // não revela nada: o diretório é o id do tenant, que já aparece em toda
    // URL pública de logo. O que importa é que nada seja entregue.
    for (const url of ['/uploads/', '/uploads/tenants/', '/uploads/.env']) {
      const r = await app.inject({ method: 'GET', url })

      expect(r.statusCode).toBe(403)
      expect(r.body).not.toContain('tenants')
    }
  })

  it('não sai do diretório de uploads', async () => {
    const r = await app.inject({ method: 'GET', url: '/uploads/../../package.json' })

    expect(r.statusCode).toBe(404)
  })
})
