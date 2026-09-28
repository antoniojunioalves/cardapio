import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { recordAudit } from '../src/audit/record.js'
import { closeDatabase, db } from '../src/db/index.js'
import { auditLogs, refreshTokens, userRoles, users } from '../src/db/schema/index.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'
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
      payload: { tenantSlug: tenantB.slug, email: tenantB.email, password: SENHA_PADRAO },
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
        payload: { tenantSlug: tenantA.slug, email: tenantA.email, password: SENHA_PADRAO },
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
