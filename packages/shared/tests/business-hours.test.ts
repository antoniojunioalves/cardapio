import { describe, expect, it } from 'vitest'

import { HORA_DO_DIA, minutosDoDia, problemasDosHorarios } from '../src/index.js'

const intervalo = (dayOfWeek: number, opensAt: string, closesAt: string) => ({
  dayOfWeek,
  opensAt,
  closesAt,
})

describe('hora do dia', () => {
  it('aceita HH:MM e HH:MM:SS, como o campo de hora e o banco escrevem', () => {
    for (const hora of ['00:00', '08:30', '23:59', '18:00:00']) {
      expect(HORA_DO_DIA.test(hora), hora).toBe(true)
    }
  })

  it('recusa o que não é hora', () => {
    for (const hora of ['', '24:00', '8:30', '12:60', '12h30', '12:3']) {
      expect(HORA_DO_DIA.test(hora), hora).toBe(false)
    }
  })

  it('vira minutos desde a meia-noite, com ou sem segundos', () => {
    expect(minutosDoDia('00:00')).toBe(0)
    expect(minutosDoDia('18:30')).toBe(1110)
    expect(minutosDoDia('18:30:00')).toBe(1110)
  })
})

describe('problemas de uma grade de horários', () => {
  it('uma grade comum não tem nenhum', () => {
    expect(
      problemasDosHorarios([
        intervalo(1, '11:00', '14:00'),
        intervalo(1, '18:00', '23:00'),
        intervalo(2, '11:00', '14:00'),
      ]),
    ).toEqual([null, null, null])
  })

  it('campo em branco é hora inválida', () => {
    expect(problemasDosHorarios([intervalo(1, '', '14:00'), intervalo(1, '18:00', '')])).toEqual([
      'HORA_INVALIDA',
      'HORA_INVALIDA',
    ])
  })

  it('abrir e fechar na mesma hora não diz nada, e é recusado', () => {
    expect(problemasDosHorarios([intervalo(3, '10:00', '10:00:00')])).toEqual([
      'ABRE_E_FECHA_IGUAIS',
    ])
  })

  it('fechar antes de abrir atravessa a meia-noite, e vale', () => {
    expect(problemasDosHorarios([intervalo(5, '18:00', '02:00')])).toEqual([null])
  })

  it('marca o intervalo que começa dentro de outro do mesmo dia', () => {
    expect(
      problemasDosHorarios([
        intervalo(1, '15:00', '20:00'),
        intervalo(1, '11:00', '16:00'),
        intervalo(1, '21:00', '23:00'),
      ]),
    ).toEqual(['SOBREPOSTO', null, null])
  })

  it('um intervalo dentro de outro maior também é sobreposição', () => {
    expect(
      problemasDosHorarios([
        intervalo(1, '08:00', '22:00'),
        intervalo(1, '10:00', '11:00'),
        intervalo(1, '12:00', '13:00'),
      ]),
    ).toEqual([null, 'SOBREPOSTO', 'SOBREPOSTO'])
  })

  it('encostar não é sobrepor: fechar às 14:00 e reabrir às 14:00', () => {
    expect(
      problemasDosHorarios([intervalo(1, '11:00', '14:00'), intervalo(1, '14:00', '18:00')]),
    ).toEqual([null, null])
  })

  it('o mesmo horário em dias diferentes não se sobrepõe', () => {
    expect(
      problemasDosHorarios([intervalo(1, '11:00', '14:00'), intervalo(2, '11:00', '14:00')]),
    ).toEqual([null, null])
  })

  it('um intervalo inválido não entra na conta da sobreposição dos outros', () => {
    expect(
      problemasDosHorarios([intervalo(1, '11:00', '11:00'), intervalo(1, '11:00', '14:00')]),
    ).toEqual(['ABRE_E_FECHA_IGUAIS', null])
  })
})
