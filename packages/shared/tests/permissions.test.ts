import { describe, expect, it } from 'vitest'

import {
  completarPermissoes,
  GRUPOS_DE_PERMISSAO,
  nomeDaPermissao,
  PERFIS_PRONTOS,
  permissaoExiste,
  PERMISSOES,
  permissoesPorGrupo,
  permissoesQueFaltam,
  TODAS_AS_PERMISSOES,
} from '../src/index.js'

describe('o catálogo de permissões', () => {
  it('não repete código, e todo código é recurso:ação', () => {
    expect(new Set(TODAS_AS_PERMISSOES).size).toBe(TODAS_AS_PERMISSOES.length)
    for (const codigo of TODAS_AS_PERMISSOES) expect(codigo).toMatch(/^[a-z]+:[a-z]+$/)
  })

  it('toda permissão está num grupo que existe, e o que ela exige também existe', () => {
    const grupos = GRUPOS_DE_PERMISSAO.map((g) => g.codigo)
    for (const permissao of PERMISSOES) {
      expect(grupos).toContain(permissao.grupo)
      if ('requer' in permissao) expect(permissaoExiste(permissao.requer)).toBe(true)
    }
  })

  it('no cardápio, esgotado, preço e o resto são permissões separadas', () => {
    expect(TODAS_AS_PERMISSOES).toEqual(
      expect.arrayContaining(['products:availability', 'products:price', 'products:update']),
    )
  })

  it('cancelar pedido e pausar o recebimento não vêm junto de outra permissão', () => {
    expect(TODAS_AS_PERMISSOES).toEqual(expect.arrayContaining(['orders:cancel', 'orders:pause']))
  })

  it('a tela de perfis não oferece o que ainda não tem tela', () => {
    const oferecidas = permissoesPorGrupo().flatMap((g) => g.permissoes.map((p) => p.codigo))

    expect(oferecidas).not.toContain('audit:read')
    expect(oferecidas).not.toContain('customers:read')
    expect(oferecidas).toContain('products:price')
    expect(permissoesPorGrupo().map((g) => g.grupo.nome)).toEqual([
      'Pedidos',
      'Cardápio',
      'Configurações',
      'Equipe',
    ])
  })

  it('o nome de uma permissão, e nada para um código que não existe', () => {
    expect(nomeDaPermissao('products:price')).toBe('Alterar preços')
    expect(nomeDaPermissao('inventada:agora')).toBeUndefined()
  })
})

describe('as permissões de um perfil', () => {
  it('quem altera vê: a permissão exigida entra junto', () => {
    expect(completarPermissoes(['products:price'])).toEqual(['products:read', 'products:price'])
    expect(completarPermissoes(['orders:cancel'])).toEqual(['orders:read', 'orders:cancel'])
    // Pausar os pedidos é nas Configurações: precisa vê-las.
    expect(completarPermissoes(['orders:pause'])).toEqual(['orders:pause', 'settings:read'])
  })

  it('saem na ordem do catálogo, sem repetição e sem código desconhecido', () => {
    expect(
      completarPermissoes(['users:read', 'orders:read', 'inventada:agora', 'orders:read']),
    ).toEqual(['orders:read', 'users:read'])
    expect(completarPermissoes([])).toEqual([])
  })

  it('o que falta a quem tenta dar uma permissão que não tem', () => {
    const tem = ['products:read', 'products:availability']

    expect(permissoesQueFaltam(['products:availability'], tem)).toEqual([])
    expect(permissoesQueFaltam(['products:price', 'products:availability'], tem)).toEqual([
      'products:price',
    ])
    // O que a permissão exige também conta.
    expect(permissoesQueFaltam(['orders:update'], tem)).toEqual(['orders:read', 'orders:update'])
    expect(permissoesQueFaltam(['products:price'], TODAS_AS_PERMISSOES)).toEqual([])
  })
})

describe('os perfis prontos', () => {
  const perfil = (nome: string) => {
    const achado = PERFIS_PRONTOS.find((p) => p.nome === nome)
    if (!achado) throw new Error(`perfil ${nome} não existe`)
    return achado.permissoes
  }

  it('são quatro, e nenhum é o proprietário', () => {
    expect(PERFIS_PRONTOS.map((p) => p.nome)).toEqual([
      'Administrador',
      'Gerente do cardápio',
      'Atendente',
      'Cozinha',
    ])
  })

  it('já vêm completos: nenhum tem uma permissão sem a que ela exige', () => {
    for (const pronto of PERFIS_PRONTOS) {
      expect(completarPermissoes(pronto.permissoes)).toEqual([...pronto.permissoes])
    }
  })

  it('o administrador tem tudo, menos desativar pessoas', () => {
    expect(perfil('Administrador')).toEqual(TODAS_AS_PERMISSOES.filter((c) => c !== 'users:delete'))
  })

  it('o gerente do cardápio monta o cardápio, sem pedidos, configurações nem equipe', () => {
    const gerente = perfil('Gerente do cardápio')

    expect(gerente).toEqual(expect.arrayContaining(['products:price', 'categories:create']))
    expect(gerente.filter((c) => !/^(products|categories):/.test(c))).toEqual([])
  })

  it('o atendente cuida dos pedidos e marca o que esgotou, sem mexer em preço', () => {
    const atendente = perfil('Atendente')

    expect(atendente).toEqual(
      expect.arrayContaining(['orders:update', 'orders:cancel', 'products:availability']),
    )
    expect(atendente).not.toContain('products:price')
    expect(atendente).not.toContain('products:update')
  })

  it('a cozinha muda o status e marca o que esgotou; não cancela, não vê clientes', () => {
    const cozinha = perfil('Cozinha')

    expect(cozinha).toEqual([
      'orders:read',
      'orders:update',
      'products:read',
      'products:availability',
    ])
    expect(cozinha).not.toContain('orders:cancel')
    expect(cozinha).not.toContain('customers:read')
  })
})
