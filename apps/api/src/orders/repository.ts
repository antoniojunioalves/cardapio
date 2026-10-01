import { and, asc, desc, eq, gte, inArray, lt, or, sql, type SQL } from 'drizzle-orm'

import {
  orderCounters,
  orderItemOptions,
  orderItems,
  orders,
  type NewOrder,
  type Order,
  type OrderItem,
  type OrderItemOption,
  type OrderStatus,
} from '../db/schema/index.js'
import type { TenantTransaction } from '../tenant/with-tenant.js'

/**
 * Acesso a dados de pedidos. Recebe a transação já aberta no contexto do
 * tenant — o filtro por estabelecimento é do RLS.
 */

/**
 * O próximo número de pedido do estabelecimento.
 *
 * O `ON CONFLICT DO UPDATE` trava a linha do contador até o fim da transação:
 * dois pedidos simultâneos esperam um pelo outro e nunca recebem o mesmo
 * número. Se o pedido falhar, o rollback devolve o número.
 */
export async function proximoNumero(tx: TenantTransaction, tenantId: string): Promise<number> {
  const [linha] = await tx
    .insert(orderCounters)
    .values({ tenantId, lastNumber: 1 })
    .onConflictDoUpdate({
      target: orderCounters.tenantId,
      set: { lastNumber: sql`${orderCounters.lastNumber} + 1` },
    })
    .returning({ numero: orderCounters.lastNumber })
  if (!linha) throw new Error('contador de pedidos não respondeu')
  return linha.numero
}

export async function buscarPorIdempotencia(
  tx: TenantTransaction,
  chave: string,
): Promise<Order | null> {
  const [pedido] = await tx.select().from(orders).where(eq(orders.idempotencyKey, chave)).limit(1)
  return pedido ?? null
}

export async function buscarPedido(tx: TenantTransaction, id: string): Promise<Order | null> {
  const [pedido] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1)
  return pedido ?? null
}

export async function inserirPedido(tx: TenantTransaction, dados: NewOrder): Promise<Order> {
  const [pedido] = await tx.insert(orders).values(dados).returning()
  if (!pedido) throw new Error('pedido não foi criado')
  return pedido
}

export interface ItemParaGravar {
  productId: string
  productName: string
  productType: 'SIMPLE' | 'COMBO'
  unitPriceInCents: number
  quantity: number
  totalInCents: number
  notes: string | null
  comboComponents: { name: string; quantity: number }[] | null
  opcoes: { groupName: string; optionName: string; priceDeltaInCents: number }[]
}

export async function inserirItens(
  tx: TenantTransaction,
  tenantId: string,
  orderId: string,
  itens: readonly ItemParaGravar[],
): Promise<void> {
  for (const [ordem, item] of itens.entries()) {
    const { opcoes, ...dados } = item
    const [gravado] = await tx
      .insert(orderItems)
      .values({ tenantId, orderId, sortOrder: ordem, ...dados })
      .returning({ id: orderItems.id })
    if (!gravado) throw new Error('item do pedido não foi criado')

    if (opcoes.length > 0) {
      await tx
        .insert(orderItemOptions)
        .values(opcoes.map((o, i) => ({ tenantId, orderItemId: gravado.id, sortOrder: i, ...o })))
    }
  }
}

export interface ItemComOpcoes extends OrderItem {
  opcoes: OrderItemOption[]
}

/** Os itens de um ou mais pedidos, com as opções, na ordem em que foram pedidos. */
export async function carregarItens(
  tx: TenantTransaction,
  orderIds: readonly string[],
): Promise<Map<string, ItemComOpcoes[]>> {
  const porPedido = new Map<string, ItemComOpcoes[]>()
  if (orderIds.length === 0) return porPedido

  const itens = await tx
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, [...orderIds]))
    .orderBy(asc(orderItems.sortOrder))
  const opcoes =
    itens.length === 0
      ? []
      : await tx
          .select()
          .from(orderItemOptions)
          .where(
            inArray(
              orderItemOptions.orderItemId,
              itens.map((i) => i.id),
            ),
          )
          .orderBy(asc(orderItemOptions.sortOrder))

  for (const item of itens) {
    const lista = porPedido.get(item.orderId) ?? []
    lista.push({ ...item, opcoes: opcoes.filter((o) => o.orderItemId === item.id) })
    porPedido.set(item.orderId, lista)
  }
  return porPedido
}

export interface FiltroDePedidos {
  status?: OrderStatus | undefined
  /** Paginação: pedidos com número menor que este. */
  antesDoNumero?: number | undefined
  limite: number
}

/** Os pedidos mais recentes primeiro, pelo número. */
export async function listarPedidos(
  tx: TenantTransaction,
  filtro: FiltroDePedidos,
): Promise<Order[]> {
  const condicoes: SQL[] = []
  if (filtro.status) condicoes.push(eq(orders.status, filtro.status))
  if (filtro.antesDoNumero !== undefined) condicoes.push(lt(orders.number, filtro.antesDoNumero))

  return tx
    .select()
    .from(orders)
    .where(condicoes.length > 0 ? and(...condicoes) : undefined)
    .orderBy(desc(orders.number))
    .limit(filtro.limite)
}

/** Aceito e ainda não entregue: o que a cozinha e o entregador têm nas mãos. */
const EM_ANDAMENTO: OrderStatus[] = ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY']

export interface ResumoDosPedidos {
  novos: number
  emAndamento: number
  concluidosHoje: number
}

/**
 * Quantos pedidos esperam ser aceitos, quantos estão em andamento e quantos
 * foram concluídos desde `inicioDoDia`. Uma consulta só, e só sobre os pedidos
 * que podem entrar na conta — o histórico de dias anteriores fica de fora.
 */
export async function resumirPedidos(
  tx: TenantTransaction,
  inicioDoDia: Date,
): Promise<ResumoDosPedidos> {
  const novo = eq(orders.status, 'RECEIVED')
  const emAndamento = inArray(orders.status, EM_ANDAMENTO)
  const concluidoHoje = and(
    eq(orders.status, 'COMPLETED'),
    gte(orders.statusChangedAt, inicioDoDia),
  )

  const [linha] = await tx
    .select({
      novos: sql<number>`count(*) filter (where ${novo})`.mapWith(Number),
      emAndamento: sql<number>`count(*) filter (where ${emAndamento})`.mapWith(Number),
      concluidosHoje: sql<number>`count(*) filter (where ${concluidoHoje})`.mapWith(Number),
    })
    .from(orders)
    .where(or(novo, emAndamento, concluidoHoje))

  return linha ?? { novos: 0, emAndamento: 0, concluidosHoje: 0 }
}

/**
 * Muda o status **só se ele ainda for o esperado**.
 *
 * Duas pessoas no painel podem mexer no mesmo pedido ao mesmo tempo. Com a
 * condição no `WHERE`, a segunda atualização encontra outro status, afeta zero
 * linhas, e o serviço responde conflito — em vez de uma sobrescrever a outra
 * em silêncio.
 */
export async function mudarStatus(
  tx: TenantTransaction,
  id: string,
  de: OrderStatus,
  para: OrderStatus,
  motivo: string | null,
): Promise<Order | null> {
  const [atualizado] = await tx
    .update(orders)
    .set({
      status: para,
      statusChangedAt: sql`now()`,
      updatedAt: sql`now()`,
      ...(para === 'CANCELLED' && { cancellationReason: motivo }),
    })
    .where(and(eq(orders.id, id), eq(orders.status, de)))
    .returning()
  return atualizado ?? null
}
