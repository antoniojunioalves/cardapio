import { and, eq, isNull } from 'drizzle-orm'

import { hashPassword } from '../auth/password.js'
import { infraLogger } from '../lib/logger.js'
import { tenantContextFromUser } from '../tenant/context.js'
import { withTenant } from '../tenant/with-tenant.js'
import { closeDatabase, db } from './index.js'
import {
  businessHours,
  categories,
  comboItems,
  customerAddresses,
  customers,
  optionGroups,
  options,
  productOptionGroups,
  products,
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
    clientes: [
      {
        nome: 'Maria Oliveira',
        telefone: '5511987654321',
        enderecos: [
          {
            cep: '01452000',
            rua: 'Rua dos Ipês',
            numero: '450',
            complemento: 'apto 12',
            bairro: 'Jardim Paulista',
            referencia: 'Portão azul',
          },
          {
            cep: '01430001',
            rua: 'Avenida Brasil',
            numero: '1200',
            complemento: null,
            bairro: 'Centro',
            referencia: null,
          },
        ],
      },
    ],
    personalizacao: {
      grupos: [
        {
          nome: 'Adicionais',
          descricao: 'Escolha até 3',
          min: 0,
          max: 3,
          opcoes: [
            ['Bacon', 500],
            ['Cheddar', 400],
            ['Ovo', 200],
          ],
          produtos: ['X-Salada', 'X-Bacon', 'X-Tudo'],
        },
        {
          nome: 'Remover ingredientes',
          descricao: null,
          min: 0,
          max: 3,
          opcoes: [
            ['Sem cebola', 0],
            ['Sem tomate', 0],
            ['Sem alface', 0],
          ],
          produtos: ['X-Salada', 'X-Bacon', 'X-Tudo'],
        },
      ],
      combos: [
        {
          nome: 'Combo X-Salada',
          descricao: 'X-Salada, batata frita e refrigerante lata.',
          preco: 3990,
          itens: [
            ['X-Salada', 1],
            ['Batata frita', 1],
            ['Refrigerante lata', 1],
          ],
        },
      ],
    },
    cardapio: [
      {
        categoria: 'Hambúrgueres',
        produtos: [
          {
            nome: 'X-Salada',
            descricao: 'Pão, hambúrguer 150 g, queijo, alface e tomate.',
            preco: 2590,
          },
          {
            nome: 'X-Bacon',
            descricao: 'Pão, hambúrguer 150 g, queijo e bacon crocante.',
            preco: 2990,
          },
          {
            nome: 'X-Tudo',
            descricao: 'Hambúrguer, bacon, ovo, presunto, queijo e salada.',
            preco: 3490,
          },
        ],
      },
      {
        categoria: 'Porções',
        produtos: [
          { nome: 'Batata frita', descricao: 'Porção de 400 g.', preco: 1500 },
          { nome: 'Onion rings', descricao: 'Anéis de cebola empanados.', preco: 1800 },
        ],
      },
      {
        categoria: 'Bebidas',
        produtos: [
          { nome: 'Refrigerante lata', descricao: '350 ml.', preco: 600 },
          // Esgotado de propósito: o cardápio público precisa saber exibir isso.
          { nome: 'Suco natural', descricao: 'Laranja, 500 ml.', preco: 900, esgotado: true },
        ],
      },
    ],
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
    // O mesmo telefone da cliente da lanchonete, com outro nome e outro
    // endereço: cada estabelecimento tem os seus clientes, sem ligação entre si.
    clientes: [
      {
        nome: 'Maria O.',
        telefone: '5511987654321',
        enderecos: [
          {
            cep: '01504001',
            rua: 'Rua Vergueiro',
            numero: '88',
            complemento: null,
            bairro: 'Vila Nova',
            referencia: null,
          },
        ],
      },
    ],
    personalizacao: {
      grupos: [
        {
          nome: 'Tamanho',
          descricao: null,
          min: 1,
          max: 1,
          // O preço do produto é o da média; a grande só acrescenta.
          opcoes: [
            ['Média', 0],
            ['Grande', 1200],
          ],
          produtos: ['Margherita', 'Calabresa', 'Portuguesa', 'Chocolate'],
        },
        {
          nome: 'Borda',
          descricao: null,
          min: 1,
          max: 1,
          opcoes: [
            ['Tradicional', 0],
            ['Catupiry', 800],
            ['Cheddar', 800],
          ],
          produtos: ['Margherita', 'Calabresa', 'Portuguesa'],
        },
      ],
      combos: [] as { nome: string; descricao: string; preco: number; itens: [string, number][] }[],
    },
    cardapio: [
      {
        categoria: 'Pizzas salgadas',
        produtos: [
          { nome: 'Margherita', descricao: 'Molho de tomate, muçarela e manjericão.', preco: 4500 },
          { nome: 'Calabresa', descricao: 'Calabresa fatiada e cebola.', preco: 4800 },
          {
            nome: 'Portuguesa',
            descricao: 'Presunto, ovo, cebola, azeitona e ervilha.',
            preco: 5200,
          },
        ],
      },
      {
        categoria: 'Pizzas doces',
        produtos: [
          { nome: 'Chocolate', descricao: 'Chocolate ao leite e granulado.', preco: 4200 },
        ],
      },
      {
        categoria: 'Bebidas',
        produtos: [{ nome: 'Refrigerante 2 L', descricao: 'Garrafa.', preco: 1400 }],
      },
    ],
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

/** Idempotente: só semeia se o estabelecimento ainda não tiver nenhuma categoria. */
async function semearCardapio(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tenantId: string,
  estabelecimento: Estabelecimento,
): Promise<void> {
  const jaTem = await tx.select({ id: categories.id }).from(categories).limit(1)
  if (jaTem.length > 0) return

  for (const [indiceCategoria, secao] of estabelecimento.cardapio.entries()) {
    const [categoria] = await tx
      .insert(categories)
      .values({ tenantId, name: secao.categoria, sortOrder: indiceCategoria * 10 })
      .returning({ id: categories.id })
    if (!categoria) throw new Error(`categoria ${secao.categoria} não foi criada`)

    await tx.insert(products).values(
      secao.produtos.map((produto, indice) => ({
        tenantId,
        categoryId: categoria.id,
        name: produto.nome,
        description: produto.descricao,
        priceInCents: produto.preco,
        isAvailable: !('esgotado' in produto && produto.esgotado),
        sortOrder: indice * 10,
      })),
    )
  }
}

/**
 * Grupos de opção e combos. Idempotência própria — só semeia se o
 * estabelecimento ainda não tiver nenhum grupo —, porque o cardápio pode já ter
 * sido semeado numa versão anterior deste script, sem personalização.
 */
async function semearPersonalizacao(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tenantId: string,
  estabelecimento: Estabelecimento,
): Promise<void> {
  const jaTem = await tx.select({ id: optionGroups.id }).from(optionGroups).limit(1)
  if (jaTem.length > 0) return

  const produtosPorNome = new Map(
    (await tx.select({ id: products.id, name: products.name }).from(products)).map((p) => [
      p.name,
      p.id,
    ]),
  )
  const idDe = (nome: string): string => {
    const id = produtosPorNome.get(nome)
    if (!id) throw new Error(`produto ${nome} não encontrado no seed`)
    return id
  }

  const ordemPorProduto = new Map<string, number>()

  for (const definicao of estabelecimento.personalizacao.grupos) {
    const [grupo] = await tx
      .insert(optionGroups)
      .values({
        tenantId,
        name: definicao.nome,
        description: definicao.descricao,
        minSelections: definicao.min,
        maxSelections: definicao.max,
      })
      .returning({ id: optionGroups.id })
    if (!grupo) throw new Error(`grupo ${definicao.nome} não foi criado`)

    await tx.insert(options).values(
      definicao.opcoes.map(([nome, acrescimo], indice) => ({
        tenantId,
        groupId: grupo.id,
        name: nome,
        priceDeltaInCents: acrescimo,
        sortOrder: indice * 10,
      })),
    )

    for (const nomeDoProduto of definicao.produtos) {
      const productId = idDe(nomeDoProduto)
      const ordem = ordemPorProduto.get(productId) ?? 0
      ordemPorProduto.set(productId, ordem + 10)
      await tx
        .insert(productOptionGroups)
        .values({ tenantId, productId, groupId: grupo.id, sortOrder: ordem })
    }
  }

  if (estabelecimento.personalizacao.combos.length === 0) return

  // Combos ficam no topo do cardápio, como é comum nos aplicativos de delivery.
  const [categoriaDeCombos] = await tx
    .insert(categories)
    .values({ tenantId, name: 'Combos', sortOrder: -10 })
    .returning({ id: categories.id })
  if (!categoriaDeCombos) throw new Error('categoria Combos não foi criada')

  for (const [indice, definicao] of estabelecimento.personalizacao.combos.entries()) {
    const [combo] = await tx
      .insert(products)
      .values({
        tenantId,
        categoryId: categoriaDeCombos.id,
        type: 'COMBO',
        name: definicao.nome,
        description: definicao.descricao,
        priceInCents: definicao.preco,
        sortOrder: indice * 10,
      })
      .returning({ id: products.id })
    if (!combo) throw new Error(`combo ${definicao.nome} não foi criado`)

    await tx.insert(comboItems).values(
      definicao.itens.map(([nome, quantidade], ordem) => ({
        tenantId,
        comboProductId: combo.id,
        itemProductId: idDe(nome),
        quantity: quantidade,
        sortOrder: ordem * 10,
      })),
    )
  }
}

/**
 * Clientes de demonstração, para a identificação por telefone no checkout ter
 * quem encontrar. Em uso real o cliente nasce no primeiro pedido (Fase 11).
 */
async function semearClientes(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tenantId: string,
  estabelecimento: Estabelecimento,
): Promise<void> {
  for (const cliente of estabelecimento.clientes) {
    await tx
      .insert(customers)
      .values({ tenantId, name: cliente.nome, phone: cliente.telefone })
      .onConflictDoNothing({ target: [customers.tenantId, customers.phone] })

    const [salvo] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.phone, cliente.telefone))
      .limit(1)
    if (!salvo) throw new Error(`cliente ${cliente.telefone} não foi criado`)

    const jaTem = await tx
      .select({ id: customerAddresses.id })
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, salvo.id))
      .limit(1)
    if (jaTem.length > 0) {
      // Endereços semeados antes de o CEP existir ganham o CEP de demonstração.
      for (const e of cliente.enderecos) {
        await tx
          .update(customerAddresses)
          .set({ postalCode: e.cep })
          .where(
            and(
              eq(customerAddresses.customerId, salvo.id),
              eq(customerAddresses.street, e.rua),
              isNull(customerAddresses.postalCode),
            ),
          )
      }
      continue
    }

    // O primeiro da lista é o mais recente: aparece primeiro no checkout.
    const agora = Date.now()
    await tx.insert(customerAddresses).values(
      cliente.enderecos.map((e, i) => ({
        tenantId,
        customerId: salvo.id,
        postalCode: e.cep,
        street: e.rua,
        number: e.numero,
        complement: e.complemento,
        neighborhood: e.bairro,
        reference: e.referencia,
        lastUsedAt: new Date(agora - i * 86_400_000),
      })),
    )
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
      await semearCardapio(tx, tenant.id, estabelecimento)
      await semearPersonalizacao(tx, tenant.id, estabelecimento)
      await semearClientes(tx, tenant.id, estabelecimento)
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
