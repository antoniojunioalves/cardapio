import { desc, eq } from 'drizzle-orm'

import { customerAddresses, customers, type Customer } from '../db/schema/index.js'
import type { TenantTransaction } from '../tenant/with-tenant.js'

/**
 * Consultas de cliente final. Recebem a transação já aberta no contexto do
 * tenant — o filtro por estabelecimento é do RLS.
 */

/** Quantos endereços a identificação mostra: os mais recentes. */
export const ENDERECOS_NA_IDENTIFICACAO = 5

export async function buscarClientePorTelefone(
  tx: TenantTransaction,
  phone: string,
): Promise<Customer | null> {
  const [cliente] = await tx.select().from(customers).where(eq(customers.phone, phone)).limit(1)
  return cliente ?? null
}

export async function listarEnderecosRecentes(tx: TenantTransaction, customerId: string) {
  return tx
    .select({
      id: customerAddresses.id,
      street: customerAddresses.street,
      number: customerAddresses.number,
      neighborhood: customerAddresses.neighborhood,
    })
    .from(customerAddresses)
    .where(eq(customerAddresses.customerId, customerId))
    .orderBy(desc(customerAddresses.lastUsedAt))
    .limit(ENDERECOS_NA_IDENTIFICACAO)
}
