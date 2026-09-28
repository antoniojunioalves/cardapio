import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { closeDatabase, db } from '../src/db/index.js'
import {
  businessHours,
  deliveryRegions,
  deliverySettings,
  tenantPaymentMethods,
  tenantSettings,
} from '../src/db/schema/index.js'
import {
  obterConfiguracoes,
  obterEntrega,
  substituirEntrega,
  substituirHorarios,
} from '../src/settings/service.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'
import {
  criarTenantComUsuario,
  removerTenantDeTeste,
  type TenantDeTeste,
} from './helpers/fixtures.js'

/**
 * Isolamento das tabelas de configuração.
 *
 * Aqui mora o que a tabela `tenants` deliberadamente não guarda — endereço,
 * telefone de contato, regras comerciais. É por isso que estas precisam de
 * RLS enquanto `tenants` não precisa.
 */

let tenantA: TenantDeTeste
let tenantB: TenantDeTeste

beforeAll(async () => {
  tenantA = await criarTenantComUsuario()
  tenantB = await criarTenantComUsuario()

  const contextoA = tenantContextFromUser(tenantA.tenantId)
  const contextoB = tenantContextFromUser(tenantB.tenantId)

  await substituirHorarios(contextoA, tenantA.userId, [
    { dayOfWeek: 1, opensAt: '11:00', closesAt: '15:00' },
  ])
  await substituirHorarios(contextoB, tenantB.userId, [
    { dayOfWeek: 2, opensAt: '18:00', closesAt: '23:00' },
  ])

  await substituirEntrega(contextoB, tenantB.userId, {
    configuracao: {
      deliveryEnabled: true,
      pickupEnabled: false,
      feeMode: 'BY_REGION',
      fixedFeeInCents: 0,
    },
    regioes: [{ name: 'Centro de B', feeInCents: 800, isActive: true, sortOrder: 0 }],
  })
})

afterAll(async () => {
  await removerTenantDeTeste(tenantA)
  await removerTenantDeTeste(tenantB)
  await closeDatabase()
})

const contextoDe = (f: TenantDeTeste) => tenantContextFromUser(f.tenantId)

describe('configurações do estabelecimento', () => {
  it('cada um enxerga apenas a própria linha', async () => {
    const deA = await obterConfiguracoes(contextoDe(tenantA))
    const deB = await obterConfiguracoes(contextoDe(tenantB))

    expect(deA.tenantId).toBe(tenantA.tenantId)
    expect(deB.tenantId).toBe(tenantB.tenantId)

    const vistasPorA = await withTenant(contextoDe(tenantA), (tx) =>
      tx.select({ tenantId: tenantSettings.tenantId }).from(tenantSettings),
    )
    expect(vistasPorA).toEqual([{ tenantId: tenantA.tenantId }])
  })

  it('o Tenant A não altera as configurações do Tenant B', async () => {
    const alteradas = await withTenant(contextoDe(tenantA), (tx) =>
      tx
        .update(tenantSettings)
        .set({ minimumOrderInCents: 999_99 })
        .where(eq(tenantSettings.tenantId, tenantB.tenantId))
        .returning({ id: tenantSettings.id }),
    )

    expect(alteradas).toEqual([])
    expect((await obterConfiguracoes(contextoDe(tenantB))).minimumOrderInCents).toBe(0)
  })

  it('o Tenant A não pausa os pedidos do Tenant B', async () => {
    const alteradas = await withTenant(contextoDe(tenantA), (tx) =>
      tx
        .update(tenantSettings)
        .set({ isAcceptingOrders: false })
        .where(eq(tenantSettings.tenantId, tenantB.tenantId))
        .returning({ id: tenantSettings.id }),
    )

    expect(alteradas).toEqual([])
    expect((await obterConfiguracoes(contextoDe(tenantB))).isAcceptingOrders).toBe(true)
  })
})

describe('horário de funcionamento', () => {
  it('não vaza entre estabelecimentos', async () => {
    const deA = await withTenant(contextoDe(tenantA), (tx) =>
      tx.select({ dayOfWeek: businessHours.dayOfWeek }).from(businessHours),
    )

    expect(deA).toEqual([{ dayOfWeek: 1 }])
  })

  it('substituir a semana de um não apaga a do outro', async () => {
    // A substituição faz DELETE sem WHERE de tenant — quem limita o alcance é
    // o RLS. Se ele falhasse, esta chamada apagaria o horário de todo mundo.
    await substituirHorarios(contextoDe(tenantA), tenantA.userId, [
      { dayOfWeek: 4, opensAt: '08:00', closesAt: '12:00' },
    ])

    const deB = await withTenant(contextoDe(tenantB), (tx) =>
      tx.select({ dayOfWeek: businessHours.dayOfWeek }).from(businessHours),
    )
    expect(deB).toEqual([{ dayOfWeek: 2 }])
  })

  it('o Tenant A não cadastra horário no Tenant B', async () => {
    await expect(
      withTenant(contextoDe(tenantA), (tx) =>
        tx.insert(businessHours).values({
          tenantId: tenantB.tenantId,
          dayOfWeek: 0,
          opensAt: '00:00',
          closesAt: '23:00',
        }),
      ),
    ).rejects.toThrow()
  })
})

describe('entrega', () => {
  it('as regiões de um são invisíveis para o outro', async () => {
    const vistasPorA = await withTenant(contextoDe(tenantA), (tx) =>
      tx.select({ name: deliveryRegions.name }).from(deliveryRegions),
    )
    const vistasPorB = await withTenant(contextoDe(tenantB), (tx) =>
      tx.select({ name: deliveryRegions.name }).from(deliveryRegions),
    )

    expect(vistasPorA).toEqual([])
    expect(vistasPorB).toEqual([{ name: 'Centro de B' }])
  })

  it('o Tenant A não muda o modo de cobrança do Tenant B', async () => {
    const alteradas = await withTenant(contextoDe(tenantA), (tx) =>
      tx
        .update(deliverySettings)
        .set({ feeMode: 'FIXED', fixedFeeInCents: 0 })
        .where(eq(deliverySettings.tenantId, tenantB.tenantId))
        .returning({ id: deliverySettings.id }),
    )

    expect(alteradas).toEqual([])
    expect((await obterEntrega(contextoDe(tenantB))).configuracao.feeMode).toBe('BY_REGION')
  })
})

describe('formas de pagamento', () => {
  it('a escolha de um não aparece para o outro', async () => {
    const vistasPorA = await withTenant(contextoDe(tenantA), (tx) =>
      tx.select({ id: tenantPaymentMethods.id }).from(tenantPaymentMethods),
    )

    expect(vistasPorA).toEqual([])
  })
})

describe('fora de contexto', () => {
  it('nenhuma tabela de configuração é legível', async () => {
    expect(await db.select().from(tenantSettings)).toEqual([])
    expect(await db.select().from(businessHours)).toEqual([])
    expect(await db.select().from(deliverySettings)).toEqual([])
    expect(await db.select().from(deliveryRegions)).toEqual([])
    expect(await db.select().from(tenantPaymentMethods)).toEqual([])
  })
})
