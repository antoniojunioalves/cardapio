/**
 * Horário de funcionamento: as regras de uma grade semanal, iguais na tela
 * que a edita e na API que a grava.
 *
 * Um intervalo cujo fechamento é menor que a abertura **atravessa a
 * meia-noite**: `18:00` às `02:00` é uma noite só, e é válido.
 */

export interface IntervaloDeHorario {
  /** 0 = domingo, 6 = sábado. */
  dayOfWeek: number
  /** `HH:MM` ou `HH:MM:SS`. */
  opensAt: string
  closesAt: string
}

/** `HH:MM` ou `HH:MM:SS`. */
export const HORA_DO_DIA = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

/** O que uma grade pode ter, somando os sete dias. */
export const MAXIMO_DE_INTERVALOS = 50

/** `'18:30'` e `'18:30:00'` viram 1110. */
export function minutosDoDia(hora: string): number {
  const [h = '0', m = '0'] = hora.split(':')
  return Number(h) * 60 + Number(m)
}

export type ProblemaDoIntervalo = 'HORA_INVALIDA' | 'ABRE_E_FECHA_IGUAIS' | 'SOBREPOSTO'

export const MENSAGEM_DO_INTERVALO: Record<ProblemaDoIntervalo, string> = {
  HORA_INVALIDA: 'Informe a hora de abrir e a de fechar.',
  ABRE_E_FECHA_IGUAIS:
    'Abrir e fechar não podem ser na mesma hora. Para o dia inteiro, use 00:00 às 23:59.',
  SOBREPOSTO: 'Este horário se sobrepõe a outro do mesmo dia.',
}

/**
 * O problema de cada intervalo, na ordem da lista; `null` onde não há.
 *
 * A sobreposição só é conferida entre intervalos do mesmo dia que **não**
 * atravessam a meia-noite. Comparar um `18:00–02:00` com os do dia seguinte
 * exigiria pôr a semana inteira numa linha do tempo, e o ganho não paga a
 * complexidade num formulário que o lojista revisa na tela. O marcado é o
 * intervalo que começa dentro do anterior.
 */
export function problemasDosHorarios(
  intervalos: readonly IntervaloDeHorario[],
): (ProblemaDoIntervalo | null)[] {
  const problemas: (ProblemaDoIntervalo | null)[] = intervalos.map((intervalo) => {
    if (!HORA_DO_DIA.test(intervalo.opensAt) || !HORA_DO_DIA.test(intervalo.closesAt)) {
      return 'HORA_INVALIDA'
    }
    return minutosDoDia(intervalo.opensAt) === minutosDoDia(intervalo.closesAt)
      ? 'ABRE_E_FECHA_IGUAIS'
      : null
  })

  for (let dia = 0; dia <= 6; dia += 1) {
    const doDia = intervalos
      .map((intervalo, indice) => ({ intervalo, indice }))
      .filter(({ intervalo, indice }) => intervalo.dayOfWeek === dia && problemas[indice] === null)
      .map(({ intervalo, indice }) => ({
        indice,
        abre: minutosDoDia(intervalo.opensAt),
        fecha: minutosDoDia(intervalo.closesAt),
      }))
      .filter(({ abre, fecha }) => fecha > abre)
      .sort((a, b) => a.abre - b.abre)

    let fimDoAnterior = -1
    for (const atual of doDia) {
      if (atual.abre < fimDoAnterior) problemas[atual.indice] = 'SOBREPOSTO'
      fimDoAnterior = Math.max(fimDoAnterior, atual.fecha)
    }
  }

  return problemas
}
