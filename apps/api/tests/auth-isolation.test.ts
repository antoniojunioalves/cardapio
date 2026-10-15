import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  definirContaPropria,
  definirEmailDaConta,
  withAccount,
  withAccountEmail,
} from '../src/accounts/context.js'
import { inserirConta } from '../src/accounts/repository.js'
import { buildApp } from '../src/app.js'
import { recordAudit } from '../src/audit/record.js'
import { closeDatabase, db } from '../src/db/index.js'
import { accounts, auditLogs, profiles, refreshTokens, users } from '../src/db/schema/index.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'
import { hashPassword } from '../src/auth/password.js'
import {
  criarTenantComUsuario,
  removerTenantDeTeste,
  SENHA_PADRAO,
  vincularConta,
  type TenantDeTeste,
} from './helpers/fixtures.js'

/**
 * Isolamento das tabelas da Fase 4.
 *
 * As mesmas garantias já provadas para `subscriptions`, agora sobre os dados
 * mais sensíveis do sistema: as contas, os vínculos, as sessões e o registro
 * de auditoria. Um vazamento aqui não expõe um preço — expõe credenciais e o
 * histórico de quem fez o quê.
 */

let app: FastifyInstance
let tenantA: TenantDeTeste
let tenantB: TenantDeTeste
/** Um terceiro estabelecimento, com a pessoa do Tenant A também na equipe. */
let tenantC: TenantDeTeste
/** O vínculo da conta do Tenant A no Tenant C. */
let aEmC: TenantDeTeste

beforeAll(async () => {
  app = await buildApp({ rateLimit: false })
  await app.ready()
  tenantA = await criarTenantComUsuario()
  tenantB = await criarTenantComUsuario()
  tenantC = await criarTenantComUsuario()
  aEmC = await vincularConta(tenantA, tenantC)
})

afterAll(async () => {
  await app.close()
  await removerTenantDeTeste(tenantC)
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

  it('o Tenant A não lê a conta — nem o hash da senha — de quem é do Tenant B', async () => {
    const encontrado = await withTenant(contextoDe(tenantA), (tx) =>
      tx
        .select({ hash: accounts.passwordHash })
        .from(accounts)
        .where(eq(accounts.id, tenantB.accountId)),
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

  it('o Tenant A não troca a senha de quem é do Tenant B', async () => {
    const alterados = await withTenant(contextoDe(tenantA), (tx) =>
      tx
        .update(accounts)
        .set({ passwordHash: 'hash-plantado-pelo-invasor' })
        .where(eq(accounts.id, tenantB.accountId))
        .returning({ id: accounts.id }),
    )

    expect(alterados).toEqual([])
  })

  it('nem a própria equipe troca a senha de alguém: a conta é da pessoa', async () => {
    const alterados = await withTenant(contextoDe(tenantA), (tx) =>
      tx
        .update(accounts)
        .set({ passwordHash: 'hash-plantado-pelo-dono' })
        .where(eq(accounts.id, tenantA.accountId))
        .returning({ id: accounts.id }),
    )

    expect(alterados).toEqual([])
  })

  it('fora de contexto não se enxerga usuário nem conta nenhuma', async () => {
    expect(await db.select().from(users)).toEqual([])
    expect(await db.select().from(accounts)).toEqual([])
  })
})

/**
 * A conta é global, sem `tenant_id`: o que a protege são as variáveis da
 * transação (`accounts/context.ts`). Estes testes provam o tamanho exato de
 * cada abertura.
 */
describe('contas', () => {
  it('com o e-mail no contexto, aparece a conta dele, e nenhuma outra', async () => {
    const visiveis = await withAccountEmail(tenantA.email, (tx) =>
      tx.select({ id: accounts.id }).from(accounts),
    )
    expect(visiveis).toEqual([{ id: tenantA.accountId }])

    const ninguem = await withAccountEmail('ninguem@exemplo.com', (tx) =>
      tx.select({ id: accounts.id }).from(accounts),
    )
    expect(ninguem).toEqual([])
  })

  it('o e-mail no contexto não mostra os vínculos, nem outra tabela', async () => {
    const [vinculos, perfis] = await withAccountEmail(tenantA.email, async (tx) => [
      await tx.select({ id: users.id }).from(users),
      await tx.select({ id: profiles.id }).from(profiles),
    ])

    expect(vinculos).toEqual([])
    expect(perfis).toEqual([])
  })

  it('o e-mail no contexto só lê: não troca a senha nem apaga a conta', async () => {
    const [alteradas, apagadas] = await withAccountEmail(tenantA.email, async (tx) => [
      await tx
        .update(accounts)
        .set({ passwordHash: 'hash-plantado-pelo-invasor' })
        .where(eq(accounts.email, tenantA.email))
        .returning({ id: accounts.id }),
      await tx
        .delete(accounts)
        .where(eq(accounts.email, tenantA.email))
        .returning({ id: accounts.id }),
    ])

    expect(alteradas).toEqual([])
    expect(apagadas).toEqual([])
  })

  it('o e-mail no contexto não sobrevive ao fim da transação', async () => {
    await withAccountEmail(tenantA.email, (tx) => tx.select().from(accounts))

    // A conexão volta ao pool sem o e-mail: o `set_config` é local à transação.
    expect(await db.select().from(accounts)).toEqual([])
  })

  it('só se cria a conta do e-mail que está no contexto', async () => {
    const hash = await hashPassword('qualquer-senha-123')

    await expect(
      withAccountEmail('quem-pediu@exemplo.com', (tx) =>
        inserirConta(tx, { email: 'outra-pessoa@exemplo.com', name: 'Outra', passwordHash: hash }),
      ),
    ).rejects.toThrow()
  })

  it('o banco recusa duas contas com o mesmo e-mail', async () => {
    await expect(
      withAccountEmail(tenantA.email, async (tx) =>
        inserirConta(tx, {
          email: tenantA.email,
          name: 'Mesmo e-mail',
          passwordHash: await hashPassword('qualquer-senha-123'),
        }),
      ),
    ).rejects.toMatchObject({ cause: { constraint: 'accounts_email' } })
  })

  it('o banco recusa e-mail com maiúsculas, que viraria uma segunda conta', async () => {
    const email = tenantA.email.toUpperCase()
    await expect(
      withAccountEmail(email, async (tx) =>
        inserirConta(tx, {
          email,
          name: 'Maiúsculas',
          passwordHash: await hashPassword('qualquer-senha-123'),
        }),
      ),
    ).rejects.toMatchObject({ cause: { constraint: 'accounts_email_minusculo' } })
  })

  it('a própria conta aparece e se altera; a de outra pessoa, não', async () => {
    const [visiveis, alteradas] = await withAccount(tenantA.accountId, async (tx) => [
      await tx.select({ id: accounts.id }).from(accounts),
      await tx
        .update(accounts)
        .set({ name: 'Tomada' })
        .where(eq(accounts.id, tenantB.accountId))
        .returning({ id: accounts.id }),
    ])

    expect(visiveis).toEqual([{ id: tenantA.accountId }])
    expect(alteradas).toEqual([])
  })

  it('sem estabelecimento, a conta vê os próprios vínculos em todos — e só eles', async () => {
    const vinculos = await withAccount(tenantA.accountId, (tx) =>
      tx.select({ id: users.id }).from(users),
    )

    expect(vinculos.map((v) => v.id).sort()).toEqual([tenantA.userId, aEmC.userId].sort())
  })

  it('os vínculos aparecem, mas não se alteram, sem o estabelecimento deles', async () => {
    const alterados = await withAccount(tenantA.accountId, (tx) =>
      tx
        .update(users)
        .set({ isActive: false })
        .where(eq(users.accountId, tenantA.accountId))
        .returning({ id: users.id }),
    )

    expect(alterados).toEqual([])
  })

  it('dentro de um estabelecimento, definir a conta não mostra a equipe de outro', async () => {
    const vinculos = await withTenant(contextoDe(tenantA), async (tx) => {
      await definirContaPropria(tx, tenantA.accountId)
      return tx.select({ id: users.id }).from(users)
    })

    expect(vinculos).toEqual([{ id: tenantA.userId }])
  })

  it('o estabelecimento vê as contas da própria equipe, e só elas', async () => {
    const deA = await withTenant(contextoDe(tenantA), (tx) =>
      tx.select({ id: accounts.id }).from(accounts),
    )
    const deC = await withTenant(contextoDe(tenantC), (tx) =>
      tx.select({ id: accounts.id }).from(accounts),
    )

    expect(deA).toEqual([{ id: tenantA.accountId }])
    expect(deC.map((c) => c.id).sort()).toEqual([tenantC.accountId, tenantA.accountId].sort())
  })

  it('a mesma conta não entra duas vezes no mesmo estabelecimento', async () => {
    await expect(
      withTenant(contextoDe(tenantA), (tx) =>
        tx.insert(users).values({ tenantId: tenantA.tenantId, accountId: tenantA.accountId }),
      ),
    ).rejects.toMatchObject({ cause: { constraint: 'users_conta_por_tenant' } })
  })
})

describe('perfis', () => {
  it('não vazam entre estabelecimentos', async () => {
    const deA = await withTenant(contextoDe(tenantA), (tx) =>
      tx.select({ id: profiles.id }).from(profiles),
    )

    expect(deA).toEqual([{ id: tenantA.profileId }])
  })

  it('o Tenant A não cria um perfil dentro do Tenant B', async () => {
    await expect(
      withTenant(contextoDe(tenantA), (tx) =>
        tx.insert(profiles).values({ tenantId: tenantB.tenantId, name: 'Infiltrado' }),
      ),
    ).rejects.toThrow()
  })

  it('o Tenant A não altera um perfil do Tenant B', async () => {
    const alterados = await withTenant(contextoDe(tenantA), (tx) =>
      tx
        .update(profiles)
        .set({ name: 'Tomado' })
        .where(eq(profiles.id, tenantB.profileId ?? ''))
        .returning({ id: profiles.id }),
    )

    expect(alterados).toEqual([])
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
    const sessaoDeB = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: tenantB.email, password: SENHA_PADRAO },
      })
    ).json<{ accessToken: string; user: { tenantId: string } }>()

    const eu = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${sessaoDeB.accessToken}` },
    })

    // O tenant vem do token assinado pelo servidor, e o RLS o aplica no banco.
    // Não há cabeçalho, corpo ou query capaz de apontá-lo para outro lugar.
    expect(eu.json<{ tenantId: string }>().tenantId).toBe(tenantB.tenantId)
    expect(sessaoDeB.user.tenantId).not.toBe(tenantA.tenantId)
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
  it('o Tenant A não dá a um usuário seu um perfil do Tenant B', async () => {
    // É o IDOR que a rota "mudar o perfil" abriria: o dono de A manda o UUID de
    // um perfil de B no corpo da requisição. A chave composta recusa.
    await expect(
      withTenant(contextoDe(tenantA), (tx) =>
        tx.update(users).set({ profileId: tenantB.profileId }).where(eq(users.id, tenantA.userId)),
      ),
    ).rejects.toMatchObject({ cause: { constraint: 'users_perfil_mesmo_tenant' } })
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
    const email = `desligado-${String(Date.now())}@exemplo.com`

    const idDoRegistro = await withTenant(contexto, async (tx) => {
      await definirEmailDaConta(tx, email)
      const accountId = await inserirConta(tx, {
        email,
        name: 'Funcionário desligado',
        passwordHash,
      })
      const [temporario] = await tx
        .insert(users)
        .values({ tenantId: tenantA.tenantId, accountId })
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
      // A conta sobra sem vínculo: sai também, para não ficar no banco de teste.
      await definirContaPropria(tx, accountId)
      await tx.delete(accounts).where(eq(accounts.id, accountId))
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
