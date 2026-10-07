import { describe, expect, it } from 'vitest'

import {
  mensagemDoProblemaDoGrupo,
  opcoesRepetidas,
  problemasDoGrupoDeOpcoes,
  type GrupoParaConferir,
} from '../src/index.js'

const grupo = (minSelections: number, maxSelections: number, ...nomes: string[]) => ({
  minSelections,
  maxSelections,
  options: nomes.map((name) => ({ name })),
})

describe('coerência de um grupo de opções', () => {
  it('aceita o tamanho: exatamente uma escolha entre duas', () => {
    expect(problemasDoGrupoDeOpcoes(grupo(1, 1, 'Normal', 'Grande'))).toEqual([])
  })

  it('aceita adicionais opcionais: de zero a três entre três', () => {
    expect(problemasDoGrupoDeOpcoes(grupo(0, 3, 'Bacon', 'Cheddar', 'Ovo'))).toEqual([])
  })

  it('recusa mínimo maior que o número de opções — o produto ficaria impossível de pedir', () => {
    const impossivel = grupo(2, 2, 'Única')

    expect(problemasDoGrupoDeOpcoes(impossivel)).toEqual([
      'MINIMO_ACIMA_DAS_OPCOES',
      'MAXIMO_ACIMA_DAS_OPCOES',
    ])
    expect(mensagemDoProblemaDoGrupo('MINIMO_ACIMA_DAS_OPCOES', impossivel)).toBe(
      'O grupo pede 2 escolhas, mas tem 1 opção: o produto ficaria impossível de pedir.',
    )
  })

  it('recusa mínimo maior que o máximo', () => {
    expect(problemasDoGrupoDeOpcoes(grupo(3, 1, 'A', 'B', 'C'))).toEqual([
      'MINIMO_MAIOR_QUE_MAXIMO',
    ])
  })

  it('recusa máximo acima do número de opções', () => {
    const largo = grupo(0, 5, 'A', 'B')

    expect(problemasDoGrupoDeOpcoes(largo)).toEqual(['MAXIMO_ACIMA_DAS_OPCOES'])
    expect(mensagemDoProblemaDoGrupo('MAXIMO_ACIMA_DAS_OPCOES', largo)).toBe(
      'O máximo de escolhas (5) passa do número de opções (2).',
    )
  })

  it('recusa grupo sem opções', () => {
    expect(problemasDoGrupoDeOpcoes(grupo(0, 1))).toEqual(['SEM_OPCOES'])
  })

  it('recusa opções com o mesmo nome, sem diferenciar maiúsculas nem espaços', () => {
    expect(problemasDoGrupoDeOpcoes(grupo(0, 2, 'Bacon', ' bacon '))).toEqual(['NOMES_REPETIDOS'])
  })

  it('aponta qual opção repete o nome de uma anterior, para o erro ir no campo certo', () => {
    expect(opcoesRepetidas(grupo(0, 4, 'Bacon', 'Ovo', 'BACON', 'ovo').options)).toEqual([2, 3])
  })

  it('nomes em branco não contam como repetidos: o campo vazio tem o seu próprio erro', () => {
    expect(opcoesRepetidas(grupo(0, 2, '', ' ').options)).toEqual([])
  })

  it('toda mensagem é uma frase para quem cadastra', () => {
    const qualquer: GrupoParaConferir = grupo(1, 1, 'A')
    for (const problema of [
      'SEM_OPCOES',
      'MINIMO_MAIOR_QUE_MAXIMO',
      'MINIMO_ACIMA_DAS_OPCOES',
      'MAXIMO_ACIMA_DAS_OPCOES',
      'NOMES_REPETIDOS',
    ] as const) {
      expect(mensagemDoProblemaDoGrupo(problema, qualquer)).toMatch(/^[A-ZÁÉÍÓÚ].*\.$/)
    }
  })
})
