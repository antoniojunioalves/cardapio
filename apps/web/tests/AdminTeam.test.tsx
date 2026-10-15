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
  prazoDoConvite,
  quantasPessoas,
  resumoDoPerfil,
  ultimoAcesso,
} from '../src/features/admin/team'
import { conflito, sessao } from './helpers/cardapio-admin'
import {
  abrirNaEquipe,
  comoPerfil,
  convite,
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
/** O cartão de um convite pendente, pelo e-mail. */
const cartaoDoConvite = (email: string) =>
  within(screen.getByText(email).closest('li') as HTMLElement)
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
    // Um convite pendente é uma vaga prometida.
    expect(equipeNoPlano(usoDaEquipe(2, 3, 1))).toEqual({
      texto: '3 de 3 pessoas ativas do plano Grátis, contando 1 convite pendente.',
      noLimite: true,
    })
    expect(equipeNoPlano(usoDaEquipe(1, 5, 2))?.texto).toBe(
      '3 de 5 pessoas ativas do plano Grátis, contando 2 convites pendentes.',
    )
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

  it('o prazo do convite', () => {
    const agora = new Date('2026-10-14T12:00:00Z').getTime()
    expect(prazoDoConvite({ expiresAt: '2026-10-21T12:00:00.000Z' }, agora)).toMatch(
      /^Vale até \d{2}\/\d{2}\/2026$/,
    )
    expect(prazoDoConvite({ expiresAt: '2026-10-10T12:00:00.000Z' }, agora)).toMatch(
      /^Venceu em \d{2}\/\d{2}\/2026$/,
    )
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
    // O proprietário não tem perfil para mudar, e ninguém o desativa — nem ele.
    expect(ze.queryByRole('button')).toBeNull()

    const bia = cartao('Bia')
    expect(bia.getByText('Atendente')).toBeVisible()
    expect(bia.getByText(/^Último acesso em/)).toBeVisible()
    expect(bia.queryByText('Você')).toBeNull()
    expect(bia.getByRole('button', { name: 'Editar Bia' })).toBeVisible()
    expect(bia.getByRole('button', { name: 'Desativar Bia' })).toBeVisible()

    const caio = cartao('Caio')
    expect(caio.getByText('Desativada')).toBeVisible()
    expect(caio.getByText('Ainda não entrou no painel')).toBeVisible()
    expect(caio.getByRole('button', { name: 'Reativar Caio' })).toBeVisible()
    expect(caio.queryByRole('button', { name: 'Desativar Caio' })).toBeNull()
  })

  it('convida uma pessoa com o e-mail e o perfil, e o convite aparece pendente', async () => {
    const enviados = await abrir()
    clicar('Convidar pessoa')
    const janela = await janelaAberta('Convidar pessoa')

    escrever(janela.getByLabelText('E-mail'), 'Duda@Exemplo.com')
    fireEvent.change(janela.getByLabelText('Perfil'), { target: { value: 'pf-cozinha' } })
    fireEvent.click(janela.getByRole('button', { name: 'Enviar convite' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(enviados).toEqual([
      {
        metodo: 'POST',
        caminho: '/invitations',
        corpo: { email: 'Duda@Exemplo.com', profileId: 'pf-cozinha' },
      },
    ])
    expect(
      screen.getByText(
        'Convite enviado para duda@exemplo.com. A pessoa entra pelo link do e-mail.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('heading', { level: 2, name: 'Convites pendentes' })).toBeVisible()
    const pendente = await screen.findByText('duda@exemplo.com')
    const doConvite = within(pendente.closest('li') as HTMLElement)
    expect(doConvite.getByText('Cozinha')).toBeVisible()
    expect(doConvite.getByText('Aguardando aceite')).toBeVisible()
    expect(doConvite.getByText(/^Vale até .* · Enviado por Zé$/)).toBeVisible()
  })

  it('a janela do convite não pede nome nem senha: são da pessoa', async () => {
    await abrir()
    clicar('Convidar pessoa')
    const janela = await janelaAberta('Convidar pessoa')

    expect(janela.queryByLabelText('Nome')).toBeNull()
    expect(janela.queryByLabelText(/Senha/)).toBeNull()
    expect(janela.getByText(/entra com a mesma senha de lá/)).toBeVisible()
  })

  it('com e-mail torto ou sem perfil, nada é enviado', async () => {
    const enviados = await abrir()
    clicar('Convidar pessoa')
    const janela = await janelaAberta('Convidar pessoa')

    escrever(janela.getByLabelText('E-mail'), 'duda-sem-arroba')
    fireEvent.click(janela.getByRole('button', { name: 'Enviar convite' }))

    expect(await janela.findByText(/Informe um e-mail válido/)).toBeVisible()
    expect(janela.getByText('Escolha um perfil.')).toBeVisible()
    expect(enviados).toEqual([])
  })

  it('e-mail que já está na equipe marca o campo, e a janela continua aberta', async () => {
    const enviados = await abrir({
      forcar: {
        'POST /invitations': conflito('USER_ALREADY_MEMBER', 'Esta pessoa já está na equipe.'),
      },
    })
    clicar('Convidar pessoa')
    const janela = await janelaAberta('Convidar pessoa')

    escrever(janela.getByLabelText('E-mail'), 'p-bia@exemplo.com')
    fireEvent.change(janela.getByLabelText('Perfil'), { target: { value: 'pf-cozinha' } })
    fireEvent.click(janela.getByRole('button', { name: 'Enviar convite' }))

    expect(await janela.findByText('Esta pessoa já está na equipe.')).toBeVisible()
    expect(janela.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true')
    expect(enviados).toHaveLength(1)
  })

  it('no limite do plano, "Convidar pessoa" fica desligado e a tela diz por quê', async () => {
    await abrir({ plano: usoDaEquipe(2, 3, 1) })

    expect(screen.getByRole('button', { name: 'Convidar pessoa' })).toBeDisabled()
    expect(screen.getByRole('note')).toHaveTextContent(
      'A equipe chegou ao limite de pessoas do plano, contando os convites pendentes.',
    )
  })

  it('a recusa do plano, vinda da API, aparece com a mensagem dela', async () => {
    await abrir({
      forcar: {
        'POST /invitations': conflito(
          'PLAN_USER_LIMIT',
          'O plano Grátis permite 3 usuários ativos, contando os convites pendentes.',
        ),
      },
    })
    clicar('Convidar pessoa')
    const janela = await janelaAberta('Convidar pessoa')

    escrever(janela.getByLabelText('E-mail'), 'duda@exemplo.com')
    fireEvent.change(janela.getByLabelText('Perfil'), { target: { value: 'pf-cozinha' } })
    fireEvent.click(janela.getByRole('button', { name: 'Enviar convite' }))

    expect(await janela.findByRole('alert')).toHaveTextContent(
      'O plano Grátis permite 3 usuários ativos, contando os convites pendentes.',
    )
  })

  it('o e-mail que não saiu vira um aviso para reenviar', async () => {
    await abrir({
      forcar: {
        'POST /invitations': {
          status: 201,
          corpo: {
            invitation: convite({ id: 'cv-x', email: 'duda@exemplo.com' }),
            emailSent: false,
          },
        },
      },
    })
    clicar('Convidar pessoa')
    const janela = await janelaAberta('Convidar pessoa')
    escrever(janela.getByLabelText('E-mail'), 'duda@exemplo.com')
    fireEvent.change(janela.getByLabelText('Perfil'), { target: { value: 'pf-atendente' } })
    fireEvent.click(janela.getByRole('button', { name: 'Enviar convite' }))

    expect(await screen.findByRole('note')).toHaveTextContent(
      'O convite para duda@exemplo.com está feito, mas o e-mail não saiu.',
    )
  })

  it('reenviar manda um link novo; cancelar pergunta antes e tira o convite da lista', async () => {
    const enviados = await abrir({
      convites: [
        convite({ id: 'cv-1', email: 'duda@exemplo.com' }),
        convite({ id: 'cv-2', email: 'eva@exemplo.com', expiresAt: '2026-10-01T12:00:00.000Z' }),
      ],
    })
    await screen.findByText('duda@exemplo.com')
    expect(cartaoDoConvite('eva@exemplo.com').getByText('Vencido')).toBeVisible()
    expect(cartaoDoConvite('eva@exemplo.com').getByText(/^Venceu em/)).toBeVisible()

    clicar('Reenviar o convite para eva@exemplo.com')
    expect(
      await screen.findByText('Convite reenviado para eva@exemplo.com, com um link novo.'),
    ).toBeVisible()

    clicar('Cancelar o convite para duda@exemplo.com')
    const janela = await janelaAberta('Cancelar o convite para duda@exemplo.com?')
    expect(janela.getByText(/O link do e-mail deixa de valer/)).toBeVisible()
    fireEvent.click(janela.getByRole('button', { name: 'Cancelar convite' }))

    expect(await screen.findByText('O convite para duda@exemplo.com foi cancelado.')).toBeVisible()
    await waitFor(() => {
      expect(screen.queryByText('duda@exemplo.com')).toBeNull()
    })
    expect(enviados).toEqual([
      { metodo: 'POST', caminho: '/invitations/cv-2/resend', corpo: undefined },
      { metodo: 'DELETE', caminho: '/invitations/cv-1', corpo: undefined },
    ])
  })

  it('reenviar cedo demais mostra a recusa da API', async () => {
    await abrir({
      convites: [convite({ id: 'cv-1', email: 'duda@exemplo.com' })],
      forcar: {
        'POST /invitations/cv-1/resend': {
          status: 429,
          corpo: {
            error: {
              code: 'RESEND_TOO_SOON',
              message: 'Aguarde 40 segundos para reenviar este convite.',
            },
          },
        },
      },
    })
    await screen.findByText('duda@exemplo.com')
    clicar('Reenviar o convite para duda@exemplo.com')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Aguarde 40 segundos para reenviar este convite.',
    )
  })

  it('muda o perfil de uma pessoa; o nome e o e-mail são da conta dela', async () => {
    const enviados = await abrir()
    clicar('Editar Bia')
    const janela = await janelaAberta('Perfil de Bia')

    expect(janela.getByText('p-bia@exemplo.com')).toBeVisible()
    expect(janela.getByText('São da conta da pessoa: só ela os muda.')).toBeVisible()
    expect(janela.queryByRole('textbox')).toBeNull()
    expect(janela.getByLabelText('Perfil')).toHaveValue('pf-atendente')
    expect(janela.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled()

    fireEvent.change(janela.getByLabelText('Perfil'), { target: { value: 'pf-cozinha' } })
    fireEvent.click(janela.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(enviados).toEqual([
      { metodo: 'PATCH', caminho: '/users/p-bia', corpo: { profileId: 'pf-cozinha' } },
    ])
    expect(cartao('Bia').getByText('Cozinha')).toBeVisible()
    expect(screen.getByText('Bia: perfil salvo.')).toBeVisible()
  })

  it('quem ficou sem perfil aparece assim, e ganha um pela janela', async () => {
    const enviados = await abrir({ pessoas: [...PESSOAS_COM_O_LEO] })

    expect(cartao('Léo').getByText('Sem perfil')).toBeVisible()
    expect(cartao('Léo').getByText('Entra no painel e não vê nada.')).toBeVisible()

    clicar('Editar Léo')
    const janela = await janelaAberta('Perfil de Léo')
    expect(janela.getByLabelText('Perfil')).toHaveValue('')
    fireEvent.change(janela.getByLabelText('Perfil'), { target: { value: 'pf-cozinha' } })
    fireEvent.click(janela.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => {
      expect(enviados).toEqual([
        { metodo: 'PATCH', caminho: '/users/p-leo', corpo: { profileId: 'pf-cozinha' } },
      ])
    })
    expect(await cartao('Léo').findByText('Cozinha')).toBeVisible()
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
    abrirNaEquipe('', { pessoas }, comoAdmin)
    await screen.findByRole('heading', { level: 2, name: 'Dona Maria' })

    expect(cartao('Dona Maria').queryByRole('button')).toBeNull()
    expect(cartao('Zé').queryByRole('button')).toBeNull()
    expect(cartao('Bia').getByRole('button', { name: 'Editar Bia' })).toBeVisible()
    // O perfil pronto do administrador não desativa pessoas.
    expect(screen.queryByRole('button', { name: /Desativar|Reativar/ })).toBeNull()
  })

  it('quem não alcança um perfil não edita quem o tem, nem o oferece a ninguém', async () => {
    const recepcao = sessao([
      'users:read',
      'users:create',
      'users:update',
      'users:delete',
      ...permissoesDe('pf-atendente'),
    ])
    abrirNaEquipe(
      '',
      {
        pessoas: comoPerfil('pf-atendente').pessoas,
        convites: [
          convite({
            id: 'cv-a',
            email: 'admin@exemplo.com',
            profile: { id: 'pf-admin', name: 'Administrador' },
          }),
          convite({ id: 'cv-b', email: 'atende@exemplo.com' }),
        ],
      },
      recepcao,
    )
    await screen.findByRole('heading', { level: 2, name: 'Ana' })
    await screen.findByText('admin@exemplo.com')

    // O convite para administrador está acima de quem está logado: nem reenvia, nem cancela.
    expect(cartaoDoConvite('admin@exemplo.com').queryByRole('button')).toBeNull()
    expect(
      cartaoDoConvite('atende@exemplo.com').getByRole('button', { name: /^Reenviar/ }),
    ).toBeVisible()

    // A Ana é administradora: tem mais do que quem está logado.
    expect(cartao('Ana').queryByRole('button')).toBeNull()
    expect(cartao('Bia').getByRole('button', { name: 'Editar Bia' })).toBeVisible()
    expect(cartao('Bia').getByRole('button', { name: 'Desativar Bia' })).toBeVisible()
    // Ninguém se desativa.
    expect(cartao('Zé').queryByRole('button', { name: /Desativar/ })).toBeNull()

    clicar('Convidar pessoa')
    const janela = await janelaAberta('Convidar pessoa')
    expect(
      within(janela.getByLabelText('Perfil'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Escolha um perfil', 'Atendente', 'Cozinha'])
  })

  it('quem só vê a equipe vê os convites, mas não convida, não edita nem desativa', async () => {
    abrirNaEquipe(
      '',
      { convites: [convite({ id: 'cv-1', email: 'duda@exemplo.com' })] },
      sessao(['users:read']),
    )
    await screen.findByRole('heading', { level: 2, name: 'Ana' })
    expect(await screen.findByText('duda@exemplo.com')).toBeVisible()

    expect(
      screen.queryByRole('button', {
        name: /Convidar pessoa|^Editar|Desativar|Reativar|^Reenviar|^Cancelar/,
      }),
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
