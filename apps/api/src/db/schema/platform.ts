import { boolean, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core'

import { primaryId, timestamps } from './shared.js'

/**
 * Administradores da plataforma — o "Super Admin".
 *
 * **Tabela separada de `users`, e não um campo `isSuperAdmin` nela.** O motivo
 * é concreto: um super admin não pertence a estabelecimento nenhum, então em
 * `users` ele precisaria de `tenant_id` nulo. A policy de isolamento compara
 * `tenant_id = current_tenant`, e comparação com NULL é NULL — a linha ficaria
 * invisível para todo mundo, inclusive para ela mesma. Seria um usuário que
 * não consegue nem se autenticar.
 *
 * Entidade com regras de acesso diferentes, tabela diferente. De quebra, fica
 * impossível um usuário de tenant virar super admin por um UPDATE descuidado
 * numa coluna booleana.
 *
 * No MVP existe apenas a estrutura e a autenticação; o painel da plataforma
 * não faz parte do escopo.
 */
export const platformAdmins = pgTable('platform_admins', {
  id: primaryId(),
  name: varchar({ length: 120 }).notNull(),
  email: varchar({ length: 254 }).notNull().unique(),
  passwordHash: varchar({ length: 255 }).notNull(),
  isActive: boolean().notNull().default(true),
  lastLoginAt: timestamp({ withTimezone: true }),
  ...timestamps,
})

export type PlatformAdmin = typeof platformAdmins.$inferSelect
