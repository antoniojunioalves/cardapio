import { describe, expect, it } from 'vitest'

import {
  enderecoSchema,
  formatarTelefone,
  identificarClienteSchema,
  mascararTelefoneDigitado,
  normalizarTelefone,
} from '../src/index.js'

describe('telefone', () => {
  it('as formas comuns de digitar caem no mesmo número', () => {
    for (const digitado of [
      '(11) 98765-4321',
      '11987654321',
      '11 98765 4321',
      '+55 11 98765-4321',
      '5511987654321',
    ]) {
      expect(normalizarTelefone(digitado), digitado).toBe('5511987654321')
    }
  })

  it('aceita fixo com 8 dígitos', () => {
    expect(normalizarTelefone('(21) 3456-7890')).toBe('552134567890')
  })

  it('55 como DDD não se confunde com o código do país', () => {
    expect(normalizarTelefone('55 99876-5432')).toBe('5555998765432')
  })

  it('recusa DDD que não existe, celular sem o 9 e tamanho errado', () => {
    expect(normalizarTelefone('(20) 98765-4321')).toBeNull()
    expect(normalizarTelefone('(11) 88765-4321')).toBeNull()
    expect(normalizarTelefone('(11) 1234-5678')).toBeNull()
    expect(normalizarTelefone('98765-4321')).toBeNull()
    expect(normalizarTelefone('')).toBeNull()
    expect(normalizarTelefone('4411987654321')).toBeNull()
  })

  it('formata para exibir', () => {
    expect(formatarTelefone('5511987654321')).toBe('(11) 98765-4321')
    expect(formatarTelefone('552134567890')).toBe('(21) 3456-7890')
  })

  it('máscara acompanha a digitação', () => {
    expect(mascararTelefoneDigitado('1')).toBe('(1')
    expect(mascararTelefoneDigitado('1198')).toBe('(11) 98')
    expect(mascararTelefoneDigitado('1134567890')).toBe('(11) 3456-7890')
    expect(mascararTelefoneDigitado('11987654321')).toBe('(11) 98765-4321')
    expect(mascararTelefoneDigitado('119876543219999')).toBe('(11) 98765-4321')
  })
})

describe('schemas', () => {
  it('telefone inválido vem com mensagem para a pessoa', () => {
    const resultado = identificarClienteSchema.safeParse({ phone: '123' })
    expect(resultado.success).toBe(false)
    expect(resultado.error?.issues[0]?.message).toBe(
      'Informe um telefone com DDD, como (11) 98765-4321.',
    )
  })

  it('endereço apara espaços e transforma opcional vazio em nulo', () => {
    expect(
      enderecoSchema.parse({
        street: '  Rua das Flores ',
        number: '12',
        complement: '',
        neighborhood: 'Centro',
        city: undefined,
        reference: '   ',
      }),
    ).toEqual({
      street: 'Rua das Flores',
      number: '12',
      complement: null,
      neighborhood: 'Centro',
      city: null,
      reference: null,
    })
  })

  it('endereço sem bairro diz o que falta', () => {
    const resultado = enderecoSchema.safeParse({ street: 'Rua', number: '1', neighborhood: ' ' })
    expect(resultado.error?.issues.map((i) => i.message)).toEqual(['Informe o bairro.'])
  })
})
