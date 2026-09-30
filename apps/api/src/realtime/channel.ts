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

/**
 * O usuário foi desativado ou teve o papel alterado: as conexões dele fecham
 * na hora, e o painel se autentica de novo — recusado se desativado, com as
 * permissões novas se o papel mudou.
 */
export interface EventoDeUsuario {
  tipo: 'USUARIO_ALTERADO'
  tenantId: string
  userId: string
}

export type EventoDoCanal = EventoDePedido | EventoDeUsuario

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

interface Assinatura {
  userId: string
  entregar: (mensagem: MensagemAoPainel) => void
  encerrar: () => void
}

export class CanalDePedidos {
  private readonly assinaturas = new Map<string, Set<Assinatura>>()

  /**
   * Assina os eventos de um tenant, em nome de um usuário. Devolve a função
   * que cancela a assinatura.
   */
  assinar(
    tenantId: string,
    userId: string,
    entregar: Assinatura['entregar'],
    encerrar: Assinatura['encerrar'] = () => undefined,
  ): () => void {
    const assinatura: Assinatura = { userId, entregar, encerrar }
    const doTenant = this.assinaturas.get(tenantId) ?? new Set<Assinatura>()
    doTenant.add(assinatura)
    this.assinaturas.set(tenantId, doTenant)

    return () => {
      doTenant.delete(assinatura)
      if (doTenant.size === 0) this.assinaturas.delete(tenantId)
    }
  }

  publicar(evento: EventoDoCanal): void {
    const doTenant = [...(this.assinaturas.get(evento.tenantId) ?? [])]

    if (evento.tipo === 'USUARIO_ALTERADO') {
      for (const assinatura of doTenant.filter((a) => a.userId === evento.userId)) {
        assinatura.encerrar()
      }
      return
    }

    const mensagem = mensagemAoPainel(evento)
    for (const assinatura of doTenant) {
      // Uma conexão com problema não impede as outras de receber.
      try {
        assinatura.entregar(mensagem)
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
