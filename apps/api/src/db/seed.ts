import { eq } from 'drizzle-orm'

import { hashPassword } from '../auth/password.js'
import { infraLogger } from '../lib/logger.js'
import { tenantContextFromUser } from '../tenant/context.js'
import { withTenant } from '../tenant/with-tenant.js'
import { closeDatabase, db } from './index.js'
import {
  businessHours,
  deliveryRegions,
  deliverySettings,
  paymentMethods,
  planFeatures,
  plans,
  roles,
  subscriptions,
  tenantPaymentMethods,
  tenantSettings,
  tenants,
  userRoles,
  users,
} from './schema/index.js'
import { seedPaymentMethods } from './seed-payment-methods.js'
import { seedRbac } from './seed-rbac.js'

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

/** Senha única de desenvolvimento. Nunca existe fora do seed. */
const SENHA_DEMO = 'cardapio123'

/** Terça a domingo, das 18:00 às 02:00 — atravessando a meia-noite. */
const NOITE_ATRAVESSANDO_MEIA_NOITE = [2, 3, 4, 5, 6, 0].map((dia) => ({
  dia,
  abre: '18:00',
  fecha: '02:00',
}))

/** Almoço e jantar, de segunda a sábado: dois intervalos no mesmo dia. */
const ALMOCO_E_JANTAR = [1, 2, 3, 4, 5, 6].flatMap((dia) => [
  { dia, abre: '11:00', fecha: '14:30' },
  { dia, abre: '18:00', fecha: '23:00' },
])

const ESTABELECIMENTOS = [
  {
    slug: 'lanchonete-do-ze',
    name: 'Lanchonete do Zé',
    plano: 'FREE',
    dono: { nome: 'Zé Proprietário', email: 'ze@exemplo.com' },
    descricao: 'Hambúrgueres artesanais e porções. Da terça ao domingo, até tarde.',
    whatsapp: '5511999990001',
    pedidoMinimoEmCentavos: 2000,
    modoDeTaxa: 'FIXED' as const,
    taxaFixaEmCentavos: 500,
    horarios: NOITE_ATRAVESSANDO_MEIA_NOITE,
    regioes: [] as { nome: string; taxaEmCentavos: number }[],
    pagamentos: ['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD'],
  },
  {
    slug: 'pizzaria-da-esquina',
    name: 'Pizzaria da Esquina',
    plano: 'PREMIUM',
    dono: { nome: 'Ana Proprietária', email: 'ana@exemplo.com' },
    descricao: 'Pizzas de forno a lenha. Almoço e jantar, de segunda a sábado.',
    whatsapp: '5511999990002',
    pedidoMinimoEmCentavos: 3500,
    modoDeTaxa: 'BY_REGION' as const,
    taxaFixaEmCentavos: 0,
    horarios: ALMOCO_E_JANTAR,
    regioes: [
      { nome: 'Centro', taxaEmCentavos: 500 },
      { nome: 'Jardim das Flores', taxaEmCentavos: 700 },
      { nome: 'Vila Nova', taxaEmCentavos: 1000 },
    ],
    pagamentos: ['CASH', 'PIX', 'CREDIT_CARD', 'MEAL_VOUCHER_VR'],
  },
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

type Estabelecimento = (typeof ESTABELECIMENTOS)[number]

/**
 * Configurações de demonstração.
 *
 * A Lanchonete do Zé abre à noite e atravessa a meia-noite — 18:00 às 02:00 —
 * porque é o caso real que mais quebra implementação de horário, e ter isso no
 * seed permite conferir à mão que o cálculo de aberto/fechado acerta.
 */
async function semearConfiguracoes(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tenantId: string,
  estabelecimento: Estabelecimento,
): Promise<void> {
  await tx
    .insert(tenantSettings)
    .values({
      tenantId,
      description: estabelecimento.descricao,
      whatsappPhone: estabelecimento.whatsapp,
      minimumOrderInCents: estabelecimento.pedidoMinimoEmCentavos,
      prepTimeMinMinutes: 20,
      prepTimeMaxMinutes: 40,
    })
    .onConflictDoNothing({ target: tenantSettings.tenantId })

  await tx
    .insert(deliverySettings)
    .values({
      tenantId,
      deliveryEnabled: true,
      pickupEnabled: true,
      feeMode: estabelecimento.modoDeTaxa,
      fixedFeeInCents: estabelecimento.taxaFixaEmCentavos,
      estimatedMinMinutes: 30,
      estimatedMaxMinutes: 60,
    })
    .onConflictDoNothing({ target: deliverySettings.tenantId })

  const jaTemHorario = await tx.select({ id: businessHours.id }).from(businessHours).limit(1)
  if (jaTemHorario.length === 0) {
    await tx.insert(businessHours).values(
      estabelecimento.horarios.map((h) => ({
        tenantId,
        dayOfWeek: h.dia,
        opensAt: h.abre,
        closesAt: h.fecha,
      })),
    )
  }

  if (estabelecimento.regioes.length > 0) {
    const jaTemRegiao = await tx.select({ id: deliveryRegions.id }).from(deliveryRegions).limit(1)
    if (jaTemRegiao.length === 0) {
      await tx.insert(deliveryRegions).values(
        estabelecimento.regioes.map((r, indice) => ({
          tenantId,
          name: r.nome,
          feeInCents: r.taxaEmCentavos,
          sortOrder: indice * 10,
        })),
      )
    }
  }

  for (const [indice, code] of estabelecimento.pagamentos.entries()) {
    const [forma] = await tx
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(eq(paymentMethods.code, code))
      .limit(1)
    if (!forma) throw new Error(`forma de pagamento ${code} não encontrada`)

    await tx
      .insert(tenantPaymentMethods)
      .values({
        tenantId,
        paymentMethodId: forma.id,
        isEnabled: true,
        sortOrder: indice * 10,
      })
      .onConflictDoNothing()
  }
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

    const [papelDono] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.code, 'OWNER'))
      .limit(1)
    if (!papelDono) throw new Error('papel OWNER não encontrado — rode o seed de RBAC antes')

    const passwordHash = await hashPassword(SENHA_DEMO)

    // Tudo dentro do contexto do tenant: é o WITH CHECK das policies que exige
    // isso, e é também como o código de produção vai escrever.
    await withTenant(tenantContextFromUser(tenant.id), async (tx) => {
      await tx.insert(subscriptions).values({ tenantId: tenant.id, planId }).onConflictDoNothing()

      await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          name: estabelecimento.dono.nome,
          email: estabelecimento.dono.email,
          passwordHash,
        })
        .onConflictDoNothing({ target: [users.tenantId, users.email] })

      const [usuario] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, estabelecimento.dono.email))
        .limit(1)
      if (!usuario) throw new Error(`usuário ${estabelecimento.dono.email} não foi criado`)

      await tx
        .insert(userRoles)
        .values({ tenantId: tenant.id, userId: usuario.id, roleId: papelDono.id })
        .onConflictDoNothing()

      await semearConfiguracoes(tx, tenant.id, estabelecimento)
    })

    infraLogger.info(
      {
        slug: estabelecimento.slug,
        plano: estabelecimento.plano,
        login: estabelecimento.dono.email,
      },
      'estabelecimento semeado',
    )
  }
}

try {
  await seedRbac()
  await seedPaymentMethods()
  const idsDosPlanos = await semearPlanos()
  await semearEstabelecimentos(idsDosPlanos)
  infraLogger.info({ senha: SENHA_DEMO }, 'seed concluído — todos os usuários usam esta senha')
} catch (error) {
  infraLogger.fatal({ err: error }, 'falha no seed')
  await closeDatabase()
  process.exit(1)
}

await closeDatabase()
