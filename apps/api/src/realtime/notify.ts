import { sql } from 'drizzle-orm'
import pg from 'pg'

import type { TenantTransaction } from '../tenant/with-tenant.js'
import type { EventoDePedido } from './channel.js'

/**
 * Eventos de pedido pelo `LISTEN`/`NOTIFY` do PostgreSQL.
 *
 * **O aviso sai de dentro da transação do pedido**, e o PostgreSQL só o
 * entrega **depois do commit**. Um pedido que volta no rollback nunca vira
 * alerta no painel, e o alerta nunca chega antes de o pedido existir para
 * quem for buscá-lo.
 *
 * Funciona com mais de uma instância da API: cada uma escuta o mesmo canal e
 * entrega às suas próprias conexões.
 *
 * O aviso leva só ids — nenhum dado pessoal. O painel busca o pedido pela API
 * REST, que confere permissão e isolamento.
 */

export const CANAL = 'pedidos'

export async function avisarPedido(tx: TenantTransaction, evento: EventoDePedido): Promise<void> {
  await tx.execute(sql`select pg_notify(${CANAL}, ${JSON.stringify(evento)})`)
}

function lerEvento(texto: string | undefined): EventoDePedido | null {
  if (!texto) return null
  try {
    const dado = JSON.parse(texto) as Partial<EventoDePedido>
    if (typeof dado.tenantId !== 'string' || typeof dado.pedidoId !== 'string') return null
    if (dado.tipo !== 'PEDIDO_CRIADO' && dado.tipo !== 'STATUS_MUDOU') return null
    return dado as EventoDePedido
  } catch {
    return null
  }
}

export interface Ouvinte {
  /** Resolve quando o `LISTEN` está ativo pela primeira vez. */
  pronto: Promise<void>
  parar: () => Promise<void>
}

interface Registro {
  info: (dados: object, mensagem: string) => void
  error: (dados: object, mensagem: string) => void
}

/**
 * Escuta o canal numa conexão própria — `LISTEN` prende a conexão, então ela
 * não pode vir do pool. Se a conexão cair, reconecta com espera crescente
 * (1 s, 2 s, 4 s… até 30 s). Avisos emitidos enquanto estava fora se perdem;
 * o painel recarrega a lista a cada minuto e ao reconectar.
 */
export function ouvirPedidos(
  connectionString: string,
  aoReceber: (evento: EventoDePedido) => void,
  log: Registro,
): Ouvinte {
  let cliente: pg.Client | null = null
  let parado = false
  let espera = 1000
  let agendado: NodeJS.Timeout | null = null
  let avisarPronto: () => void = () => undefined
  const pronto = new Promise<void>((resolve) => {
    avisarPronto = resolve
  })

  const conectar = async () => {
    const novo = new pg.Client({ connectionString })
    cliente = novo

    const recomecar = () => {
      if (parado || cliente !== novo) return
      cliente = null
      novo.removeAllListeners()
      void novo.end().catch(() => undefined)
      log.error({ esperaMs: espera }, 'conexão de eventos de pedido caiu; reconectando')
      agendado = setTimeout(() => void conectar(), espera)
      espera = Math.min(espera * 2, 30_000)
    }

    novo.on('error', recomecar)
    novo.on('end', recomecar)
    novo.on('notification', (mensagem) => {
      const evento = lerEvento(mensagem.payload)
      if (evento) aoReceber(evento)
    })

    try {
      await novo.connect()
      await novo.query(`LISTEN ${CANAL}`)
      espera = 1000
      log.info({ canal: CANAL }, 'escutando eventos de pedido')
      avisarPronto()
    } catch (error) {
      log.error({ err: error }, 'não foi possível escutar eventos de pedido')
      recomecar()
    }
  }

  void conectar()

  return {
    pronto,
    parar: async () => {
      parado = true
      if (agendado) clearTimeout(agendado)
      const atual = cliente
      cliente = null
      if (atual) {
        atual.removeAllListeners()
        await atual.end().catch(() => undefined)
      }
    },
  }
}
