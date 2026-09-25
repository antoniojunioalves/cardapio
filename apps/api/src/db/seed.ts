import { eq } from 'drizzle-orm'

import { infraLogger } from '../lib/logger.js'
import { tenantContextFromUser } from '../tenant/context.js'
import { withTenant } from '../tenant/with-tenant.js'
import { closeDatabase, db } from './index.js'
import { planFeatures, plans, subscriptions, tenants } from './schema/index.js'

/**
 * Dados de demonstração para desenvolvimento.
 *
 * Idempotente: rodar de novo não duplica nada. Dois estabelecimentos, para que
 * o isolamento entre tenants possa ser conferido à mão no psql, e não apenas
 * pelos testes.
 *
 * Roda com a conexão da aplicação — a mesma que a API usa, sem DDL. As
 * assinaturas são inseridas por `withTenant`, então o seed exercita o mesmo
 * caminho que o código de produção vai exercitar. Tentar inseri-las fora do
 * contexto seria recusado pelo `WITH CHECK` da policy.
 */

const PLANOS = [
  {
    code: 'FREE',
    name: 'Gratuito',
    description: 'Para começar: cardápio digital e pedidos pelo WhatsApp.',
    sortOrder: 0,
    features: [
      { key: 'maxOrdersPerMonth', isEnabled: true, limitValue: 100 },
      { key: 'maxUsers', isEnabled: true, limitValue: 2 },
      { key: 'reports', isEnabled: false, limitValue: null },
    ],
  },
  {
    code: 'PREMIUM',
    name: 'Premium',
    description: 'Sem teto de pedidos, com relatórios e usuários ilimitados.',
    sortOrder: 100,
    features: [
      // limitValue nulo significa ilimitado — zero seria um limite de verdade.
      { key: 'maxOrdersPerMonth', isEnabled: true, limitValue: null },
      { key: 'maxUsers', isEnabled: true, limitValue: null },
      { key: 'reports', isEnabled: true, limitValue: null },
    ],
  },
] as const

const ESTABELECIMENTOS = [
  { slug: 'lanchonete-do-ze', name: 'Lanchonete do Zé', plano: 'FREE' },
  { slug: 'pizzaria-da-esquina', name: 'Pizzaria da Esquina', plano: 'PREMIUM' },
] as const

async function semearPlanos(): Promise<Map<string, string>> {
  const idsPorCodigo = new Map<string, string>()

  for (const plano of PLANOS) {
    await db
      .insert(plans)
      .values({
        code: plano.code,
        name: plano.name,
        description: plano.description,
        sortOrder: plano.sortOrder,
      })
      .onConflictDoNothing({ target: plans.code })

    const [registro] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.code, plano.code))
      .limit(1)

    if (!registro) throw new Error(`plano ${plano.code} não foi criado`)
    idsPorCodigo.set(plano.code, registro.id)

    for (const feature of plano.features) {
      await db
        .insert(planFeatures)
        .values({ planId: registro.id, ...feature })
        .onConflictDoNothing()
    }
  }

  return idsPorCodigo
}

async function semearEstabelecimentos(idsDosPlanos: Map<string, string>): Promise<void> {
  for (const estabelecimento of ESTABELECIMENTOS) {
    await db
      .insert(tenants)
      .values({ slug: estabelecimento.slug, name: estabelecimento.name })
      .onConflictDoNothing({ target: tenants.slug })

    const [tenant] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, estabelecimento.slug))
      .limit(1)

    if (!tenant) throw new Error(`tenant ${estabelecimento.slug} não foi criado`)

    const planId = idsDosPlanos.get(estabelecimento.plano)
    if (!planId) throw new Error(`plano ${estabelecimento.plano} não encontrado`)

    // Dentro do contexto do tenant: é o WITH CHECK da policy que exige isso.
    await withTenant(tenantContextFromUser(tenant.id), async (tx) => {
      await tx.insert(subscriptions).values({ tenantId: tenant.id, planId }).onConflictDoNothing()
    })

    infraLogger.info(
      { slug: estabelecimento.slug, plano: estabelecimento.plano },
      'estabelecimento semeado',
    )
  }
}

try {
  const idsDosPlanos = await semearPlanos()
  await semearEstabelecimentos(idsDosPlanos)
  infraLogger.info('seed concluído')
} catch (error) {
  infraLogger.fatal({ err: error }, 'falha no seed')
  await closeDatabase()
  process.exit(1)
}

await closeDatabase()
