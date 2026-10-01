import { describe, expect, it } from 'vitest'

import { inicioDoDia, inicioDoMes } from '../src/lib/timezone.js'

describe('início do mês no fuso do estabelecimento', () => {
  it('é a meia-noite do dia 1 no fuso, não em UTC', () => {
    // 29/09 18:00 em São Paulo.
    expect(inicioDoMes(new Date('2026-09-29T21:00:00Z'), 'America/Sao_Paulo').toISOString()).toBe(
      '2026-09-01T03:00:00.000Z',
    )
  })

  it('23:00 do último dia em São Paulo ainda é o mês que acaba', () => {
    // Em UTC já é 1º de outubro.
    expect(inicioDoMes(new Date('2026-10-01T02:00:00Z'), 'America/Sao_Paulo').toISOString()).toBe(
      '2026-09-01T03:00:00.000Z',
    )
  })

  it('acerta o fuso do dia 1 mesmo quando o horário de verão mudou no meio do mês', () => {
    // Nova York: 1º de novembro ainda em horário de verão (-4); dia 15, já não (-5).
    expect(inicioDoMes(new Date('2026-11-15T12:00:00Z'), 'America/New_York').toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    )
  })
})

describe('início do dia no fuso do estabelecimento', () => {
  it('é a meia-noite de hoje no fuso, não em UTC', () => {
    // 29/09 18:00 em São Paulo.
    expect(inicioDoDia(new Date('2026-09-29T21:00:00Z'), 'America/Sao_Paulo').toISOString()).toBe(
      '2026-09-29T03:00:00.000Z',
    )
  })

  it('23:00 em São Paulo ainda é hoje, embora em UTC já seja amanhã', () => {
    expect(inicioDoDia(new Date('2026-09-30T02:00:00Z'), 'America/Sao_Paulo').toISOString()).toBe(
      '2026-09-29T03:00:00.000Z',
    )
  })

  it('a leste do UTC, o dia começa antes da meia-noite UTC', () => {
    // 30/09 08:00 em Tóquio (+9).
    expect(inicioDoDia(new Date('2026-09-29T23:00:00Z'), 'Asia/Tokyo').toISOString()).toBe(
      '2026-09-29T15:00:00.000Z',
    )
  })

  it('acerta a meia-noite no dia em que o horário de verão acaba', () => {
    // Nova York, 1º de novembro: a meia-noite ainda é -4; ao meio-dia já é -5.
    expect(inicioDoDia(new Date('2026-11-01T17:00:00Z'), 'America/New_York').toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    )
  })
})
