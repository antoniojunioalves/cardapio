import { describe, expect, it } from 'vitest'

import {
  cadastroSchema,
  fusoValido,
  senhaSchema,
  slugReservado,
  slugSchema,
  SLUGS_RESERVADOS,
  VERSAO_DOS_TERMOS,
} from '../src/index.js'

const mensagem = (resultado: { success: boolean; error?: { issues: { message: string }[] } }) =>
  resultado.error?.issues[0]?.message

describe('endereço do cardápio', () => {
  it('aceita maiúsculas e espaços em volta, e entrega o endereço da URL', () => {
    expect(slugSchema.parse('  Lanchonete-Do-Ze ')).toBe('lanchonete-do-ze')
  })

  it('recusa o que o banco recusaria', () => {
    for (const invalido of [
      'lanchonete do ze',
      'lanchonete--do-ze',
      '-lanchonete',
      'lanchonete-',
      'lanchonete_do_ze',
      'lanchonete.do.ze',
      'açaí-da-praia',
    ]) {
      expect(slugSchema.safeParse(invalido).success, invalido).toBe(false)
    }
  })

  it('exige de 3 a 63 caracteres', () => {
    expect(slugSchema.safeParse('ze').success).toBe(false)
    expect(slugSchema.safeParse('zeh').success).toBe(true)
    expect(slugSchema.safeParse('a'.repeat(63)).success).toBe(true)
    expect(slugSchema.safeParse('a'.repeat(64)).success).toBe(false)
  })

  it('recusa endereço reservado, dizendo o motivo', () => {
    expect(mensagem(slugSchema.safeParse('cadastro'))).toBe(
      'Este endereço é reservado. Escolha outro.',
    )
    expect(mensagem(slugSchema.safeParse('Termos'))).toBe(
      'Este endereço é reservado. Escolha outro.',
    )
  })

  it('todo endereço reservado tem o formato de um endereço — senão a reserva não serviria', () => {
    for (const reservado of SLUGS_RESERVADOS) {
      expect(slugReservado(reservado)).toBe(true)
      // Sem a reserva, passaria no formato: é por isso que precisa estar na lista.
      expect(slugSchema.safeParse(reservado).success, reservado).toBe(false)
      expect(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(reservado), reservado).toBe(true)
    }
  })
})

describe('senha', () => {
  it('exige ao menos 8 caracteres', () => {
    expect(mensagem(senhaSchema.safeParse('1234567'))).toBe(
      'A senha precisa de ao menos 8 caracteres.',
    )
    expect(senhaSchema.safeParse('12345678').success).toBe(true)
  })
})

describe('fuso horário', () => {
  it('reconhece fusos do Brasil e recusa o que o Intl não conhece', () => {
    for (const fuso of ['America/Sao_Paulo', 'America/Manaus', 'America/Rio_Branco']) {
      expect(fusoValido(fuso), fuso).toBe(true)
    }
    expect(fusoValido('America/Atlantida')).toBe(false)
    expect(fusoValido('')).toBe(false)
  })
})

describe('cadastro', () => {
  const valido = {
    establishmentName: '  Lanchonete do Zé ',
    slug: 'Lanchonete-do-Ze',
    ownerName: 'José da Silva',
    email: 'ze@exemplo.com',
    password: 'senha-forte-123',
    termsVersion: VERSAO_DOS_TERMOS,
  }

  it('aceita o cadastro completo, normalizando nome e endereço', () => {
    const cadastro = cadastroSchema.parse(valido)
    expect(cadastro.establishmentName).toBe('Lanchonete do Zé')
    expect(cadastro.slug).toBe('lanchonete-do-ze')
    expect(cadastro.timezone).toBeUndefined()
  })

  it('recusa termos de outra versão: a pessoa precisa ter aceitado os atuais', () => {
    const resultado = cadastroSchema.safeParse({ ...valido, termsVersion: '2020-01-01' })
    expect(mensagem(resultado)).toBe(
      'Os termos mudaram desde que a página abriu. Leia a versão atual e aceite de novo.',
    )
  })

  it('aceita um fuso conhecido e recusa um inventado', () => {
    expect(cadastroSchema.safeParse({ ...valido, timezone: 'America/Manaus' }).success).toBe(true)
    expect(cadastroSchema.safeParse({ ...valido, timezone: 'Lua/Base_Alfa' }).success).toBe(false)
  })

  it('mostra todos os problemas de uma vez', () => {
    const resultado = cadastroSchema.safeParse({
      establishmentName: ' ',
      slug: 'x',
      ownerName: '',
      email: 'nao-e-email',
      password: '123',
      termsVersion: '',
    })
    const campos = resultado.error?.issues.map((i) => i.path[0])
    expect(new Set(campos)).toEqual(
      new Set(['establishmentName', 'slug', 'ownerName', 'email', 'password', 'termsVersion']),
    )
  })
})
