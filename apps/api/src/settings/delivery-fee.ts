/**
 * Resolve a taxa de entrega de um pedido.
 *
 * Como o módulo de horários, não conhece banco nem framework — recebe a
 * configuração e devolve o resultado. Quem vai chamá-lo de verdade é o cálculo
 * de pedido na Fase 11, que **recalcula tudo no servidor**: a taxa que o
 * frontend mostrou é informativa, e nunca entra na conta.
 */

export type ModoDeTaxa = 'FIXED' | 'BY_REGION'

export interface ConfiguracaoDeEntrega {
  deliveryEnabled: boolean
  pickupEnabled: boolean
  feeMode: ModoDeTaxa
  fixedFeeInCents: number
}

export interface RegiaoDeEntrega {
  id: string
  name: string
  feeInCents: number
  isActive: boolean
}

/**
 * Se há ao menos um jeito de o pedido chegar ao cliente: retirada, ou entrega
 * que funcione. Entrega por região sem nenhuma região ativa não entrega em
 * lugar nenhum.
 *
 * Um estabelecimento novo nasce com as duas desligadas. Enquanto for assim, o
 * cardápio não recebe pedidos — o checkout não teria o que oferecer.
 */
export function temComoReceber(
  configuracao: Pick<ConfiguracaoDeEntrega, 'deliveryEnabled' | 'pickupEnabled' | 'feeMode'>,
  regioesAtivas: number,
): boolean {
  const entregaFunciona =
    configuracao.deliveryEnabled && (configuracao.feeMode === 'FIXED' || regioesAtivas > 0)
  return entregaFunciona || configuracao.pickupEnabled
}

export type TipoDeEntrega = 'DELIVERY' | 'PICKUP'

export type ResultadoDaTaxa =
  | { ok: true; feeInCents: number }
  | {
      ok: false
      motivo:
        'ENTREGA_INDISPONIVEL' | 'RETIRADA_INDISPONIVEL' | 'REGIAO_OBRIGATORIA' | 'REGIAO_INVALIDA'
    }

export interface EntradaDaTaxa {
  configuracao: ConfiguracaoDeEntrega
  regioes: readonly RegiaoDeEntrega[]
  tipo: TipoDeEntrega
  /** Obrigatório quando o modo é `BY_REGION` e o tipo é `DELIVERY`. */
  regionId?: string | undefined
}

export function resolverTaxaDeEntrega(entrada: EntradaDaTaxa): ResultadoDaTaxa {
  const { configuracao, regioes, tipo, regionId } = entrada

  if (tipo === 'PICKUP') {
    if (!configuracao.pickupEnabled) return { ok: false, motivo: 'RETIRADA_INDISPONIVEL' }
    // Retirar no balcão não tem taxa de entrega — não há entrega.
    return { ok: true, feeInCents: 0 }
  }

  if (!configuracao.deliveryEnabled) return { ok: false, motivo: 'ENTREGA_INDISPONIVEL' }

  if (configuracao.feeMode === 'FIXED') {
    return { ok: true, feeInCents: configuracao.fixedFeeInCents }
  }

  if (!regionId) return { ok: false, motivo: 'REGIAO_OBRIGATORIA' }

  const regiao = regioes.find((r) => r.id === regionId && r.isActive)

  // Região inativa é tratada como inexistente: desativar uma região precisa
  // impedir pedidos novos para ela, e não apenas escondê-la da lista.
  if (!regiao) return { ok: false, motivo: 'REGIAO_INVALIDA' }

  return { ok: true, feeInCents: regiao.feeInCents }
}

/** O pedido atinge o mínimo exigido? Zero significa sem mínimo. */
export function atingePedidoMinimo(subtotalInCents: number, minimoInCents: number): boolean {
  return subtotalInCents >= minimoInCents
}
