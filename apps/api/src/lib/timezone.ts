/**
 * Limites de tempo no fuso do estabelecimento.
 *
 * "Este mês" e "hoje" são os do relógio do estabelecimento, não os do servidor:
 * um pedido concluído às 22h de São Paulo é de hoje, embora em UTC já seja
 * amanhã.
 */

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

/** A meia-noite, no fuso, do dia que `dia` escolhe a partir da data local de agora. */
function meiaNoiteNoFuso(agora: Date, timezone: string, dia: (local: Date) => number): Date {
  const local = new Date(agora.getTime() + deslocamento(agora, timezone))
  const meiaNoite = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), dia(local))
  // O deslocamento naquela meia-noite pode ser outro (horário de verão): recalcula nela.
  const aproximado = meiaNoite - deslocamento(agora, timezone)
  return new Date(meiaNoite - deslocamento(new Date(aproximado), timezone))
}

/** O instante em que o mês corrente começou, no fuso do estabelecimento. */
export function inicioDoMes(agora: Date, timezone: string): Date {
  return meiaNoiteNoFuso(agora, timezone, () => 1)
}

/** O instante em que o dia de hoje começou, no fuso do estabelecimento. */
export function inicioDoDia(agora: Date, timezone: string): Date {
  return meiaNoiteNoFuso(agora, timezone, (local) => local.getUTCDate())
}
