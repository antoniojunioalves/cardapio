import { afterEach, describe, expect, it } from 'vitest'

import { applyTenantTheme, resetTenantTheme } from '../src/theme'

afterEach(() => {
  document.documentElement.removeAttribute('style')
})

describe('tema por tenant', () => {
  it('sobrescreve as custom properties em runtime e volta atrás, sem rebuild', () => {
    const raiz = document.documentElement
    expect(raiz.style.getPropertyValue('--color-primary')).toBe('')

    applyTenantTheme({ primary: '#c2410c', primaryHover: '#9a3412', radiusCard: '1.5rem' })
    expect(raiz.style.getPropertyValue('--color-primary')).toBe('#c2410c')
    expect(raiz.style.getPropertyValue('--radius-card')).toBe('1.5rem')

    resetTenantTheme()
    expect(raiz.style.getPropertyValue('--color-primary')).toBe('')
    expect(raiz.style.getPropertyValue('--radius-card')).toBe('')
  })

  it('só escreve o que o tema traz: o resto continua o do produto', () => {
    applyTenantTheme({ primary: '#1d4ed8' })
    expect(document.documentElement.style.getPropertyValue('--radius-card')).toBe('')
  })
})
