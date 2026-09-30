/**
 * O canal de eventos de pedido, por estabelecimento. Sem rede nem banco.
 *
 * Cada conexão do painel assina o canal **do seu tenant** — o tenant vem do
 * token, verificado antes de assinar. Um evento é entregue só às assinaturas
 * do tenant dele: não existe caminho para uma conexão receber evento de outro
 * estabelecimento.
 */

export type EventoDePedido =
  | { tipo: 'PEDIDO_CRIADO'; tenantId: string; pedidoId: string; numero: number }
  | {
      tipo: 'STATUS_MUDOU'
      tenantId: string
      pedidoId: string
      numero: number
      status: string
    }

/** O que a conexão recebe: sem `tenantId`, que é interno. */
export type MensagemAoPainel =
  | { type: 'order.created'; orderId: string; number: number }
  | { type: 'order.status_changed'; orderId: string; number: number; status: string }

export function mensagemAoPainel(evento: EventoDePedido): MensagemAoPainel {
  return evento.tipo === 'PEDIDO_CRIADO'
    ? { type: 'order.created', orderId: evento.pedidoId, number: evento.numero }
    : {
        type: 'order.status_changed',
        orderId: evento.pedidoId,
        number: evento.numero,
        status: evento.status,
      }
}

type Entregar = (mensagem: MensagemAoPainel) => void

export class CanalDePedidos {
  private readonly assinaturas = new Map<string, Set<Entregar>>()

  /** Assina os eventos de um tenant. Devolve a função que cancela a assinatura. */
  assinar(tenantId: string, entregar: Entregar): () => void {
    const doTenant = this.assinaturas.get(tenantId) ?? new Set<Entregar>()
    doTenant.add(entregar)
    this.assinaturas.set(tenantId, doTenant)

    return () => {
      doTenant.delete(entregar)
      if (doTenant.size === 0) this.assinaturas.delete(tenantId)
    }
  }

  publicar(evento: EventoDePedido): void {
    const mensagem = mensagemAoPainel(evento)
    for (const entregar of this.assinaturas.get(evento.tenantId) ?? []) {
      // Uma conexão com problema não impede as outras de receber.
      try {
        entregar(mensagem)
      } catch {
        /* a conexão com erro é encerrada pelo próprio socket */
      }
    }
  }

  /** Quantas conexões estão assinando — para o log e os testes. */
  totalDeAssinaturas(): number {
    let total = 0
    for (const doTenant of this.assinaturas.values()) total += doTenant.size
    return total
  }
}
