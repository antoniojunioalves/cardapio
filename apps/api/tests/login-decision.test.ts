import { describe, expect, it } from 'vitest'

import {
  decidirEntrada,
  vinculosQueEntram,
  type VinculoParaEntrar,
} from '../src/auth/login-decision.js'

/** Um vínculo ativo, num estabelecimento publicado, que nunca entrou. */
function vinculo(
  tenantId: string,
  mudar: Partial<Omit<VinculoParaEntrar, 'tenantId' | 'userId'>> = {},
): VinculoParaEntrar {
  return {
    tenantId,
    userId: `usuario-${tenantId}`,
    status: 'ACTIVE',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    ...mudar,
  }
}

const dia = (n: number) => new Date(`2026-10-${String(n).padStart(2, '0')}T12:00:00Z`)

describe('com que vínculo a conta entra', () => {
  it('um só, ativo: entra nele', () => {
    expect(decidirEntrada([vinculo('a')])).toEqual({ tipo: 'entrar', vinculo: vinculo('a') })
  })

  it('vários: entra no usado por último', () => {
    const decisao = decidirEntrada([
      vinculo('a', { lastLoginAt: dia(3) }),
      vinculo('b', { lastLoginAt: dia(9) }),
      vinculo('c', { lastLoginAt: dia(5) }),
    ])
    expect(decisao).toMatchObject({ tipo: 'entrar', vinculo: { tenantId: 'b' } })
  })

  it('quem nunca entrou fica depois de quem já entrou, e o vínculo mais novo antes', () => {
    const ordem = vinculosQueEntram([
      vinculo('antigo-sem-acesso', { createdAt: dia(1) }),
      vinculo('com-acesso', { lastLoginAt: dia(2), createdAt: dia(1) }),
      vinculo('novo-sem-acesso', { createdAt: dia(8) }),
    ]).map((v) => v.tenantId)

    expect(ordem).toEqual(['com-acesso', 'novo-sem-acesso', 'antigo-sem-acesso'])
  })

  it('o estabelecimento aguardando a confirmação do e-mail entra: o painel funciona', () => {
    expect(decidirEntrada([vinculo('a', { status: 'PENDING' })])).toMatchObject({
      tipo: 'entrar',
    })
  })

  it('desativada num, a pessoa entra no outro — mesmo que o desativado seja o mais recente', () => {
    const decisao = decidirEntrada([
      vinculo('desativado', { isActive: false, lastLoginAt: dia(9) }),
      vinculo('ativo', { lastLoginAt: dia(2) }),
    ])
    expect(decisao).toMatchObject({ tipo: 'entrar', vinculo: { tenantId: 'ativo' } })
  })

  it('suspenso num, entra no outro', () => {
    const decisao = decidirEntrada([
      vinculo('suspenso', { status: 'SUSPENDED', lastLoginAt: dia(9) }),
      vinculo('ativo', { lastLoginAt: dia(2) }),
    ])
    expect(decisao).toMatchObject({ tipo: 'entrar', vinculo: { tenantId: 'ativo' } })
  })
})

describe('por que a conta não entra', () => {
  it('só desativada: o acesso foi desativado', () => {
    expect(
      decidirEntrada([vinculo('a', { isActive: false }), vinculo('b', { isActive: false })]),
    ).toEqual({ tipo: 'recusar', motivo: 'desativado' })
  })

  it('ativa só em estabelecimento suspenso: a suspensão é o motivo', () => {
    expect(decidirEntrada([vinculo('a', { status: 'SUSPENDED' })])).toEqual({
      tipo: 'recusar',
      motivo: 'suspenso',
    })
  })

  it('desativada num e ativa num suspenso: diz da suspensão, que é o que a impede de entrar', () => {
    expect(
      decidirEntrada([
        vinculo('desativado', { isActive: false }),
        vinculo('suspenso', { status: 'SUSPENDED' }),
      ]),
    ).toEqual({ tipo: 'recusar', motivo: 'suspenso' })
  })

  it('desativada num estabelecimento suspenso: o acesso foi desativado', () => {
    expect(decidirEntrada([vinculo('a', { isActive: false, status: 'SUSPENDED' })])).toEqual({
      tipo: 'recusar',
      motivo: 'desativado',
    })
  })

  it('sem vínculo nenhum: a conta não está em equipe nenhuma', () => {
    expect(decidirEntrada([])).toEqual({ tipo: 'recusar', motivo: 'sem-estabelecimento' })
  })
})
