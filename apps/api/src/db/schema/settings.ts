import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  time,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { currentTenantId, primaryId, timestamps } from './shared.js'
import { tenants } from './tenants.js'

/**
 * Configurações do estabelecimento — uma linha por tenant.
 *
 * É aqui que mora o que `tenants` deliberadamente não guarda. A tabela
 * `tenants` é o registro público, lido sem contexto de tenant para resolver o
 * slug; qualquer dado que não deva ser público vem para cá, onde o RLS
 * protege.
 */
export const tenantSettings = pgTable(
  'tenant_settings',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .unique()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    description: text(),
    /**
     * Chaves no storage, e não URLs. A URL pública é calculada na leitura:
     * gravá-la aqui a congelaria no provider e no domínio de hoje, e trocar o
     * disco local por S3 exigiria reescrever todas as linhas.
     */
    logoKey: varchar({ length: 255 }),
    coverKey: varchar({ length: 255 }),

    /** Número que recebe o pedido. Só dígitos, com DDI e DDD: 5511999999999. */
    whatsappPhone: varchar({ length: 20 }),
    contactPhone: varchar({ length: 20 }),
    contactEmail: varchar({ length: 254 }),

    /** Endereço do próprio estabelecimento — usado na retirada no local. */
    addressStreet: varchar({ length: 160 }),
    addressNumber: varchar({ length: 20 }),
    addressComplement: varchar({ length: 80 }),
    addressNeighborhood: varchar({ length: 80 }),
    addressCity: varchar({ length: 80 }),
    addressState: varchar({ length: 2 }),
    addressPostalCode: varchar({ length: 9 }),

    /** Tempo de preparo anunciado no cardápio, em minutos. */
    prepTimeMinMinutes: integer(),
    prepTimeMaxMinutes: integer(),

    /** Zero significa sem pedido mínimo. Em centavos, como todo valor. */
    minimumOrderInCents: integer().notNull().default(0),

    /**
     * Pausa manual, independente do horário cadastrado.
     *
     * Existe porque a realidade acontece: acabou o gás, a cozinha lotou, o
     * entregador faltou. Sem isso, a única saída seria editar o horário de
     * funcionamento e lembrar de desfazer depois.
     */
    isAcceptingOrders: boolean().notNull().default(true),

    ...timestamps,
  },
  (table) => [
    check('tenant_settings_minimum_order_nao_negativo', sql`${table.minimumOrderInCents} >= 0`),
    check(
      'tenant_settings_prep_time_coerente',
      sql`${table.prepTimeMinMinutes} is null or ${table.prepTimeMaxMinutes} is null
          or ${table.prepTimeMinMinutes} <= ${table.prepTimeMaxMinutes}`,
    ),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
).enableRLS()

/**
 * Horário de funcionamento: um intervalo por linha.
 *
 * Várias linhas no mesmo dia da semana representam vários intervalos — o caso
 * comum de abrir no almoço, fechar à tarde e reabrir à noite. Modelar como
 * "abre/fecha" em colunas únicas na tabela do tenant tornaria isso impossível.
 *
 * **Um intervalo pode atravessar a meia-noite.** Quando `closesAt <= opensAt`,
 * o fechamento é no dia seguinte: 18:00–02:00 é o horário real de boa parte
 * das lanchonetes, e tratar isso como erro de digitação seria ignorar o
 * domínio. A regra vive em `src/settings/opening-hours.ts`, com testes.
 */
export const businessHours = pgTable(
  'business_hours',
  {
    id: primaryId(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    /** 0 = domingo, 6 = sábado. Mesma numeração de `Date.getDay()`. */
    dayOfWeek: integer().notNull(),
    opensAt: time().notNull(),
    closesAt: time().notNull(),

    ...timestamps,
  },
  (table) => [
    check('business_hours_dia_valido', sql`${table.dayOfWeek} between 0 and 6`),
    // Sem isto, `closesAt = opensAt` seria ambíguo entre "vinte e quatro horas"
    // e "intervalo vazio", e a regra de travessia de meia-noite deixaria de ser
    // decidível. Funcionamento ininterrupto se escreve 00:00:00–23:59:59;
    // suporte a 24 horas de verdade está no ROADMAP.
    check('business_hours_intervalo_nao_vazio', sql`${table.closesAt} <> ${table.opensAt}`),
    unique('business_hours_sem_duplicata').on(table.tenantId, table.dayOfWeek, table.opensAt),
    index('business_hours_tenant_idx').on(table.tenantId, table.dayOfWeek),
    pgPolicy('tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: 'public',
      using: sql`${table.tenantId} = ${currentTenantId}`,
      withCheck: sql`${table.tenantId} = ${currentTenantId}`,
    }),
  ],
).enableRLS()

export type TenantSettings = typeof tenantSettings.$inferSelect
export type NewTenantSettings = typeof tenantSettings.$inferInsert
export type BusinessHour = typeof businessHours.$inferSelect
export type NewBusinessHour = typeof businessHours.$inferInsert
