import { describe, expect, it } from 'vitest'

import { problemasDoGrupo } from '../src/catalog/option-groups.js'

const opcoes = (...nomes: string[]) => nomes.map((name) => ({ name, priceDeltaInCents: 0 }))

describe('coerência de um grupo de opções', () => {
  it('aceita o tamanho: exatamente uma escolha entre duas', () => {
    expect(
      problemasDoGrupo({ minSelections: 1, maxSelections: 1, options: opcoes('Normal', 'Grande') }),
    ).toEqual([])
  })

  it('aceita adicionais opcionais: de zero a três entre três', () => {
    expect(
      problemasDoGrupo({
        minSelections: 0,
        maxSelections: 3,
        options: opcoes('Bacon', 'Cheddar', 'Ovo'),
      }),
    ).toEqual([])
  })

  it('recusa mínimo maior que o número de opções — o produto ficaria impossível de pedir', () => {
    const problemas = problemasDoGrupo({
      minSelections: 2,
      maxSelections: 2,
      options: opcoes('Única'),
    })

    expect(problemas.join(' ')).toContain('impossível de pedir')
  })

  it('recusa mínimo maior que o máximo', () => {
    expect(
      problemasDoGrupo({ minSelections: 3, maxSelections: 1, options: opcoes('A', 'B', 'C') }),
    ).toContain('o mínimo de escolhas não pode ser maior que o máximo')
  })

  it('recusa máximo acima do número de opções', () => {
    expect(
      problemasDoGrupo({ minSelections: 0, maxSelections: 5, options: opcoes('A', 'B') }).length,
    ).toBe(1)
  })

  it('recusa grupo sem opções', () => {
    expect(problemasDoGrupo({ minSelections: 0, maxSelections: 1, options: [] })).toContain(
      'o grupo precisa de ao menos uma opção',
    )
  })

  it('recusa opções com o mesmo nome, sem diferenciar maiúsculas nem espaços', () => {
    expect(
      problemasDoGrupo({ minSelections: 0, maxSelections: 2, options: opcoes('Bacon', ' bacon ') }),
    ).toContain('há opções com o mesmo nome')
  })
})
