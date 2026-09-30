/**
 * Os limites do plano, sem banco nem framework.
 *
 * **Pedidos por mês** (decisão do Junio): o painel avisa a partir de 80% do
 * limite; atingido o limite, ainda há uma **tolerância de 10%**, e só passada
 * ela o estabelecimento para de receber pedidos. Pedido cancelado conta —
 * cancelar não devolve a vaga, senão bastaria cancelar para nunca chegar ao
 * limite. O mês é o do calendário, no fuso do estabelecimento.
 *
 * **Usuários**: limite exato, sem tolerância — é o dono que cria usuário, e
 * ele pode desativar um para abrir vaga. Só usuário ativo conta.
 *
 * `null` é ilimitado. Recurso desligado no plano (`isEnabled = false`) vale
 * como limite zero.
 */

export const RECURSO_PEDIDOS_POR_MES = 'maxOrdersPerMonth'
export const RECURSO_USUARIOS = 'maxUsers'

export const TOLERANCIA_DE_PEDIDOS = 0.1
export const AVISO_A_PARTIR_DE = 0.8

export type SituacaoDosPedidos = 'LIVRE' | 'PERTO_DO_LIMITE' | 'NA_TOLERANCIA' | 'BLOQUEADO'

export interface UsoDePedidos {
  usados: number
  /** `null`: ilimitado. */
  limite: number | null
  /** Limite mais a tolerância: a partir daqui, bloqueia. */
  teto: number | null
  situacao: SituacaoDosPedidos
}

export function situacaoDosPedidos(usados: number, limite: number | null): UsoDePedidos {
  if (limite === null) return { usados, limite, teto: null, situacao: 'LIVRE' }

  const teto = limite + Math.ceil(limite * TOLERANCIA_DE_PEDIDOS)
  const situacao: SituacaoDosPedidos =
    usados >= teto
      ? 'BLOQUEADO'
      : usados >= limite
        ? 'NA_TOLERANCIA'
        : usados >= Math.ceil(limite * AVISO_A_PARTIR_DE)
          ? 'PERTO_DO_LIMITE'
          : 'LIVRE'
  return { usados, limite, teto, situacao }
}

export function cabeMaisUmUsuario(ativos: number, limite: number | null): boolean {
  return limite === null || ativos < limite
}

/**
 * Quantos milissegundos o relógio local do fuso está à frente do UTC naquele
 * instante (negativo a oeste: `-3 h` em São Paulo). Calculado pelo `Intl`,
 * nunca por aritmética de offset fixo — o fuso pode ter horário de verão.
 */
function deslocamento(instante: Date, timezone: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instante)
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value)
  const comoSeFosseUtc = Date.UTC(
    valor('year'),
    valor('month') - 1,
    valor('day'),
    valor('hour'),
    valor('minute'),
    valor('second'),
  )
  return comoSeFosseUtc - Math.floor(instante.getTime() / 1000) * 1000
}

/** O instante em que o mês corrente começou, no fuso do estabelecimento. */
export function inicioDoMes(agora: Date, timezone: string): Date {
  const local = new Date(agora.getTime() + deslocamento(agora, timezone))
  const meiaNoiteDoDiaUm = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1)
  // O deslocamento no dia 1 pode ser outro (horário de verão): recalcula nele.
  const aproximado = meiaNoiteDoDiaUm - deslocamento(agora, timezone)
  return new Date(meiaNoiteDoDiaUm - deslocamento(new Date(aproximado), timezone))
}
