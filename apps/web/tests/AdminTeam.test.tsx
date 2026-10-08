import { TODAS_AS_PERMISSOES } from '@repo/shared'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSessaoStore } from '../src/features/admin/session'
import {
  alcanca,
  alcancaAPessoa,
  desmarcarPermissao,
  equipeNoPlano,
  marcarPermissao,
  permissoesMudaram,
  porQueNaoExcluirPerfil,
  quantasPessoas,
  resumoDoPerfil,
  ultimoAcesso,
} from '../src/features/admin/team'
import { conflito, sessao } from './helpers/cardapio-admin'
import {
  abrirNaEquipe,
  comoPerfil,
  PERFIS,
  PESSOAS,
  pessoa,
  usoDaEquipe,
  type ApiDaEquipe,
} from './helpers/equipe'
import { pararConexaoAoVivo } from './helpers/pagina'

const clicar = (nome: string | RegExp) => {
  fireEvent.click(screen.getByRole('button', { name: nome }))
}
const escrever = (campo: HTMLElement, valor: string) => {
  fireEvent.change(campo, { target: { value: valor } })
}
/** O cartão de uma pessoa ou de um perfil na lista, pelo nome. */
const cartao = (nome: string) =>
  within(screen.getByRole('heading', { level: 2, name: nome }).closest('li') as HTMLElement)
const janelaAberta = async (nome: string | RegExp) =>
  within(await screen.findByRole('dialog', { name: nome }))
const caixa = (janela: Pick<typeof screen, 'getByRole'>, nome: string) =>
  janela.getByRole('checkbox', { name: nome })

const permissoesDe = (id: string) => PERFIS.find((p) => p.id === id)?.permissions ?? []
/** O Léo não tinha papel nenhum antes de os perfis existirem: ficou sem perfil. */
const PESSOAS_COM_O_LEO = [...PESSOAS, pessoa({ id: 'p-leo', name: 'Léo' })]

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useSessaoStore.setState({ slug: null, estabelecimento: null, usuario: null, accessToken: null })
  pararConexaoAoVivo()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// --- Regras sem tela ---------------------------------------------------------------

describe('o que um perfil permite, em poucas linhas', () => {
  it('diz as permissões de cada grupo pelo nome', () => {
    expect(resumoDoPerfil(permissoesDe('pf-cozinha'))).toEqual([
      { grupo: 'Pedidos', texto: 'ver os pedidos, mudar o status dos pedidos' },
      { grupo: 'Cardápio', texto: 'ver o cardápio, marcar o que esgotou' },
    ])
  })

  it('um grupo inteiro vira "tudo"', () => {
    expect(resumoDoPerfil(TODAS_AS_PERMISSOES)).toEqual([
      { grupo: 'Pedidos', texto: 'tudo' },
      { grupo: 'Cardápio', texto: 'tudo' },
      { grupo: 'Configurações', texto: 'tudo' },
      { grupo: 'Equipe', texto: 'tudo' },
    ])
  })

  it('sem nada — ou só com o que ainda não tem tela —, não há o que dizer', () => {
    expect(resumoDoPerfil([])).toEqual([])
    expect(resumoDoPerfil(['customers:read', 'audit:read'])).toEqual([])
  })
})

describe('marcar e desmarcar permissões', () => {
  it('marcar traz junto a que ela exige, na ordem do catálogo', () => {
    expect(marcarPermissao(['orders:read'], 'products:price')).toEqual([
      'orders:read',
      'products:read',
      'products:price',
    ])
    expect(marcarPermissao([], 'orders:pause')).toEqual(['orders:pause', 'settings:read'])
  })

  it('desmarcar leva junto as que não servem sem ela', () => {
    expect(
      desmarcarPermissao(
        ['orders:read', 'orders:pause', 'settings:read', 'settings:update'],
        'settings:read',
      ),
    ).toEqual(['orders:read'])
    expect(
      desmarcarPermissao(['products:read', 'products:price', 'categories:create'], 'products:read'),
    ).toEqual([])
  })

  it('desmarcar uma de que nenhuma depende tira só ela — e não mexe nas que não têm tela', () => {
    expect(
      desmarcarPermissao(['orders:read', 'orders:cancel', 'customers:read'], 'orders:cancel'),
    ).toEqual(['orders:read', 'customers:read'])
  })

  it('as mesmas permissões em outra ordem não são mudança', () => {
    expect(
      permissoesMudaram(['orders:read', 'products:read'], ['products:read', 'orders:read']),
    ).toBe(false)
    expect(permissoesMudaram(['orders:read'], ['orders:read', 'products:read'])).toBe(true)
    expect(permissoesMudaram(['orders:read'], ['products:read'])).toBe(true)
  })
})

describe('ninguém mexe no que não alcança', () => {
  const atendente = { ...PERFIS[1], users: 1 } as Parameters<typeof alcancaAPessoa>[2][number]
  const eu = (permissoes: readonly string[], id = 'u') => ({ id, permissoes })

  it('alcança um perfil quem tem todas as permissões dele', () => {
    expect(alcanca(['orders:read'], ['orders:read', 'products:read'])).toBe(true)
    expect(alcanca(['orders:read', 'orders:cancel'], ['orders:read'])).toBe(false)
    expect(alcanca([], [])).toBe(true)
  })

  it('na conta do proprietário, só ele mesmo', () => {
    const dono = pessoa({ id: 'u', name: 'Zé', isOwner: true })

    expect(alcancaAPessoa(dono, eu(TODAS_AS_PERMISSOES), [])).toBe(true)
    expect(alcancaAPessoa(dono, eu(TODAS_AS_PERMISSOES, 'outra'), [])).toBe(false)
  })

  it('em quem tem um perfil, só quem alcança o perfil', () => {
    const bia = pessoa({
      id: 'p-bia',
      name: 'Bia',
      profile: { id: 'pf-atendente', name: 'Atendente' },
    })

    expect(alcancaAPessoa(bia, eu(atendente.permissions), [atendente])).toBe(true)
    expect(alcancaAPessoa(bia, eu(['orders:read']), [atendente])).toBe(false)
    // Um perfil que a tela não conhece não está ao alcance de ninguém.
    expect(alcancaAPessoa(bia, eu(TODAS_AS_PERMISSOES), [])).toBe(false)
  })

  it('quem está sem perfil não tem o que alcançar: qualquer um que altere pessoas lhe dá um', () => {
    const semPerfil = pessoa({ id: 'p-leo', name: 'Léo' })

    expect(alcancaAPessoa(semPerfil, eu(['users:read']), [])).toBe(true)
  })
})

describe('em palavras', () => {
  it('a equipe diante do limite do plano', () => {
    expect(equipeNoPlano(usoDaEquipe(2, 3))).toEqual({
      texto: '2 de 3 pessoas ativas do plano Grátis.',
      noLimite: false,
    })
    expect(equipeNoPlano(usoDaEquipe(1, 1))).toEqual({
      texto: '1 de 1 pessoa ativa do plano Grátis.',
      noLimite: true,
    })
    expect(equipeNoPlano(usoDaEquipe(9, null))).toBeNull()
    expect(equipeNoPlano(undefined)).toBeNull()
  })

  it('quantas pessoas, e por que um perfil com gente não se exclui', () => {
    expect([0, 1, 4].map(quantasPessoas)).toEqual(['ninguém', '1 pessoa', '4 pessoas'])
    const perfil = (users: number) =>
      ({ ...PERFIS[0], users }) as Parameters<typeof porQueNaoExcluirPerfil>[0]
    expect(porQueNaoExcluirPerfil(perfil(0))).toBeNull()
    expect(porQueNaoExcluirPerfil(perfil(1))).toMatch(/^Uma pessoa tem este perfil/)
    expect(porQueNaoExcluirPerfil(perfil(3))).toMatch(/^3 pessoas têm este perfil/)
  })

  it('o último acesso', () => {
    expect(ultimoAcesso({ lastLoginAt: null })).toBe('Ainda não entrou no painel')
    expect(ultimoAcesso({ lastLoginAt: '2026-10-05T17:32:00.000Z' })).toMatch(
      /^Último acesso em \d{2}\/\d{2}\/2026/,
    )
  })
})

// --- O menu ------------------------------------------------------------------------

describe('o item do menu', () => {
  it('aparece para quem vê a equipe, com as duas abas', async () => {
    abrirNaEquipe('')

    expect(await screen.findByRole('heading', { level: 1, name: 'Equipe' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Equipe' })).toHaveAttribute('aria-current', 'page')
    const abas = within(screen.getByRole('navigation', { name: 'Equipe' }))
    expect(abas.getAllByRole('link').map((a) => a.textContent)).toEqual(['Pessoas', 'Perfis'])
  })

  it('não aparece para quem não vê a equipe', async () => {
    abrirNaEquipe('', {}, sessao(['orders:read', 'products:read']))

    await screen.findByRole('link', { name: 'Pedidos' })
    expect(screen.queryByRole('link', { name: 'Equipe' })).toBeNull()
  })
})

// --- Pessoas -----------------------------------------------------------------------

describe('as pessoas, para o proprietário', () => {
  const abrir = async (api: ApiDaEquipe = {}) => {
    const enviados = abrirNaEquipe('', api)
    await screen.findByRole('heading', { level: 2, name: 'Ana' })
    return enviados
  }

  it('lista cada uma com o perfil, o último acesso e o que dá para fazer', async () => {
    await abrir({ plano: usoDaEquipe(3, 5) })

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Zé',
      'Ana',
      'Bia',
      'Caio',
    ])
    expect(screen.getByText(/3 de 5 pessoas ativas do plano Grátis\./)).toBeVisible()

    const ze = cartao('Zé')
    expect(ze.getByText('Proprietário')).toBeVisible()
    expect(ze.getByText('Você')).toBeVisible()
    expect(ze.getByText('ze@exemplo.com')).toBeVisible()
    // O proprietário edita o próprio nome, e ninguém o desativa — nem ele.
    expect(ze.getByRole('button', { name: 'Editar Zé' })).toBeVisible()
    expect(ze.queryByRole('button', { name: /Desativar|Reativar/ })).toBeNull()

    const bia = cartao('Bia')
    expect(bia.getByText('Atendente')).toBeVisible()
    expect(bia.getByText(/^Último acesso em/)).toBeVisible()
    expect(bia.queryByText('Você')).toBeNull()
    expect(bia.getByRole('button', { name: 'Desativar Bia' })).toBeVisible()

    const caio = cartao('Caio')
    expect(caio.getByText('Desativada')).toBeVisible()
    expect(caio.getByText('Ainda não entrou no painel')).toBeVisible()
    expect(caio.getByRole('button', { name: 'Reativar Caio' })).toBeVisible()
    expect(caio.queryByRole('button', { name: 'Desativar Caio' })).toBeNull()
  })

  it('cadastra uma pessoa com o perfil e a senha inicial', async () => {
    const enviados = await abrir()
    clicar('Nova pessoa')
    const janela = await janelaAberta('Nova pessoa')

    escrever(janela.getByLabelText('Nome'), 'Duda')
    escrever(janela.getByLabelText('E-mail'), 'duda@exemplo.com')
    escrever(janela.getByLabelText('Senha inicial'), 'Senha-da-duda')
    fireEvent.change(janela.getByLabelText('Perfil'), { target: { value: 'pf-cozinha' } })
    fireEvent.click(janela.getByRole('button', { name: 'Cadastrar pessoa' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(enviados).toEqual([
      {
        metodo: 'POST',
        caminho: '/users',
        corpo: {
          name: 'Duda',
          email: 'duda@exemplo.com',
          password: 'Senha-da-duda',
          profileId: 'pf-cozinha',
        },
      },
    ])
    expect(screen.getByText(/Duda foi cadastrada\. Passe a ela o e-mail e a senha/)).toBeVisible()
    expect(cartao('Duda').getByText('Cozinha')).toBeVisible()
  })

  it('a senha inicial fica à vista e mostra as regras, que são as do cadastro', async () => {
    await abrir()
    clicar('Nova pessoa')
    const janela = await janelaAberta('Nova pessoa')
    const senha = janela.getByLabelText('Senha inicial')

    expect(senha).toHaveAttribute('autocomplete', 'off')
    expect(senha).not.toHaveAttribute('type', 'password')
    const regras = within(janela.getByRole('list', { name: 'Regras da senha' }))
    expect(regras.getByText('Uma letra maiúscula').parentElement).toHaveTextContent(': falta')

    escrever(senha, 'Abc')
    expect(regras.getByText('Uma letra maiúscula').parentElement).toHaveTextContent(': atendida')
  })

  it('sem nome, com e-mail torto, senha fraca ou sem perfil, nada é enviado', async () => {
    const enviados = await abrir()
    clicar('Nova pessoa')
    const janela = await janelaAberta('Nova pessoa')

    escrever(janela.getByLabelText('E-mail'), 'duda-sem-arroba')
    escrever(janela.getByLabelText('Senha inicial'), 'fraca')
    fireEvent.click(janela.getByRole('button', { name: 'Cadastrar pessoa' }))

    expect(await janela.findByText('Informe o nome.')).toBeVisible()
    expect(janela.getByText(/Informe um e-mail válido/)).toBeVisible()
    expect(janela.getByText(/A senha precisa de/)).toBeVisible()
    expect(janela.getByText('Escolha um perfil.')).toBeVisible()
    expect(enviados).toEqual([])
  })

  it('e-mail em uso marca o campo, e a janela continua aberta', async () => {
    const enviados = await abrir({
      forcar: { 'POST /users': conflito('USER_EMAIL_TAKEN', 'Este e-mail já está em uso.') },
    })
    clicar('Nova pessoa')
    const janela = await janelaAberta('Nova pessoa')

    escrever(janela.getByLabelText('Nome'), 'Duda')
    escrever(janela.getByLabelText('E-mail'), 'bia@exemplo.com')
    escrever(janela.getByLabelText('Senha inicial'), 'Senha-da-duda')
    fireEvent.change(janela.getByLabelText('Perfil'), { target: { value: 'pf-cozinha' } })
    fireEvent.click(janela.getByRole('button', { name: 'Cadastrar pessoa' }))

    expect(await janela.findByText('Este e-mail já está em uso.')).toBeVisible()
    expect(janela.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true')
    expect(enviados).toHaveLength(1)
  })

  it('no limite do plano, "Nova pessoa" fica desligado e a tela diz por quê', async () => {
    await abrir({ plano: usoDaEquipe(3, 3) })

    expect(screen.getByRole('button', { name: 'Nova pessoa' })).toBeDisabled()
    expect(screen.getByRole('note')).toHaveTextContent(
      'A equipe chegou ao limite de pessoas ativas do plano.',
    )
  })

  it('a recusa do plano, vinda da API, aparece com a mensagem dela', async () => {
    await abrir({
      forcar: {
        'POST /users': conflito('PLAN_USER_LIMIT', 'O plano Grátis permite 3 usuários ativos.'),
      },
    })
    clicar('Nova pessoa')
    const janela = await janelaAberta('Nova pessoa')

    escrever(janela.getByLabelText('Nome'), 'Duda')
    escrever(janela.getByLabelText('E-mail'), 'duda@exemplo.com')
    escrever(janela.getByLabelText('Senha inicial'), 'Senha-da-duda')
    fireEvent.change(janela.getByLabelText('Perfil'), { target: { value: 'pf-cozinha' } })
    fireEvent.click(janela.getByRole('button', { name: 'Cadastrar pessoa' }))

    expect(await janela.findByRole('alert')).toHaveTextContent(
      'O plano Grátis permite 3 usuários ativos.',
    )
  })

  it('edita o nome e o perfil de uma pessoa', async () => {
    const enviados = await abrir()
    clicar('Editar Bia')
    const janela = await janelaAberta('Editar Bia')

    expect(janela.getByText('p-bia@exemplo.com')).toBeVisible()
    expect(janela.getByLabelText('Perfil')).toHaveValue('pf-atendente')
    expect(janela.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled()

    escrever(janela.getByLabelText('Nome'), 'Beatriz')
    fireEvent.change(janela.getByLabelText('Perfil'), { target: { value: 'pf-cozinha' } })
    fireEvent.click(janela.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(enviados).toEqual([
      {
        metodo: 'PATCH',
        caminho: '/users/p-bia',
        corpo: { name: 'Beatriz', profileId: 'pf-cozinha' },
      },
    ])
    expect(cartao('Beatriz').getByText('Cozinha')).toBeVisible()
    expect(screen.getByText('Beatriz: alterações salvas.')).toBeVisible()
  })

  it('o proprietário muda o próprio nome; perfil, ele não tem', async () => {
    const enviados = await abrir()
    clicar('Editar Zé')
    const janela = await janelaAberta('Editar Zé')

    expect(janela.getByText('Proprietário: tem sempre todas as permissões.')).toBeVisible()
    expect(janela.queryByLabelText('Perfil')).toBeNull()

    escrever(janela.getByLabelText('Nome'), 'José')
    fireEvent.click(janela.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => {
      expect(enviados).toEqual([{ metodo: 'PATCH', caminho: '/users/u', corpo: { name: 'José' } }])
    })
  })

  it('quem ficou sem perfil aparece assim, e ganha um pela janela', async () => {
    const enviados = await abrir({ pessoas: [...PESSOAS_COM_O_LEO] })

    expect(cartao('Léo').getByText('Sem perfil')).toBeVisible()
    expect(cartao('Léo').getByText('Entra no painel e não vê nada.')).toBeVisible()

    clicar('Editar Léo')
    const janela = await janelaAberta('Editar Léo')
    expect(janela.getByLabelText('Perfil')).toHaveValue('')
    fireEvent.change(janela.getByLabelText('Perfil'), { target: { value: 'pf-cozinha' } })
    fireEvent.click(janela.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => {
      expect(enviados).toEqual([
        {
          metodo: 'PATCH',
          caminho: '/users/p-leo',
          corpo: { name: 'Léo', profileId: 'pf-cozinha' },
        },
      ])
    })
    expect(await cartao('Léo').findByText('Cozinha')).toBeVisible()
  })

  it('mudar só o nome de quem está sem perfil não envia perfil nenhum', async () => {
    const enviados = await abrir({ pessoas: [...PESSOAS_COM_O_LEO] })

    clicar('Editar Léo')
    const janela = await janelaAberta('Editar Léo')
    escrever(janela.getByLabelText('Nome'), 'Leonardo')
    fireEvent.click(janela.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => {
      expect(enviados).toEqual([
        { metodo: 'PATCH', caminho: '/users/p-leo', corpo: { name: 'Leonardo' } },
      ])
    })
  })

  it('desativar pergunta antes, e a pessoa passa a aparecer desativada', async () => {
    const enviados = await abrir()
    clicar('Desativar Bia')
    const janela = await janelaAberta('Desativar Bia?')

    expect(janela.getByText(/sai do painel na hora e não entra mais/)).toBeVisible()
    expect(enviados).toEqual([])
    fireEvent.click(janela.getByRole('button', { name: 'Desativar' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(enviados).toEqual([
      { metodo: 'POST', caminho: '/users/p-bia/deactivate', corpo: undefined },
    ])
    expect(await cartao('Bia').findByText('Desativada')).toBeVisible()
    expect(screen.getByText('Bia não tem mais acesso ao painel.')).toBeVisible()
  })

  it('fechar a pergunta não desativa ninguém', async () => {
    const enviados = await abrir()
    clicar('Desativar Bia')
    const janela = await janelaAberta('Desativar Bia?')

    fireEvent.click(janela.getByRole('button', { name: 'Fechar' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(enviados).toEqual([])
  })

  it('reativa na hora, sem perguntar', async () => {
    const enviados = await abrir()
    clicar('Reativar Caio')

    await waitFor(() => {
      expect(enviados).toEqual([
        { metodo: 'POST', caminho: '/users/p-caio/reactivate', corpo: undefined },
      ])
    })
    expect(await screen.findByText('Caio voltou a ter acesso ao painel.')).toBeVisible()
    expect(cartao('Caio').queryByText('Desativada')).toBeNull()
  })

  it('reativar sem vaga no plano mostra a recusa da API', async () => {
    await abrir({
      forcar: {
        'POST /users/p-caio/reactivate': conflito(
          'PLAN_USER_LIMIT',
          'O plano Grátis permite 3 usuários ativos.',
        ),
      },
    })
    clicar('Reativar Caio')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O plano Grátis permite 3 usuários ativos.',
    )
    expect(cartao('Caio').getByText('Desativada')).toBeVisible()
  })

  it('falha ao carregar avisa, sem mostrar uma equipe vazia', async () => {
    abrirNaEquipe('', { forcar: { 'GET /users': { status: 500, corpo: {} } } })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar a equipe.',
    )
  })
})

describe('as pessoas, para quem não é o proprietário', () => {
  it('o administrador não mexe na conta do proprietário, nem muda o próprio perfil', async () => {
    const { sessao: comoAdmin, pessoas } = comoPerfil('pf-admin')
    const enviados = abrirNaEquipe('', { pessoas }, comoAdmin)
    await screen.findByRole('heading', { level: 2, name: 'Dona Maria' })

    expect(cartao('Dona Maria').queryByRole('button')).toBeNull()
    // O perfil pronto do administrador não desativa pessoas.
    expect(screen.queryByRole('button', { name: /Desativar|Reativar/ })).toBeNull()

    clicar('Editar Zé')
    const janela = await janelaAberta('Editar Zé')
    expect(janela.getByLabelText('Perfil')).toBeDisabled()
    expect(janela.getByText(/Você não muda o seu próprio perfil/)).toBeVisible()

    escrever(janela.getByLabelText('Nome'), 'José')
    fireEvent.click(janela.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => {
      expect(enviados).toEqual([{ metodo: 'PATCH', caminho: '/users/u', corpo: { name: 'José' } }])
    })
  })

  it('quem não alcança um perfil não edita quem o tem, nem o oferece a ninguém', async () => {
    const recepcao = sessao([
      'users:read',
      'users:create',
      'users:update',
      'users:delete',
      ...permissoesDe('pf-atendente'),
    ])
    abrirNaEquipe('', { pessoas: comoPerfil('pf-atendente').pessoas }, recepcao)
    await screen.findByRole('heading', { level: 2, name: 'Ana' })

    // A Ana é administradora: tem mais do que quem está logado.
    expect(cartao('Ana').queryByRole('button')).toBeNull()
    expect(cartao('Bia').getByRole('button', { name: 'Editar Bia' })).toBeVisible()
    expect(cartao('Bia').getByRole('button', { name: 'Desativar Bia' })).toBeVisible()
    // Ninguém se desativa.
    expect(cartao('Zé').queryByRole('button', { name: /Desativar/ })).toBeNull()

    clicar('Nova pessoa')
    const janela = await janelaAberta('Nova pessoa')
    expect(
      within(janela.getByLabelText('Perfil'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Escolha um perfil', 'Atendente', 'Cozinha'])
  })

  it('quem só vê a equipe não cadastra, não edita nem desativa', async () => {
    abrirNaEquipe('', {}, sessao(['users:read']))
    await screen.findByRole('heading', { level: 2, name: 'Ana' })

    expect(
      screen.queryByRole('button', { name: /Nova pessoa|^Editar|Desativar|Reativar/ }),
    ).toBeNull()
  })
})

// --- Perfis ------------------------------------------------------------------------

describe('os perfis, para o proprietário', () => {
  const abrir = async (api: ApiDaEquipe = {}) => {
    const enviados = abrirNaEquipe('/perfis', api)
    await screen.findByRole('heading', { level: 2, name: 'Atendente' })
    return enviados
  }

  it('lista cada um com o que permite e quantas pessoas o têm', async () => {
    await abrir()

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Administrador',
      'Atendente',
      'Cozinha',
      'Gerente do cardápio',
    ])
    const cozinha = cartao('Cozinha')
    expect(cozinha.getByText('Vê os pedidos, muda o status e marca o que esgotou.')).toBeVisible()
    expect(cozinha.getByText('Pedidos:').parentElement).toHaveTextContent(
      'Pedidos: ver os pedidos, mudar o status dos pedidos',
    )
    expect(cozinha.getByText('1 pessoa com este perfil.')).toBeVisible()
    expect(cartao('Gerente do cardápio').getByText('Ninguém tem este perfil.')).toBeVisible()
    expect(cartao('Gerente do cardápio').getByText('Cardápio:').parentElement).toHaveTextContent(
      'Cardápio: tudo',
    )
    expect(
      screen.getByText(/O proprietário não tem perfil: tem sempre todas as permissões/),
    ).toBeVisible()
  })

  it('cria um perfil: marcar traz o que a permissão exige, e desmarcar leva o que dependia', async () => {
    const enviados = await abrir()
    clicar('Novo perfil')
    const janela = await janelaAberta('Novo perfil')

    escrever(janela.getByLabelText('Nome do perfil'), 'Caixa')
    fireEvent.click(caixa(janela, 'Alterar preços'))
    expect(caixa(janela, 'Ver o cardápio')).toBeChecked()
    fireEvent.click(caixa(janela, 'Cancelar pedidos'))
    expect(caixa(janela, 'Ver os pedidos')).toBeChecked()

    fireEvent.click(caixa(janela, 'Ver o cardápio'))
    expect(caixa(janela, 'Alterar preços')).not.toBeChecked()

    fireEvent.click(janela.getByRole('button', { name: 'Criar perfil' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(enviados).toEqual([
      {
        metodo: 'POST',
        caminho: '/profiles',
        corpo: { name: 'Caixa', description: null, permissions: ['orders:read', 'orders:cancel'] },
      },
    ])
    expect(screen.getByText('Perfil “Caixa” criado.')).toBeVisible()
    expect(cartao('Caixa').getByText('Ninguém tem este perfil.')).toBeVisible()
  })

  it('oferece as permissões por grupo, com a explicação — menos as que ainda não têm tela', async () => {
    await abrir()
    clicar('Novo perfil')
    const janela = await janelaAberta('Novo perfil')

    expect(janela.getAllByRole('group').map((g) => g.querySelector('legend')?.textContent)).toEqual(
      ['Pedidos', 'Cardápio', 'Configurações', 'Equipe'],
    )
    expect(caixa(janela, 'Marcar o que esgotou')).toHaveAccessibleDescription(
      'Produtos e opções dos opcionais.',
    )
    expect(janela.queryByRole('checkbox', { name: 'Ver os clientes' })).toBeNull()
    expect(janela.queryByRole('checkbox', { name: 'Consultar o registro de auditoria' })).toBeNull()
    // O proprietário tem todas: nenhuma fica desligada.
    expect(janela.getAllByRole('checkbox').every((c) => !(c as HTMLInputElement).disabled)).toBe(
      true,
    )
  })

  it('um perfil sem nome não é enviado', async () => {
    const enviados = await abrir()
    clicar('Novo perfil')
    const janela = await janelaAberta('Novo perfil')

    fireEvent.click(janela.getByRole('button', { name: 'Criar perfil' }))

    expect(await janela.findByText('Informe o nome do perfil.')).toBeVisible()
    expect(enviados).toEqual([])
  })

  it('edita um perfil, guardando as permissões que a tela não mostra', async () => {
    const enviados = await abrir()
    clicar('Editar o perfil Atendente')
    const janela = await janelaAberta('Editar perfil')

    expect(janela.getByRole('note')).toHaveTextContent('Uma pessoa tem este perfil.')
    expect(caixa(janela, 'Cancelar pedidos')).toBeChecked()
    const salvar = janela.getByRole('button', { name: 'Salvar alterações' })
    expect(salvar).toBeDisabled()

    fireEvent.click(caixa(janela, 'Cancelar pedidos'))
    expect(salvar).toBeEnabled()
    // De volta ao que estava gravado, não há o que salvar.
    fireEvent.click(caixa(janela, 'Cancelar pedidos'))
    expect(salvar).toBeDisabled()

    fireEvent.click(caixa(janela, 'Cancelar pedidos'))
    fireEvent.click(salvar)

    await waitFor(() => {
      expect(enviados).toHaveLength(1)
    })
    expect(enviados[0]).toEqual({
      metodo: 'PUT',
      caminho: '/profiles/pf-atendente',
      corpo: {
        name: 'Atendente',
        description: 'Acompanha e atualiza os pedidos, e marca o que esgotou.',
        // "Ver os clientes" ainda não tem tela: não aparece, e continua no perfil.
        permissions: [
          'orders:read',
          'orders:update',
          'customers:read',
          'products:read',
          'products:availability',
        ],
      },
    })
    expect(await screen.findByText('Perfil “Atendente” salvo.')).toBeVisible()
  })

  it('nome repetido marca o campo', async () => {
    await abrir({
      forcar: {
        'POST /profiles': conflito('PROFILE_NAME_TAKEN', 'Já existe um perfil com esse nome.'),
      },
    })
    clicar('Novo perfil')
    const janela = await janelaAberta('Novo perfil')

    escrever(janela.getByLabelText('Nome do perfil'), 'Cozinha')
    fireEvent.click(janela.getByRole('button', { name: 'Criar perfil' }))

    expect(await janela.findByText('Já existe um perfil com esse nome.')).toBeVisible()
    expect(janela.getByLabelText('Nome do perfil')).toHaveAttribute('aria-invalid', 'true')
  })

  it('a recusa por alcance, vinda da API, aparece com a mensagem dela', async () => {
    const mensagem = 'O perfil tem permissões que você não tem: Alterar as configurações.'
    await abrir({
      forcar: {
        'POST /profiles': {
          status: 403,
          corpo: { error: { code: 'PROFILE_OUT_OF_REACH', message: mensagem } },
        },
      },
    })
    clicar('Novo perfil')
    const janela = await janelaAberta('Novo perfil')

    escrever(janela.getByLabelText('Nome do perfil'), 'Atalho')
    fireEvent.click(janela.getByRole('button', { name: 'Criar perfil' }))

    expect(await janela.findByRole('alert')).toHaveTextContent(mensagem)
  })

  it('exclui um perfil que ninguém tem, depois de perguntar', async () => {
    const enviados = await abrir()
    clicar('Excluir o perfil Gerente do cardápio')
    const janela = await janelaAberta('Excluir o perfil “Gerente do cardápio”?')

    fireEvent.click(janela.getByRole('button', { name: 'Excluir perfil' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(enviados).toEqual([
      { metodo: 'DELETE', caminho: '/profiles/pf-gerente', corpo: undefined },
    ])
    expect(screen.queryByRole('heading', { level: 2, name: 'Gerente do cardápio' })).toBeNull()
    expect(screen.getByText('Perfil “Gerente do cardápio” excluído.')).toBeVisible()
  })

  it('um perfil com alguém dentro não se exclui: a janela diz o que fazer', async () => {
    const enviados = await abrir()
    clicar('Excluir o perfil Atendente')
    const janela = await janelaAberta('Não dá para excluir o perfil “Atendente”')

    expect(janela.getByText(/Uma pessoa tem este perfil\. Dê outro perfil a ela/)).toBeVisible()
    expect(janela.queryByRole('button', { name: 'Excluir perfil' })).toBeNull()
    expect(enviados).toEqual([])
  })

  it('falha ao carregar avisa', async () => {
    abrirNaEquipe('/perfis', { forcar: { 'GET /profiles': { status: 500, corpo: {} } } })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os perfis.',
    )
  })
})

describe('os perfis, para quem não é o proprietário', () => {
  it('ninguém altera nem exclui o perfil que tem', async () => {
    const { sessao: comoAdmin, pessoas } = comoPerfil('pf-admin')
    abrirNaEquipe('/perfis', { pessoas }, comoAdmin)
    await screen.findByRole('heading', { level: 2, name: 'Administrador' })

    const meu = cartao('Administrador')
    expect(await meu.findByText(/com este perfil — é o seu\./)).toBeVisible()
    expect(meu.queryByRole('button')).toBeNull()
    expect(
      cartao('Atendente').getByRole('button', { name: 'Editar o perfil Atendente' }),
    ).toBeVisible()
  })

  it('quem gerencia perfis sem ter tudo não mexe nos que têm mais, e não dá o que não tem', async () => {
    const recepcao = sessao(['users:read', 'profiles:manage', 'orders:read'])
    abrirNaEquipe(
      '/perfis',
      {
        perfis: [
          ...PERFIS,
          { id: 'pf-portaria', name: 'Portaria', description: null, permissions: ['orders:read'] },
        ],
      },
      recepcao,
    )
    await screen.findByRole('heading', { level: 2, name: 'Portaria' })

    expect(cartao('Atendente').queryByRole('button')).toBeNull()
    expect(cartao('Administrador').queryByRole('button')).toBeNull()

    clicar('Editar o perfil Portaria')
    const janela = await janelaAberta('Editar perfil')
    expect(janela.getByRole('note')).toHaveTextContent(
      'As permissões desligadas são as que o seu perfil não tem',
    )
    expect(caixa(janela, 'Ver os pedidos')).toBeEnabled()
    expect(caixa(janela, 'Ver a equipe e os perfis')).toBeEnabled()
    expect(caixa(janela, 'Cancelar pedidos')).toBeDisabled()
    expect(caixa(janela, 'Alterar preços')).toBeDisabled()
    expect(caixa(janela, 'Alterar as configurações')).toBeDisabled()
  })

  it('quem só vê a equipe vê os perfis, sem criar, editar nem excluir', async () => {
    abrirNaEquipe('/perfis', {}, sessao(['users:read']))
    await screen.findByRole('heading', { level: 2, name: 'Atendente' })

    expect(screen.queryByRole('button', { name: /Novo perfil|^Editar|^Excluir/ })).toBeNull()
  })
})

describe('de uma aba para a outra', () => {
  it('as abas levam das pessoas aos perfis e de volta', async () => {
    abrirNaEquipe('')
    await screen.findByRole('heading', { level: 2, name: 'Ana' })

    fireEvent.click(screen.getByRole('link', { name: 'Perfis' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Cozinha' })).toBeVisible()
    expect(screen.queryByRole('heading', { level: 2, name: 'Ana' })).toBeNull()

    fireEvent.click(screen.getByRole('link', { name: 'Pessoas' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Ana' })).toBeVisible()
  })
})
