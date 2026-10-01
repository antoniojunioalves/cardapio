import { slugSchema } from '@repo/shared'
import { describe, expect, it } from 'vitest'

import { sugerirSlug } from '../src/features/signup/slug'

describe('endereço sugerido pelo nome', () => {
  it('tira acentos, espaços e símbolos', () => {
    expect(sugerirSlug('Lanchonete do Zé')).toBe('lanchonete-do-ze')
    expect(sugerirSlug('  Açaí & Cia.  ')).toBe('acai-cia')
    expect(sugerirSlug('Pizzaria 10/10 — Centro')).toBe('pizzaria-10-10-centro')
  })

  it('a sugestão sempre passa no formato que a API exige', () => {
    for (const nome of [
      'Lanchonete do Zé',
      'Bar do João!!!',
      'Café & Pão de Queijo',
      'X'.repeat(80),
    ]) {
      const sugerido = sugerirSlug(nome)
      expect(sugerido.length, nome).toBeLessThanOrEqual(63)
      expect(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(sugerido), nome).toBe(true)
    }
  })

  it('não deixa hífen no fim quando corta no tamanho máximo', () => {
    const nome = `${'a'.repeat(62)} b`
    expect(sugerirSlug(nome)).toBe('a'.repeat(62))
  })

  it('nome só de símbolos não sugere nada — a validação pede o endereço', () => {
    expect(sugerirSlug('!!!')).toBe('')
    expect(slugSchema.safeParse(sugerirSlug('!!!')).success).toBe(false)
  })
})
