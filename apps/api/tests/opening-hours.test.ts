import { describe, expect, it } from 'vitest'

import {
  atravessaMeiaNoite,
  momentoLocal,
  paraMinutos,
  proximaAbertura,
  statusDoEstabelecimento,
  type Intervalo,
} from '../src/settings/opening-hours.js'

/**
 * Datas de referência, escolhidas para que o dia da semana seja verificável à
 * mão: 2026-01-01 é uma quinta-feira, então 2026-01-06 é terça (dayOfWeek 2)
 * e 2026-01-07 é quarta (3).
 *
 * São Paulo é UTC-3 e Manaus é UTC-4 — a diferença entre as duas é o que
 * prova que o cálculo usa o fuso do estabelecimento, e não o do servidor.
 */
const SAO_PAULO = 'America/Sao_Paulo'
const MANAUS = 'America/Manaus'

const TERCA = 2
const QUARTA = 3

/** Terça, 20:00 em São Paulo. */
const TERCA_20H = new Date('2026-01-06T23:00:00Z')
/** Quarta, 01:00 em São Paulo — ainda dentro de um turno que começou na terça. */
const QUARTA_01H = new Date('2026-01-07T04:00:00Z')
/** Quarta, 03:00 em São Paulo — depois do fim do turno. */
const QUARTA_03H = new Date('2026-01-07T06:00:00Z')

const noite: Intervalo = { dayOfWeek: TERCA, opensAt: '18:00:00', closesAt: '02:00:00' }
const almoco: Intervalo = { dayOfWeek: TERCA, opensAt: '11:00:00', closesAt: '14:30:00' }
const jantar: Intervalo = { dayOfWeek: TERCA, opensAt: '18:00:00', closesAt: '23:00:00' }

const aberto = (intervalos: Intervalo[], agora: Date, timezone = SAO_PAULO) =>
  statusDoEstabelecimento({ intervalos, timezone, aceitandoPedidos: true, agora })

describe('conversão de horário', () => {
  it('converte HH:MM e HH:MM:SS para minutos', () => {
    expect(paraMinutos('00:00')).toBe(0)
    expect(paraMinutos('18:30')).toBe(1110)
    expect(paraMinutos('18:30:45')).toBe(1110)
    expect(paraMinutos('23:59')).toBe(1439)
  })

  it('reconhece um intervalo que atravessa a meia-noite', () => {
    expect(atravessaMeiaNoite(noite)).toBe(true)
    expect(atravessaMeiaNoite(jantar)).toBe(false)
  })
})

describe('momento local', () => {
  it('usa o fuso do estabelecimento, não o do servidor', () => {
    expect(momentoLocal(TERCA_20H, SAO_PAULO)).toEqual({ dayOfWeek: TERCA, minutos: 20 * 60 })
    // Mesmo instante, uma hora a menos em Manaus.
    expect(momentoLocal(TERCA_20H, MANAUS)).toEqual({ dayOfWeek: TERCA, minutos: 19 * 60 })
  })

  it('vira o dia quando o fuso empurra para além da meia-noite', () => {
    // 2026-01-07T02:00Z é ainda terça 23:00 em São Paulo.
    expect(momentoLocal(new Date('2026-01-07T02:00:00Z'), SAO_PAULO)).toEqual({
      dayOfWeek: TERCA,
      minutos: 23 * 60,
    })
  })

  it('trata a meia-noite como zero, e não como vinte e quatro', () => {
    expect(momentoLocal(new Date('2026-01-07T03:00:00Z'), SAO_PAULO)).toEqual({
      dayOfWeek: QUARTA,
      minutos: 0,
    })
  })
})

describe('intervalo dentro do mesmo dia', () => {
  it('está aberto durante o intervalo', () => {
    expect(aberto([jantar], TERCA_20H)).toEqual({ aberto: true, fechaAs: '23:00:00' })
  })

  it('está fechado antes de abrir', () => {
    // Terça, 16:00 em São Paulo.
    const resultado = aberto([jantar], new Date('2026-01-06T19:00:00Z'))

    expect(resultado).toMatchObject({ aberto: false, motivo: 'FORA_DO_HORARIO' })
  })

  it('abre exatamente no minuto de abertura', () => {
    // Terça, 18:00 em São Paulo.
    expect(aberto([jantar], new Date('2026-01-06T21:00:00Z')).aberto).toBe(true)
  })

  it('já está fechado no minuto do fechamento', () => {
    // Terça, 23:00 em São Paulo — o intervalo é fechado no fim.
    expect(aberto([jantar], new Date('2026-01-07T02:00:00Z')).aberto).toBe(false)
  })
})

describe('intervalo que atravessa a meia-noite', () => {
  it('está aberto à noite, no dia cadastrado', () => {
    expect(aberto([noite], TERCA_20H)).toEqual({ aberto: true, fechaAs: '02:00:00' })
  })

  it('continua aberto na madrugada do dia seguinte', () => {
    // É quarta no calendário, mas o turno é o da terça. Este é o caso que
    // quebra implementações ingênuas de horário.
    expect(aberto([noite], QUARTA_01H)).toEqual({ aberto: true, fechaAs: '02:00:00' })
  })

  it('fecha depois do horário, já na quarta', () => {
    expect(aberto([noite], QUARTA_03H)).toMatchObject({ aberto: false })
  })

  it('não fica aberto na madrugada de um dia sem turno na véspera', () => {
    // Turno cadastrado na quarta; na madrugada de quarta o turno de terça não
    // existe, então tem de estar fechado.
    const turnoDaQuarta: Intervalo = { dayOfWeek: QUARTA, opensAt: '18:00', closesAt: '02:00' }

    expect(aberto([turnoDaQuarta], QUARTA_01H).aberto).toBe(false)
  })
})

describe('vários intervalos no mesmo dia', () => {
  it('fecha entre o almoço e o jantar', () => {
    // Terça, 16:00 em São Paulo — depois do almoço, antes do jantar.
    const resultado = aberto([almoco, jantar], new Date('2026-01-06T19:00:00Z'))

    expect(resultado).toMatchObject({ aberto: false, motivo: 'FORA_DO_HORARIO' })
  })

  it('abre em cada um dos intervalos', () => {
    // Terça, 12:00 e 20:00 em São Paulo.
    expect(aberto([almoco, jantar], new Date('2026-01-06T15:00:00Z')).aberto).toBe(true)
    expect(aberto([almoco, jantar], TERCA_20H).aberto).toBe(true)
  })
})

describe('fuso do estabelecimento', () => {
  it('o mesmo instante dá resultados diferentes em fusos diferentes', () => {
    // 2026-01-06T22:30Z: 19:30 em São Paulo (aberto), 18:30 em Manaus (aberto).
    const instante = new Date('2026-01-06T21:30:00Z') // 18:30 SP, 17:30 Manaus

    expect(aberto([jantar], instante, SAO_PAULO).aberto).toBe(true)
    // Em Manaus ainda são 17:30 — o estabelecimento não abriu.
    expect(aberto([jantar], instante, MANAUS).aberto).toBe(false)
  })
})

describe('pausa manual e ausência de horário', () => {
  it('a pausa vence qualquer horário cadastrado', () => {
    const resultado = statusDoEstabelecimento({
      intervalos: [jantar],
      timezone: SAO_PAULO,
      aceitandoPedidos: false,
      agora: TERCA_20H,
    })

    // Acabou o gás às 20h de terça: o horário diz aberto, a realidade não.
    expect(resultado).toEqual({ aberto: false, motivo: 'PAUSADO' })
  })

  it('sem horário cadastrado o motivo é específico', () => {
    expect(aberto([], TERCA_20H)).toEqual({ aberto: false, motivo: 'SEM_HORARIO_CADASTRADO' })
  })
})

describe('próxima abertura', () => {
  it('encontra um intervalo mais tarde no mesmo dia', () => {
    // Terça, 16:00: o jantar abre às 18:00 do mesmo dia.
    const resultado = aberto([almoco, jantar], new Date('2026-01-06T19:00:00Z'))

    expect(resultado).toMatchObject({
      proximaAbertura: { dayOfWeek: TERCA, opensAt: '18:00:00', emDias: 0 },
    })
  })

  it('pula para o próximo dia com horário', () => {
    const sabado: Intervalo = { dayOfWeek: 6, opensAt: '11:00', closesAt: '15:00' }

    // Terça, 20:00 → o próximo turno é sábado, quatro dias à frente.
    expect(proximaAbertura([sabado], { dayOfWeek: TERCA, minutos: 20 * 60 })).toEqual({
      dayOfWeek: 6,
      opensAt: '11:00',
      emDias: 4,
    })
  })

  it('dá a volta na semana quando o único turno já passou', () => {
    const terca: Intervalo = { dayOfWeek: TERCA, opensAt: '11:00', closesAt: '15:00' }

    // Terça 20:00: o turno de hoje já passou, o próximo é daqui a sete dias.
    expect(proximaAbertura([terca], { dayOfWeek: TERCA, minutos: 20 * 60 })).toEqual({
      dayOfWeek: TERCA,
      opensAt: '11:00',
      emDias: 7,
    })
  })

  it('escolhe o intervalo mais cedo quando há vários no dia', () => {
    // Terça, 09:00: o almoço (11:00) vem antes do jantar (18:00).
    expect(proximaAbertura([jantar, almoco], { dayOfWeek: TERCA, minutos: 9 * 60 })).toEqual({
      dayOfWeek: TERCA,
      opensAt: '11:00:00',
      emDias: 0,
    })
  })
})
