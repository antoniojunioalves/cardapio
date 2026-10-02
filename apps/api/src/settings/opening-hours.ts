/**
 * Decide se um estabelecimento está aberto agora.
 *
 * Módulo sem dependência de banco nem de framework: recebe os intervalos, o
 * fuso e o instante, e devolve o status. É o que permite testá-lo com dezenas
 * de casos de borda em milissegundos, sem subir nada.
 *
 * O backend é a autoridade sobre isto. O frontend mostra "estamos fechados"
 * por cortesia; quem recusa o pedido é o servidor, porque o relógio do
 * navegador do cliente não é confiável.
 */

import { minutosDoDia } from '@repo/shared'

export interface Intervalo {
  /** 0 = domingo, 6 = sábado. */
  dayOfWeek: number
  /** `HH:MM` ou `HH:MM:SS`. */
  opensAt: string
  closesAt: string
}

export interface ProximaAbertura {
  dayOfWeek: number
  opensAt: string
  /** Quantos dias à frente, no calendário local: 0 é hoje, 1 é amanhã. */
  emDias: number
}

export type StatusDoEstabelecimento =
  | { aberto: true; fechaAs: string }
  | {
      aberto: false
      motivo: 'PAUSADO' | 'FORA_DO_HORARIO' | 'SEM_HORARIO_CADASTRADO'
      proximaAbertura?: ProximaAbertura
    }

const MINUTOS_POR_DIA = 24 * 60

/** `'18:30'` e `'18:30:00'` viram 1110. A conta é a mesma que a tela dos horários usa. */
export const paraMinutos = minutosDoDia

interface MomentoLocal {
  dayOfWeek: number
  minutos: number
}

/**
 * Converte um instante para o dia da semana e o minuto do dia **no fuso do
 * estabelecimento**.
 *
 * Usa `Intl` em vez de aritmética com offset porque offset não é constante:
 * horário de verão muda, e fusos mudam por decisão política. Perguntar ao
 * runtime é o que continua correto depois que a regra do país muda.
 */
export function momentoLocal(agora: Date, timezone: string): MomentoLocal {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(agora)

  const valor = (tipo: Intl.DateTimeFormatPartTypes): number => {
    const parte = partes.find((p) => p.type === tipo)
    return parte ? Number(parte.value) : 0
  }

  // Com hour12:false, algumas implementações devolvem 24 para a meia-noite.
  const hora = valor('hour') % 24

  return {
    // Reconstrói a data local em UTC só para extrair o dia da semana — é o que
    // evita depender do fuso da máquina que está rodando o servidor.
    dayOfWeek: new Date(Date.UTC(valor('year'), valor('month') - 1, valor('day'))).getUTCDay(),
    minutos: hora * 60 + valor('minute'),
  }
}

const diaAnterior = (dia: number): number => (dia + 6) % 7

/** Um intervalo cujo fim é menor que o início termina no dia seguinte. */
export function atravessaMeiaNoite(intervalo: Intervalo): boolean {
  return paraMinutos(intervalo.closesAt) < paraMinutos(intervalo.opensAt)
}

function intervaloContem(intervalo: Intervalo, momento: MomentoLocal): boolean {
  const abre = paraMinutos(intervalo.opensAt)
  const fecha = paraMinutos(intervalo.closesAt)

  if (!atravessaMeiaNoite(intervalo)) {
    return (
      intervalo.dayOfWeek === momento.dayOfWeek &&
      momento.minutos >= abre &&
      momento.minutos < fecha
    )
  }

  // 18:00–02:00 vale em dois dias do calendário: da abertura até a meia-noite
  // no dia cadastrado, e da meia-noite até o fechamento no dia seguinte.
  if (intervalo.dayOfWeek === momento.dayOfWeek && momento.minutos >= abre) return true
  return intervalo.dayOfWeek === diaAnterior(momento.dayOfWeek) && momento.minutos < fecha
}

/**
 * A próxima abertura, procurando até uma semana à frente.
 *
 * Serve para a mensagem que o §25 pede: não basta dizer "estamos fechados", o
 * cliente precisa saber quando voltar.
 */
export function proximaAbertura(
  intervalos: readonly Intervalo[],
  momento: MomentoLocal,
): ProximaAbertura | undefined {
  for (let emDias = 0; emDias < 8; emDias += 1) {
    const dia = (momento.dayOfWeek + emDias) % 7

    const candidatos = intervalos
      .filter((i) => i.dayOfWeek === dia)
      .filter((i) => emDias > 0 || paraMinutos(i.opensAt) > momento.minutos)
      .sort((a, b) => paraMinutos(a.opensAt) - paraMinutos(b.opensAt))

    const primeiro = candidatos[0]
    if (primeiro) return { dayOfWeek: dia, opensAt: primeiro.opensAt, emDias }
  }

  return undefined
}

export interface EntradaDeStatus {
  intervalos: readonly Intervalo[]
  timezone: string
  /** A pausa manual do lojista, que vence qualquer horário cadastrado. */
  aceitandoPedidos: boolean
  agora?: Date
}

/**
 * O status do estabelecimento agora.
 *
 * A pausa manual é verificada primeiro: quando o gás acabou, não importa o que
 * o horário diz.
 */
export function statusDoEstabelecimento(entrada: EntradaDeStatus): StatusDoEstabelecimento {
  if (!entrada.aceitandoPedidos) {
    return { aberto: false, motivo: 'PAUSADO' }
  }

  if (entrada.intervalos.length === 0) {
    return { aberto: false, motivo: 'SEM_HORARIO_CADASTRADO' }
  }

  const momento = momentoLocal(entrada.agora ?? new Date(), entrada.timezone)
  const vigente = entrada.intervalos.find((intervalo) => intervaloContem(intervalo, momento))

  if (vigente) return { aberto: true, fechaAs: vigente.closesAt }

  const proxima = proximaAbertura(entrada.intervalos, momento)

  return {
    aberto: false,
    motivo: 'FORA_DO_HORARIO',
    ...(proxima && { proximaAbertura: proxima }),
  }
}

export { MINUTOS_POR_DIA }
