import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSessaoStore } from '../src/features/admin/session'
import type { ConviteParaAceitar } from '../src/features/invitation/api'
import {
  abrirComLocal,
  localAtual,
  mockarRotas,
  pararConexaoAoVivo,
  type Resposta,
} from './helpers/pagina'

const TOKEN = '00000000-0000-7000-8000-000000000010.segredo-do-convite'

const CONVITE: ConviteParaAceitar = {
  email: 'duda@exemplo.com',
  establishment: { name: 'Lanchonete do Zé', slug: 'lanchonete-do-ze' },
  profile: 'Atendente',
  invitedBy: 'Zé Proprietário',
  accountExists: false,
}

const SESSAO = {
  accessToken: 'token-de-acesso',
  user: {
    id: 'u-duda',
    tenantId: 't',
    name: 'Duda',
    email: 'duda@exemplo.com',
    permissions: ['orders:read'],
  },
  establishment: { id: 't', slug: 'lanchonete-do-ze', name: 'Lanchonete do Zé', status: 'ACTIVE' },
}

/** A API do convite: a consulta e o aceite, e o mínimo do painel para onde o aceite leva. */
function abrirConvite(
  consulta: Resposta = { status: 200, corpo: CONVITE },
  aceite: Resposta = { status: 200, corpo: SESSAO },
) {
  const fetch = mockarRotas((url, metodo) => {
    if (url.endsWith('/auth/invitation') && metodo === 'POST') return consulta
    if (url.endsWith('/auth/invitation/accept') && metodo === 'POST') return aceite
    if (url.endsWith('/admin/orders/summary'))
      return { status: 200, corpo: { new: 0, inProgress: 0, completedToday: 0 } }
    return { status: 200, corpo: {} }
  })
  abrirComLocal(`/convite#token=${TOKEN}`)
  return fetch
}

const corpoDe = (fetch: ReturnType<typeof abrirConvite>, trecho: string) => {
  const chamada = fetch.mock.calls.find(([url]) => url.endsWith(trecho))
  const corpo = chamada?.[1]?.body
  return typeof corpo === 'string' ? (JSON.parse(corpo) as unknown) : undefined
}

const escrever = (rotulo: string, valor: string) => {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } })
}

beforeEach(() => {
  localStorage.clear()
  useSessaoStore.setState({ slug: null, estabelecimento: null, usuario: null, accessToken: null })
  pararConexaoAoVivo()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('o convite pelo link', () => {
  it('mostra quem convidou, para onde e com que perfil — e tira o token do endereço', async () => {
    const fetch = abrirConvite()

    expect(await screen.findByRole('heading', { name: 'Convite para a equipe' })).toBeVisible()
    expect(screen.getByText(/Zé Proprietário convidou você para a equipe de/)).toHaveTextContent(
      'Lanchonete do Zé, com o perfil Atendente.',
    )
    expect(localAtual()).toBe('/convite')

    // O token vai no corpo, nunca na URL — URL acaba em log.
    const [url] = fetch.mock.calls[0] ?? []
    expect(url).not.toContain('segredo')
    expect(corpoDe(fetch, '/auth/invitation')).toEqual({ token: TOKEN })
  })

  it('sem conta: cria a conta com o nome e a senha, e entra no painel do estabelecimento', async () => {
    const fetch = abrirConvite()
    await screen.findByRole('heading', { name: 'Convite para a equipe' })

    expect(screen.getByLabelText('E-mail')).toHaveValue('duda@exemplo.com')
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('readonly')
    const regras = within(screen.getByRole('list', { name: 'Regras da senha' }))
    expect(screen.getByLabelText('Crie uma senha')).toHaveAttribute('autocomplete', 'new-password')

    escrever('Seu nome', '  Duda  ')
    escrever('Crie uma senha', 'Senha-da-duda-1')
    expect(regras.getByText('Uma letra maiúscula').parentElement).toHaveTextContent(': atendida')
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta e entrar' }))

    await waitFor(() => {
      expect(localAtual()).toBe('/lanchonete-do-ze/admin')
    })
    expect(corpoDe(fetch, '/auth/invitation/accept')).toEqual({
      token: TOKEN,
      name: 'Duda',
      password: 'Senha-da-duda-1',
    })
    // Com o cookie, como no login: a sessão vem dele.
    const aceite = fetch.mock.calls.find(([url]) => url.endsWith('/auth/invitation/accept'))
    expect(aceite?.[1]?.credentials).toBe('include')
    expect(useSessaoStore.getState().slug).toBe('lanchonete-do-ze')
  })

  it('sem conta: sem nome ou com senha fraca, nada é enviado', async () => {
    const fetch = abrirConvite()
    await screen.findByRole('heading', { name: 'Convite para a equipe' })

    escrever('Crie uma senha', 'fraca')
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta e entrar' }))

    expect(await screen.findByText('Informe o seu nome.')).toBeVisible()
    expect(screen.getByText(/A senha precisa de/)).toBeVisible()
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/accept'))).toBe(false)
  })

  it('com conta: pede só a senha dela, e a senha errada marca o campo', async () => {
    const fetch = abrirConvite(
      { status: 200, corpo: { ...CONVITE, accountExists: true } },
      {
        status: 401,
        corpo: {
          error: {
            code: 'UNAUTHORIZED',
            message: 'A senha não confere. Use a senha da sua conta.',
          },
        },
      },
    )
    await screen.findByRole('heading', { name: 'Convite para a equipe' })

    expect(screen.getByText(/Você já tem conta no .*Entre com a sua senha/)).toBeVisible()
    expect(screen.queryByLabelText('Seu nome')).toBeNull()
    expect(screen.queryByRole('list', { name: 'Regras da senha' })).toBeNull()
    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'current-password')

    escrever('Senha', 'senha-de-sempre')
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar e entrar' }))

    expect(await screen.findByText('A senha não confere. Use a senha da sua conta.')).toBeVisible()
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-invalid', 'true')
    expect(corpoDe(fetch, '/auth/invitation/accept')).toEqual({
      token: TOKEN,
      password: 'senha-de-sempre',
    })
    expect(localAtual()).toBe('/convite')
  })

  it('a recusa do plano, vinda da API, aparece com a mensagem dela', async () => {
    abrirConvite(undefined, {
      status: 409,
      corpo: {
        error: {
          code: 'PLAN_USER_LIMIT',
          message: 'O plano Grátis permite 2 usuários ativos, contando os convites pendentes.',
        },
      },
    })
    await screen.findByRole('heading', { name: 'Convite para a equipe' })
    escrever('Seu nome', 'Duda')
    escrever('Crie uma senha', 'Senha-da-duda-1')
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta e entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('O plano Grátis permite 2')
  })

  it('o convite vencido ou que não vale mais explica, e oferece entrar', async () => {
    abrirConvite({
      status: 400,
      corpo: {
        error: {
          code: 'INVITATION_EXPIRED',
          message: 'Este convite venceu. Peça outro a quem convidou você.',
        },
      },
    })

    expect(await screen.findByRole('heading', { name: 'Este convite venceu' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Peça outro a quem convidou você.')
    expect(screen.getByRole('link', { name: 'Entrar no painel' })).toHaveAttribute(
      'href',
      '/entrar',
    )
  })

  it('o convite já aceito ou cancelado não vale mais', async () => {
    abrirConvite({
      status: 400,
      corpo: {
        error: {
          code: 'INVITATION_INVALID',
          message: 'Este convite não vale mais. Se você já o aceitou, é só entrar.',
        },
      },
    })

    expect(await screen.findByRole('heading', { name: 'Este convite não vale mais' })).toBeVisible()
  })

  it('sem o token no link, pede para abrir de novo, sem chamar a API', async () => {
    const fetch = mockarRotas(() => ({ status: 200, corpo: {} }))
    abrirComLocal('/convite')

    expect(await screen.findByRole('heading', { name: 'Link incompleto' })).toBeVisible()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sem conexão, oferece tentar de novo', async () => {
    abrirConvite('falha-de-rede')

    expect(
      await screen.findByRole('heading', { name: 'Não deu para abrir o convite agora' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeVisible()
  })
})
