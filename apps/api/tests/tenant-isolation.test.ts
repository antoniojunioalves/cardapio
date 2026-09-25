import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { closeDatabase, db } from '../src/db/index.js'
import { plans, subscriptions, tenants } from '../src/db/schema/index.js'
import { tenantContextFromPublicSlug, tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'

/**
 * O teste mais importante do sistema.
 *
 * Tudo — a escolha do modelo de dados, a separação de roles no banco, o
 * `TenantContext`, o `withTenant` — existe para que as asserções abaixo sejam
 * verdadeiras. Se alguma delas falhar, um estabelecimento está enxergando os
 * dados de outro, e nada mais no produto importa até isso voltar a passar.
 */

const sufixo = Math.random().toString(36).slice(2, 10)

let tenantA = ''
let tenantB = ''
let planoId = ''
let assinaturaDeB = ''

beforeAll(async () => {
  const [plano] = await db
    .insert(plans)
    .values({ code: `TESTE_${sufixo.toUpperCase()}`, name: 'Plano de teste' })
    .returning({ id: plans.id })

  const [a] = await db
    .insert(tenants)
    .values({ slug: `tenant-a-${sufixo}`, name: 'Tenant A' })
    .returning({ id: tenants.id })

  const [b] = await db
    .insert(tenants)
    .values({ slug: `tenant-b-${sufixo}`, name: 'Tenant B' })
    .returning({ id: tenants.id })

  if (!plano || !a || !b) throw new Error('falha ao preparar os dados do teste')

  planoId = plano.id
  tenantA = a.id
  tenantB = b.id

  // Cada assinatura é criada dentro do contexto do seu tenant. Fora dele, o
  // WITH CHECK da policy recusaria a escrita — o que já é parte do que este
  // arquivo prova mais abaixo.
  await withTenant(tenantContextFromUser(tenantA), async (tx) => {
    await tx.insert(subscriptions).values({ tenantId: tenantA, planId: planoId })
  })

  await withTenant(tenantContextFromUser(tenantB), async (tx) => {
    const [assinatura] = await tx
      .insert(subscriptions)
      .values({ tenantId: tenantB, planId: planoId })
      .returning({ id: subscriptions.id })

    if (!assinatura) throw new Error('falha ao criar a assinatura do Tenant B')
    assinaturaDeB = assinatura.id
  })
})

afterAll(async () => {
  // Apagar os tenants leva as assinaturas junto, por cascata.
  if (tenantA) await db.delete(tenants).where(eq(tenants.id, tenantA))
  if (tenantB) await db.delete(tenants).where(eq(tenants.id, tenantB))
  if (planoId) await db.delete(plans).where(eq(plans.id, planoId))
  await closeDatabase()
})

describe('leitura', () => {
  it('cada tenant enxerga apenas as próprias linhas', async () => {
    const deA = await withTenant(tenantContextFromUser(tenantA), (tx) =>
      tx.select({ tenantId: subscriptions.tenantId }).from(subscriptions),
    )
    const deB = await withTenant(tenantContextFromUser(tenantB), (tx) =>
      tx.select({ tenantId: subscriptions.tenantId }).from(subscriptions),
    )

    expect(deA).toEqual([{ tenantId: tenantA }])
    expect(deB).toEqual([{ tenantId: tenantB }])
  })

  it('um SELECT sem WHERE nenhum continua devolvendo só o tenant do contexto', async () => {
    // É este o cenário que o RLS existe para cobrir: o desenvolvedor esqueceu
    // o filtro, e ainda assim nada vaza.
    const linhas = await withTenant(tenantContextFromUser(tenantA), (tx) =>
      tx.select().from(subscriptions),
    )

    expect(linhas).toHaveLength(1)
    expect(linhas[0]?.tenantId).toBe(tenantA)
  })

  it('fora de withTenant não se enxerga nada — falha fechada', async () => {
    const linhas = await db.select().from(subscriptions)

    expect(linhas).toEqual([])
  })

  it('a origem do contexto não muda o isolamento', async () => {
    const comoPublico = await withTenant(tenantContextFromPublicSlug(tenantA), (tx) =>
      tx.select({ tenantId: subscriptions.tenantId }).from(subscriptions),
    )

    expect(comoPublico).toEqual([{ tenantId: tenantA }])
  })
})

describe('escrita', () => {
  it('o Tenant A não altera linha do Tenant B, mesmo mirando nela de propósito', async () => {
    const alteradas = await withTenant(tenantContextFromUser(tenantA), (tx) =>
      tx
        .update(subscriptions)
        .set({ status: 'CANCELLED' })
        .where(eq(subscriptions.tenantId, tenantB))
        .returning({ id: subscriptions.id }),
    )

    expect(alteradas).toEqual([])

    const [linhaDeB] = await withTenant(tenantContextFromUser(tenantB), (tx) =>
      tx.select({ status: subscriptions.status }).from(subscriptions),
    )
    expect(linhaDeB?.status).toBe('ACTIVE')
  })

  it('o Tenant A não altera linha do Tenant B nem sabendo o id exato dela', async () => {
    const alteradas = await withTenant(tenantContextFromUser(tenantA), (tx) =>
      tx
        .update(subscriptions)
        .set({ status: 'CANCELLED' })
        .where(eq(subscriptions.id, assinaturaDeB))
        .returning({ id: subscriptions.id }),
    )

    // Conhecer o identificador não ajuda: é a proteção contra IDOR vindo do
    // banco, e não de o id ser difícil de adivinhar.
    expect(alteradas).toEqual([])
  })

  it('o Tenant A não apaga linha do Tenant B', async () => {
    const apagadas = await withTenant(tenantContextFromUser(tenantA), (tx) =>
      tx.delete(subscriptions).where(eq(subscriptions.id, assinaturaDeB)).returning({
        id: subscriptions.id,
      }),
    )

    expect(apagadas).toEqual([])

    const aindaExiste = await withTenant(tenantContextFromUser(tenantB), (tx) =>
      tx.select({ id: subscriptions.id }).from(subscriptions),
    )
    expect(aindaExiste).toEqual([{ id: assinaturaDeB }])
  })

  it('o Tenant A não insere linha marcada como do Tenant B', async () => {
    await expect(
      withTenant(tenantContextFromUser(tenantA), (tx) =>
        tx.insert(subscriptions).values({ tenantId: tenantB, planId: planoId }),
      ),
    ).rejects.toThrow()
  })

  it('não se escreve fora de contexto de tenant', async () => {
    await expect(
      db.insert(subscriptions).values({ tenantId: tenantA, planId: planoId }),
    ).rejects.toThrow()
  })
})

describe('vazamento entre contextos', () => {
  it('o contexto não sobrevive ao fim da transação', async () => {
    await withTenant(tenantContextFromUser(tenantA), (tx) => tx.select().from(subscriptions))

    // A conexão volta ao pool sem o tenant: o `set_config` é local à transação.
    // Sem isso, a próxima requisição a pegar esta conexão herdaria o tenant da
    // anterior — vazamento silencioso entre estabelecimentos.
    const semContexto = await db.select().from(subscriptions)
    expect(semContexto).toEqual([])
  })

  it('contextos em sequência não contaminam um ao outro', async () => {
    const primeiro = await withTenant(tenantContextFromUser(tenantA), (tx) =>
      tx.select({ tenantId: subscriptions.tenantId }).from(subscriptions),
    )
    const segundo = await withTenant(tenantContextFromUser(tenantB), (tx) =>
      tx.select({ tenantId: subscriptions.tenantId }).from(subscriptions),
    )
    const terceiro = await withTenant(tenantContextFromUser(tenantA), (tx) =>
      tx.select({ tenantId: subscriptions.tenantId }).from(subscriptions),
    )

    expect(primeiro).toEqual([{ tenantId: tenantA }])
    expect(segundo).toEqual([{ tenantId: tenantB }])
    expect(terceiro).toEqual([{ tenantId: tenantA }])
  })

  it('contextos concorrentes não se misturam', async () => {
    // Em produção as requisições são simultâneas e disputam o mesmo pool.
    // Se o contexto vazasse entre conexões, é aqui que apareceria.
    const [deA, deB, outraDeA] = await Promise.all([
      withTenant(tenantContextFromUser(tenantA), (tx) =>
        tx.select({ tenantId: subscriptions.tenantId }).from(subscriptions),
      ),
      withTenant(tenantContextFromUser(tenantB), (tx) =>
        tx.select({ tenantId: subscriptions.tenantId }).from(subscriptions),
      ),
      withTenant(tenantContextFromUser(tenantA), (tx) =>
        tx.select({ tenantId: subscriptions.tenantId }).from(subscriptions),
      ),
    ])

    expect(deA).toEqual([{ tenantId: tenantA }])
    expect(deB).toEqual([{ tenantId: tenantB }])
    expect(outraDeA).toEqual([{ tenantId: tenantA }])
  })

  it('um rollback também limpa o contexto', async () => {
    await expect(
      withTenant(tenantContextFromUser(tenantA), () => {
        throw new Error('falha proposital, para forçar rollback')
      }),
    ).rejects.toThrow('falha proposital')

    const semContexto = await db.select().from(subscriptions)
    expect(semContexto).toEqual([])
  })
})
