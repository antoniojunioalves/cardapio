import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import {
  customerAddresses,
  customers,
  type Customer,
  type CustomerAddress,
} from '../db/schema/index.js'
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

export async function inserirCliente(
  tx: TenantTransaction,
  dados: { tenantId: string; phone: string; name: string },
): Promise<Customer> {
  const [cliente] = await tx.insert(customers).values(dados).returning()
  if (!cliente) throw new Error('cliente não foi criado')
  return cliente
}

/**
 * Um endereço salvo, **só se for deste cliente**.
 *
 * O id vem do navegador. Sem conferir o dono, bastaria um id de endereço para
 * pedir em nome do endereço de outra pessoa — o RLS só garante que é do mesmo
 * estabelecimento.
 */
export async function buscarEnderecoDoCliente(
  tx: TenantTransaction,
  customerId: string,
  addressId: string,
): Promise<CustomerAddress | null> {
  const [endereco] = await tx
    .select()
    .from(customerAddresses)
    .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId)))
    .limit(1)
  return endereco ?? null
}

export interface DadosDeEndereco {
  postalCode: string
  street: string
  number: string
  complement: string | null
  neighborhood: string
  city: string | null
  reference: string | null
}

/**
 * Guarda o endereço informado no pedido, ou reaproveita um igual já salvo —
 * mesmo CEP, rua, número e complemento. Sem isso, cada pedido para casa
 * criaria mais uma linha idêntica na lista do cliente.
 */
export async function salvarEnderecoUsado(
  tx: TenantTransaction,
  tenantId: string,
  customerId: string,
  endereco: DadosDeEndereco,
): Promise<CustomerAddress> {
  const [igual] = await tx
    .select()
    .from(customerAddresses)
    .where(
      and(
        eq(customerAddresses.customerId, customerId),
        eq(customerAddresses.postalCode, endereco.postalCode),
        eq(customerAddresses.street, endereco.street),
        eq(customerAddresses.number, endereco.number),
        endereco.complement === null
          ? isNull(customerAddresses.complement)
          : eq(customerAddresses.complement, endereco.complement),
      ),
    )
    .limit(1)

  if (igual) {
    await marcarEnderecoUsado(tx, igual.id)
    return igual
  }

  const [novo] = await tx
    .insert(customerAddresses)
    .values({ tenantId, customerId, ...endereco })
    .returning()
  if (!novo) throw new Error('endereço não foi criado')
  return novo
}

/** O endereço usado agora passa a ser o primeiro da lista na próxima identificação. */
export async function marcarEnderecoUsado(tx: TenantTransaction, addressId: string): Promise<void> {
  await tx
    .update(customerAddresses)
    .set({ lastUsedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(customerAddresses.id, addressId))
}
