import { asc, eq, sql } from 'drizzle-orm'

import {
  businessHours,
  deliveryRegions,
  deliverySettings,
  paymentMethods,
  tenantPaymentMethods,
  tenantSettings,
  type BusinessHour,
  type DeliveryRegion,
  type DeliverySettings,
  type TenantSettings,
} from '../db/schema/index.js'
import type { TenantContext } from '../tenant/context.js'
import type { TenantTransaction } from '../tenant/with-tenant.js'

/**
 * Acesso a dados das configurações. Toda função recebe a transação já com o
 * contexto de tenant aplicado — nenhuma abre a sua própria, e nenhuma filtra
 * por tenant à mão: quem filtra é o RLS.
 */

/**
 * Devolve as configurações, criando a linha com os padrões se ainda não
 * existir.
 *
 * Criar sob demanda evita espalhar tratamento de "ainda não configurou" por
 * toda leitura, e evita depender de um gatilho na criação do tenant que
 * ninguém lembra de manter. É idempotente.
 */
export async function ensureSettings(
  tx: TenantTransaction,
  context: TenantContext,
): Promise<TenantSettings> {
  await tx
    .insert(tenantSettings)
    .values({ tenantId: context.tenantId })
    .onConflictDoNothing({ target: tenantSettings.tenantId })

  const [registro] = await tx.select().from(tenantSettings).limit(1)
  if (!registro) throw new Error('configurações do estabelecimento não puderam ser criadas')

  return registro
}

/**
 * Como `Partial<T>`, mas admitindo `undefined` como valor explícito.
 *
 * Com `exactOptionalPropertyTypes`, `Partial<T>` distingue "chave ausente" de
 * "chave presente valendo undefined" — e o Zod produz a segunda forma ao
 * validar um corpo com campos opcionais. Sem este tipo, todo handler
 * precisaria limpar o objeto antes de repassar.
 */
type Patch<T> = { [K in keyof T]?: T[K] | undefined }

export type SettingsPatch = Patch<
  Omit<TenantSettings, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>
>

export async function updateSettings(
  tx: TenantTransaction,
  context: TenantContext,
  patch: SettingsPatch,
): Promise<TenantSettings> {
  await ensureSettings(tx, context)

  const [atualizado] = await tx
    .update(tenantSettings)
    .set({ ...patch, updatedAt: new Date() })
    .returning()

  if (!atualizado) throw new Error('falha ao atualizar as configurações')
  return atualizado
}

export async function listBusinessHours(tx: TenantTransaction): Promise<BusinessHour[]> {
  return tx
    .select()
    .from(businessHours)
    .orderBy(asc(businessHours.dayOfWeek), asc(businessHours.opensAt))
}

export interface IntervaloDeEntrada {
  dayOfWeek: number
  opensAt: string
  closesAt: string
}

/**
 * Substitui a semana inteira.
 *
 * Substituição em vez de CRUD por intervalo porque é assim que um horário de
 * funcionamento é editado de verdade: abre-se a grade da semana, mexe-se em
 * várias linhas e salva-se uma vez. Um PATCH por intervalo exigiria da
 * interface um controle de ids que não traz benefício nenhum aqui.
 *
 * Roda dentro da transação de quem chama, então apagar e reinserir nunca
 * deixa o estabelecimento sem horário para um cliente que consulte no meio.
 */
export async function replaceBusinessHours(
  tx: TenantTransaction,
  context: TenantContext,
  intervalos: readonly IntervaloDeEntrada[],
): Promise<BusinessHour[]> {
  await tx.delete(businessHours)

  if (intervalos.length > 0) {
    await tx
      .insert(businessHours)
      .values(intervalos.map((i) => ({ ...i, tenantId: context.tenantId })))
  }

  return listBusinessHours(tx)
}

export async function ensureDeliverySettings(
  tx: TenantTransaction,
  context: TenantContext,
): Promise<DeliverySettings> {
  await tx
    .insert(deliverySettings)
    .values({ tenantId: context.tenantId })
    .onConflictDoNothing({ target: deliverySettings.tenantId })

  const [registro] = await tx.select().from(deliverySettings).limit(1)
  if (!registro) throw new Error('configurações de entrega não puderam ser criadas')

  return registro
}

export type DeliveryPatch = Patch<
  Omit<DeliverySettings, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>
>

export async function updateDeliverySettings(
  tx: TenantTransaction,
  patch: DeliveryPatch,
): Promise<DeliverySettings> {
  const [atualizado] = await tx
    .update(deliverySettings)
    .set({ ...patch, updatedAt: new Date() })
    .returning()

  if (!atualizado) throw new Error('falha ao atualizar as configurações de entrega')
  return atualizado
}

export async function listDeliveryRegions(tx: TenantTransaction): Promise<DeliveryRegion[]> {
  return tx
    .select()
    .from(deliveryRegions)
    .orderBy(asc(deliveryRegions.sortOrder), asc(deliveryRegions.name))
}

export interface RegiaoDeEntrada {
  name: string
  feeInCents: number
  isActive: boolean
  sortOrder: number
}

export async function replaceDeliveryRegions(
  tx: TenantTransaction,
  context: TenantContext,
  regioes: readonly RegiaoDeEntrada[],
): Promise<DeliveryRegion[]> {
  await tx.delete(deliveryRegions)

  if (regioes.length > 0) {
    await tx
      .insert(deliveryRegions)
      .values(regioes.map((r) => ({ ...r, tenantId: context.tenantId })))
  }

  return listDeliveryRegions(tx)
}

export interface FormaDePagamentoDoTenant {
  id: string
  code: string
  name: string
  kind: string
  isEnabled: boolean
  sortOrder: number
}

/**
 * O catálogo global cruzado com o que este estabelecimento habilitou.
 *
 * O `leftJoin` não precisa de filtro por tenant: as linhas de
 * `tenant_payment_methods` de outros estabelecimentos são invisíveis para esta
 * conexão, então o join só encontra as próprias.
 */
export async function listPaymentMethods(
  tx: TenantTransaction,
): Promise<FormaDePagamentoDoTenant[]> {
  return tx
    .select({
      id: paymentMethods.id,
      code: paymentMethods.code,
      name: paymentMethods.name,
      kind: sql<string>`${paymentMethods.kind}`,
      isEnabled: sql<boolean>`coalesce(${tenantPaymentMethods.isEnabled}, false)`,
      sortOrder: sql<number>`coalesce(${tenantPaymentMethods.sortOrder}, ${paymentMethods.sortOrder})`,
    })
    .from(paymentMethods)
    .leftJoin(tenantPaymentMethods, eq(tenantPaymentMethods.paymentMethodId, paymentMethods.id))
    .where(eq(paymentMethods.isActive, true))
    .orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.name))
}

export interface FormaDePagamentoDeEntrada {
  paymentMethodId: string
  isEnabled: boolean
  sortOrder: number
}

export async function setPaymentMethods(
  tx: TenantTransaction,
  context: TenantContext,
  formas: readonly FormaDePagamentoDeEntrada[],
): Promise<FormaDePagamentoDoTenant[]> {
  for (const forma of formas) {
    await tx
      .insert(tenantPaymentMethods)
      .values({ ...forma, tenantId: context.tenantId })
      .onConflictDoUpdate({
        target: [tenantPaymentMethods.tenantId, tenantPaymentMethods.paymentMethodId],
        set: {
          isEnabled: forma.isEnabled,
          sortOrder: forma.sortOrder,
          updatedAt: new Date(),
        },
      })
  }

  return listPaymentMethods(tx)
}
