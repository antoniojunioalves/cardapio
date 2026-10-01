import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { recordAudit } from '../src/audit/record.js'
import { tenantDoEmail } from '../src/auth/login-lookup.js'
import { closeDatabase, db } from '../src/db/index.js'
import { auditLogs, refreshTokens, userRoles, users } from '../src/db/schema/index.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant, type TenantTransaction } from '../src/tenant/with-tenant.js'
import { hashPassword } from '../src/auth/password.js'
import {
  criarTenantComUsuario,
  removerTenantDeTeste,
  SENHA_PADRAO,
  type TenantDeTeste,
} from './helpers/fixtures.js'

/**
 * Isolamento das tabelas da Fase 4.
 *
 * As mesmas garantias já provadas para `subscriptions`, agora sobre os dados
 * mais sensíveis do sistema: usuários, seus papéis, suas sessões e o registro
 * de auditoria. Um vazamento aqui não expõe um preço — expõe credenciais e o
 * histórico de quem fez o quê.
 */

let app: FastifyInstance
let tenantA: TenantDeTeste
let tenantB: TenantDeTeste

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()
  tenantA = await criarTenantComUsuario()
  tenantB = await criarTenantComUsuario()
})

afterAll(async () => {
  await app.close()
  await removerTenantDeTeste(tenantA)
  await removerTenantDeTeste(tenantB)
  await closeDatabase()
})

const contextoDe = (f: TenantDeTeste) => tenantContextFromUser(f.tenantId)

describe('usuários', () => {
  it('cada estabelecimento enxerga apenas os próprios usuários', async () => {
    const deA = await withTenant(contextoDe(tenantA), (tx) =>
      tx.select({ id: users.id }).from(users),
    )
    const deB = await withTenant(contextoDe(tenantB), (tx) =>
      tx.select({ id: users.id }).from(users),
    )

    expect(deA).toEqual([{ id: tenantA.userId }])
    expect(deB).toEqual([{ id: tenantB.userId }])
  })

  it('o Tenant A não lê o hash de senha de um usuário do Tenant B', async () => {
    const encontrado = await withTenant(contextoDe(tenantA), (tx) =>
      tx.select({ hash: users.passwordHash }).from(users).where(eq(users.id, tenantB.userId)),
    )

    expect(encontrado).toEqual([])
  })

  it('o Tenant A não desativa um usuário do Tenant B', async () => {
    const alterados = await withTenant(contextoDe(tenantA), (tx) =>
      tx
        .update(users)
        .set({ isActive: false })
        .where(eq(users.id, tenantB.userId))
        .returning({ id: users.id }),
    )

    expect(alterados).toEqual([])

    const [aindaAtivo] = await withTenant(contextoDe(tenantB), (tx) =>
      tx.select({ isActive: users.isActive }).from(users).where(eq(users.id, tenantB.userId)),
    )
    expect(aindaAtivo?.isActive).toBe(true)
  })

  it('o Tenant A não troca a senha de um usuário do Tenant B', async () => {
    const alterados = await withTenant(contextoDe(tenantA), (tx) =>
      tx
        .update(users)
        .set({ passwordHash: 'hash-plantado-pelo-invasor' })
        .where(eq(users.id, tenantB.userId))
        .returning({ id: users.id }),
    )

    expect(alterados).toEqual([])
  })

  it('fora de contexto não se enxerga usuário nenhum', async () => {
    expect(await db.select().from(users)).toEqual([])
  })
})

/**
 * O login pede só e-mail e senha: o estabelecimento é achado pelo e-mail, antes
 * de existir contexto de tenant. Quem permite isso é a policy `login_por_email`
 * — e estes testes provam o tamanho exato da abertura: ler a linha do e-mail
 * que está entrando, e mais nada.
 */
describe('login por e-mail', () => {
  /** Uma transação com o e-mail em login definido, como `tenantDoEmail` faz. */
  function comEmailEmLogin<T>(email: string, work: (tx: TenantTransaction) => Promise<T>) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.login_email', ${email}, true)`)
      return work(tx)
    })
  }

  it('acha o estabelecimento de cada e-mail', async () => {
    expect(await tenantDoEmail(tenantA.email)).toBe(tenantA.tenantId)
    expect(await tenantDoEmail(tenantB.email)).toBe(tenantB.tenantId)
    expect(await tenantDoEmail('ninguem@exemplo.com')).toBeNull()
  })

  it('só a linha do e-mail que está entrando aparece', async () => {
    const visiveis = await comEmailEmLogin(tenantA.email, (tx) =>
      tx.select({ id: users.id }).from(users),
    )

    expect(visiveis).toEqual([{ id: tenantA.userId }])
  })

  it('um e-mail que não existe não mostra linha nenhuma', async () => {
    const visiveis = await comEmailEmLogin('ninguem@exemplo.com', (tx) =>
      tx.select({ id: users.id }).from(users),
    )

    expect(visiveis).toEqual([])
  })

  it('a leitura não deixa trocar a senha nem desativar a conta', async () => {
    const alterados = await comEmailEmLogin(tenantA.email, (tx) =>
      tx
        .update(users)
        .set({ passwordHash: 'hash-plantado-pelo-invasor', isActive: false })
        .where(eq(users.email, tenantA.email))
        .returning({ id: users.id }),
    )

    expect(alterados).toEqual([])

    const [intacto] = await withTenant(contextoDe(tenantA), (tx) =>
      tx.select({ hash: users.passwordHash, isActive: users.isActive }).from(users),
    )
    expect(intacto?.hash).not.toBe('hash-plantado-pelo-invasor')
    expect(intacto?.isActive).toBe(true)
  })

  it('a leitura não deixa apagar a conta', async () => {
    const apagados = await comEmailEmLogin(tenantA.email, (tx) =>
      tx.delete(users).where(eq(users.email, tenantA.email)).returning({ id: users.id }),
    )

    expect(apagados).toEqual([])
  })

  it('não abre nenhuma outra tabela', async () => {
    const papeis = await comEmailEmLogin(tenantA.email, (tx) =>
      tx.select({ userId: userRoles.userId }).from(userRoles),
    )

    expect(papeis).toEqual([])
  })

  it('o e-mail em login não sobrevive ao fim da transação', async () => {
    await tenantDoEmail(tenantA.email)

    // A conexão volta ao pool sem o e-mail: o `set_config` é local à transação.
    expect(await db.select().from(users)).toEqual([])
  })

  it('o banco recusa o mesmo e-mail em dois estabelecimentos', async () => {
    await expect(
      withTenant(contextoDe(tenantB), async (tx) =>
        tx.insert(users).values({
          tenantId: tenantB.tenantId,
          name: 'Mesmo e-mail',
          email: tenantA.email,
          passwordHash: await hashPassword('qualquer-senha-123'),
        }),
      ),
    ).rejects.toMatchObject({ cause: { constraint: 'users_email' } })
  })

  it('o banco recusa e-mail com maiúsculas, que viraria uma segunda conta', async () => {
    await expect(
      withTenant(contextoDe(tenantB), async (tx) =>
        tx.insert(users).values({
          tenantId: tenantB.tenantId,
          name: 'Maiúsculas',
          email: tenantA.email.toUpperCase(),
          passwordHash: await hashPassword('qualquer-senha-123'),
        }),
      ),
    ).rejects.toMatchObject({ cause: { constraint: 'users_email_minusculo' } })
  })
})

describe('papéis atribuídos', () => {
  it('não vazam entre estabelecimentos', async () => {
    const deA = await withTenant(contextoDe(tenantA), (tx) =>
      tx.select({ userId: userRoles.userId }).from(userRoles),
    )

    expect(deA).toEqual([{ userId: tenantA.userId }])
  })

  it('o Tenant A não concede a si mesmo um papel dentro do Tenant B', async () => {
    await expect(
      withTenant(contextoDe(tenantA), (tx) =>
        tx.insert(userRoles).values({
          tenantId: tenantB.tenantId,
          userId: tenantB.userId,
          roleId: tenantB.roleId,
        }),
      ),
    ).rejects.toThrow()
  })
})

describe('sessões', () => {
  it('o refresh token de um estabelecimento é invisível para o outro', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: tenantB.email, password: SENHA_PADRAO },
    })

    const vistosPorA = await withTenant(contextoDe(tenantA), (tx) =>
      tx.select({ id: refreshTokens.id }).from(refreshTokens),
    )
    const vistosPorB = await withTenant(contextoDe(tenantB), (tx) =>
      tx.select({ id: refreshTokens.id }).from(refreshTokens),
    )

    expect(vistosPorA).toEqual([])
    expect(vistosPorB.length).toBeGreaterThan(0)
  })

  it('o token de acesso de um estabelecimento não alcança dados do outro', async () => {
    const sessaoDeA = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: tenantA.email, password: SENHA_PADRAO },
      })
    ).json<{ accessToken: string; user: { tenantId: string } }>()

    const eu = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${sessaoDeA.accessToken}` },
    })

    // O tenant vem do token assinado pelo servidor, e o RLS o aplica no banco.
    // Não há cabeçalho, corpo ou query capaz de apontá-lo para outro lugar.
    expect(eu.json<{ tenantId: string }>().tenantId).toBe(tenantA.tenantId)
    expect(sessaoDeA.user.tenantId).not.toBe(tenantB.tenantId)
  })
})

describe('registro de auditoria', () => {
  it('não vaza entre estabelecimentos', async () => {
    await withTenant(contextoDe(tenantA), (tx) =>
      recordAudit(tx, contextoDe(tenantA), {
        action: 'teste.acao',
        entityType: 'teste',
        actorUserId: tenantA.userId,
      }),
    )

    const vistosPorB = await withTenant(contextoDe(tenantB), (tx) =>
      tx.select({ action: auditLogs.action }).from(auditLogs),
    )

    expect(vistosPorB.some((r) => r.action === 'teste.acao')).toBe(false)
  })

  it('não pode ser alterado — nem pelo próprio estabelecimento', async () => {
    const alterados = await withTenant(contextoDe(tenantA), (tx) =>
      tx.update(auditLogs).set({ action: 'historia-reescrita' }).returning({ id: auditLogs.id }),
    )

    // Só existem policies de select e insert; o RLS nega o que não autoriza.
    // Um log que a aplicação pode reescrever não serve para auditá-la.
    expect(alterados).toEqual([])
  })

  it('não pode ser apagado', async () => {
    const antes = await withTenant(contextoDe(tenantA), (tx) =>
      tx.select({ id: auditLogs.id }).from(auditLogs),
    )
    expect(antes.length).toBeGreaterThan(0)

    const apagados = await withTenant(contextoDe(tenantA), (tx) =>
      tx.delete(auditLogs).returning({ id: auditLogs.id }),
    )
    expect(apagados).toEqual([])

    const depois = await withTenant(contextoDe(tenantA), (tx) =>
      tx.select({ id: auditLogs.id }).from(auditLogs),
    )
    expect(depois.length).toBe(antes.length)
  })

  it('não se grava auditoria marcada com o tenant de outro', async () => {
    await expect(
      withTenant(contextoDe(tenantA), (tx) =>
        tx.insert(auditLogs).values({
          tenantId: tenantB.tenantId,
          action: 'plantado',
          entityType: 'teste',
        }),
      ),
    ).rejects.toThrow()
  })
})

/**
 * A checagem de chave estrangeira roda por fora do RLS. Antes das FKs
 * compostas, o Tenant A não enxergava o usuário do Tenant B, mas conseguia
 * gravar referências a ele — bastava saber o UUID. Estes testes provam que o
 * banco agora recusa.
 */
describe('referências a usuário de outro estabelecimento', () => {
  it('o Tenant A não atribui papel a um usuário do Tenant B', async () => {
    // É o IDOR que a futura rota "atribuir papel" abriria: o dono de A manda
    // o UUID de um usuário de B no corpo da requisição.
    await expect(
      withTenant(contextoDe(tenantA), (tx) =>
        tx.insert(userRoles).values({
          tenantId: tenantA.tenantId,
          userId: tenantB.userId,
          roleId: tenantA.roleId,
        }),
      ),
    ).rejects.toThrow()
  })

  it('o Tenant A não grava sessão para um usuário do Tenant B', async () => {
    await expect(
      withTenant(contextoDe(tenantA), (tx) =>
        tx.insert(refreshTokens).values({
          tenantId: tenantA.tenantId,
          userId: tenantB.userId,
          tokenHash: 'f'.repeat(64),
          expiresAt: new Date(Date.now() + 60_000),
        }),
      ),
    ).rejects.toThrow()
  })

  it('o Tenant A não atribui ação de auditoria a um usuário do Tenant B', async () => {
    await expect(
      withTenant(contextoDe(tenantA), (tx) =>
        tx.insert(auditLogs).values({
          tenantId: tenantA.tenantId,
          actorUserId: tenantB.userId,
          action: 'forjado',
          entityType: 'teste',
        }),
      ),
    ).rejects.toThrow()
  })

  it('remover um usuário preserva a auditoria dele, só sem o vínculo', async () => {
    // A FK usa ON DELETE SET NULL (actor_user_id): anula só o ator. O SET
    // NULL comum anularia também o tenant_id, que é obrigatório, e a remoção
    // do usuário falharia.
    const contexto = contextoDe(tenantA)
    const passwordHash = await hashPassword('temporaria')

    const idDoRegistro = await withTenant(contexto, async (tx) => {
      const [temporario] = await tx
        .insert(users)
        .values({
          tenantId: tenantA.tenantId,
          name: 'Funcionário desligado',
          email: `desligado-${Date.now()}@exemplo.com`,
          passwordHash,
        })
        .returning({ id: users.id })
      if (!temporario) throw new Error('falha ao criar usuário temporário')

      const [registro] = await tx
        .insert(auditLogs)
        .values({
          tenantId: tenantA.tenantId,
          actorUserId: temporario.id,
          action: 'product.price_changed',
          entityType: 'product',
        })
        .returning({ id: auditLogs.id })

      await tx.delete(users).where(eq(users.id, temporario.id))
      return registro?.id ?? ''
    })

    const [registro] = await withTenant(contexto, (tx) =>
      tx
        .select({ actor: auditLogs.actorUserId, tenantId: auditLogs.tenantId })
        .from(auditLogs)
        .where(eq(auditLogs.id, idDoRegistro)),
    )

    expect(registro).toEqual({ actor: null, tenantId: tenantA.tenantId })
  })
})
