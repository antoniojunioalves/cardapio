import { VERSAO_DOS_TERMOS } from '@repo/shared'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSessaoStore } from '../src/features/admin/session'
import { abrir, mockarRotas, pararConexaoAoVivo, type Resposta } from './helpers/pagina'

const DONO = {
  id: '00000000-0000-7000-8000-000000000011',
  tenantId: '00000000-0000-7000-8000-000000000010',
  name: 'Maria Dona',
  email: 'maria@exemplo.com',
  // O dono tem tudo — inclusive o que o aviso de confirmação pede.
  permissions: ['orders:read', 'orders:update', 'settings:read', 'settings:update'],
}

function cadastrado(slug: string, emailEnviado = true) {
  return {
    status: 201,
    corpo: {
      accessToken: 'token-de-acesso',
      user: DONO,
      establishment: { id: DONO.tenantId, slug, name: 'Lanchonete da Maria', status: 'PENDING' },
      confirmationEmailSent: emailEnviado,
    },
  }
}

interface Api {
  /** Endereços já em uso, para a consulta de disponibilidade. */
  emUso?: string[]
  cadastro?: Resposta
}

function mockarApi(api: Api = {}) {
  return mockarRotas((url, metodo) => {
    if (url.includes('/signup/slug-availability')) {
      const slug = new URL(url).searchParams.get('slug') ?? ''
      const livre = !(api.emUso ?? []).includes(slug)
      return {
        status: 200,
        corpo: {
          slug,
          available: livre,
          reason: livre ? null : 'Este endereço já está em uso. Escolha outro.',
        },
      }
    }
    if (url.endsWith('/public/signup') && metodo === 'POST') {
      return api.cadastro ?? cadastrado('lanchonete-da-maria')
    }
    if (url.endsWith('/admin/email-confirmation')) {
      return { status: 200, corpo: { status: 'PENDING', email: DONO.email } }
    }
    if (url.endsWith('/admin/plan')) {
      return {
        status: 200,
        corpo: {
          plan: { code: 'FREE', name: 'Gratuito' },
          orders: { used: 0, limit: 100, ceiling: 110, state: 'LIVRE' },
          users: { active: 1, limit: 2 },
        },
      }
    }
    if (url.endsWith('/admin/setup-checklist'))
      return { status: 200, corpo: { ready: true, steps: [] } }
    if (url.endsWith('/admin/orders/summary')) {
      return { status: 200, corpo: { new: 0, inProgress: 0, completedToday: 0 } }
    }
    if (url.includes('/admin/orders')) return { status: 200, corpo: [] }
    return { status: 404, corpo: { error: { code: 'NOT_FOUND' } } }
  })
}

const escrever = (rotulo: string, valor: string) => {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } })
}

function preencher() {
  escrever('Nome do estabelecimento', 'Lanchonete da Maria')
  escrever('Seu nome', 'Maria Dona')
  escrever('E-mail', 'maria@exemplo.com')
  escrever('Senha', 'Senha-forte-123')
  fireEvent.click(screen.getByRole('checkbox', { name: /Li e aceito/ }))
}

const enviar = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta grátis' }))
}

beforeEach(() => {
  localStorage.clear()
  useSessaoStore.setState({ slug: null, usuario: null, accessToken: null })
  pararConexaoAoVivo()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cadastro', () => {
  it('sugere o endereço a partir do nome e diz se está livre', async () => {
    const fetch = mockarApi()
    abrir('/cadastro')

    escrever('Nome do estabelecimento', 'Lanchonete da Maria')

    expect(screen.getByLabelText('Endereço do cardápio')).toHaveValue('lanchonete-da-maria')
    expect(await screen.findByText('Endereço livre.')).toBeVisible()
    expect(
      fetch.mock.calls.some(([url]) => url.endsWith('slug-availability?slug=lanchonete-da-maria')),
    ).toBe(true)
  })

  it('endereço em uso aparece antes de enviar', async () => {
    mockarApi({ emUso: ['lanchonete-da-maria'] })
    abrir('/cadastro')

    escrever('Nome do estabelecimento', 'Lanchonete da Maria')

    expect(await screen.findByText('Este endereço já está em uso. Escolha outro.')).toBeVisible()
  })

  it('mexer no endereço para de acompanhar o nome; apagá-lo volta a acompanhar', () => {
    mockarApi()
    abrir('/cadastro')
    const endereco = screen.getByLabelText('Endereço do cardápio')

    escrever('Nome do estabelecimento', 'Lanchonete')
    escrever('Endereço do cardápio', 'meu-endereco')
    escrever('Nome do estabelecimento', 'Lanchonete da Maria')
    expect(endereco).toHaveValue('meu-endereco')

    escrever('Endereço do cardápio', '')
    escrever('Nome do estabelecimento', 'Lanchonete da Maria!')
    expect(endereco).toHaveValue('lanchonete-da-maria')
  })

  it('enviar vazio aponta tudo o que falta, inclusive o aceite, e nada é enviado', async () => {
    const fetch = mockarApi()
    abrir('/cadastro')

    enviar()

    expect(await screen.findByText('Informe o nome do estabelecimento.')).toBeVisible()
    expect(screen.getByText('Informe o seu nome.')).toBeVisible()
    expect(screen.getByText('Informe um e-mail válido, como voce@exemplo.com.')).toBeVisible()
    expect(screen.getByText('A senha precisa de pelo menos 8 caracteres.')).toBeVisible()
    expect(
      screen.getByText('Para criar a conta, aceite os termos de uso e a política de privacidade.'),
    ).toBeVisible()
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('a senha mostra, enquanto se digita, o que ainda falta', () => {
    mockarApi()
    abrir('/cadastro')
    const regras = () => screen.getByRole('list', { name: 'Regras da senha' })

    escrever('Senha', 'abc')
    expect(regras()).toHaveTextContent('Uma letra minúscula: atendida')
    expect(regras()).toHaveTextContent('Uma letra maiúscula: falta')
    expect(regras()).toHaveTextContent('Pelo menos 8 caracteres: falta')
    expect(regras()).toHaveTextContent('Um caractere especial, como ! @ # ou -: falta')

    escrever('Senha', 'Abcdef-1')
    expect(regras()).not.toHaveTextContent('falta')
  })

  it('senha sem caractere especial é recusada antes de ir à API, dizendo o que falta', async () => {
    const fetch = mockarApi()
    abrir('/cadastro')
    preencher()
    escrever('Senha', 'SenhaForte123')

    enviar()

    expect(
      await screen.findByText('A senha precisa de um caractere especial, como ! @ # ou -.'),
    ).toBeVisible()
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('endereço reservado é recusado com o motivo, antes de ir à API', async () => {
    mockarApi()
    abrir('/cadastro')
    preencher()
    escrever('Endereço do cardápio', 'termos')

    enviar()

    expect(await screen.findByText('Este endereço é reservado. Escolha outro.')).toBeVisible()
  })

  it('cadastra, abre a sessão e cai no painel com o aviso de confirmar o e-mail', async () => {
    const fetch = mockarApi()
    abrir('/cadastro')
    preencher()

    enviar()

    // O cadastro já abre o painel, no Início — é lá que ficam os avisos do estabelecimento.
    expect(await screen.findByRole('heading', { level: 1, name: 'Olá, Maria' })).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Seu cardápio ainda não está no ar' }),
    ).toBeVisible()
    expect(screen.getByText(DONO.email)).toBeVisible()
    expect(useSessaoStore.getState().slug).toBe('lanchonete-da-maria')

    const [, envio] =
      fetch.mock.calls.find(
        ([url, init]) => url.endsWith('/public/signup') && init?.method === 'POST',
      ) ?? []
    // O refresh token vem num cookie: sem `credentials`, o navegador o descartaria.
    expect(envio?.credentials).toBe('include')
    const corpo = JSON.parse(typeof envio?.body === 'string' ? envio.body : '') as Record<
      string,
      unknown
    >
    expect(corpo).toMatchObject({
      establishmentName: 'Lanchonete da Maria',
      slug: 'lanchonete-da-maria',
      ownerName: 'Maria Dona',
      email: 'maria@exemplo.com',
      password: 'Senha-forte-123',
      termsVersion: VERSAO_DOS_TERMOS,
    })
    expect(corpo).not.toHaveProperty('aceite')
    // O fuso deste aparelho vai junto, quando o Intl o reconhece.
    expect(corpo.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })

  it('e-mail que não saiu no cadastro: o painel avisa e pede o reenvio', async () => {
    mockarApi({ cadastro: cadastrado('lanchonete-da-maria', false) })
    abrir('/cadastro')
    preencher()

    enviar()

    expect(await screen.findByText(/Não conseguimos enviar o e-mail no cadastro/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Reenviar e-mail' })).toBeEnabled()
  })

  it('endereço tomado no instante do envio vira erro no próprio campo', async () => {
    mockarApi({
      cadastro: {
        status: 409,
        corpo: {
          error: { code: 'SLUG_TAKEN', message: 'Este endereço já está em uso. Escolha outro.' },
        },
      },
    })
    abrir('/cadastro')
    preencher()

    enviar()

    await waitFor(() => {
      expect(screen.getByLabelText('Endereço do cardápio')).toHaveAttribute('aria-invalid', 'true')
    })
    expect(screen.getByText('Este endereço já está em uso. Escolha outro.')).toBeVisible()
    expect(useSessaoStore.getState().slug).toBeNull()
  })

  it('e-mail que já tem conta vira erro no próprio campo, com o caminho para entrar', async () => {
    mockarApi({
      cadastro: {
        status: 409,
        corpo: {
          error: {
            code: 'EMAIL_TAKEN',
            message: 'Este e-mail já tem uma conta. Entre para acessar o painel.',
          },
        },
      },
    })
    abrir('/cadastro')
    preencher()

    enviar()

    await waitFor(() => {
      expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true')
    })
    expect(
      screen.getByText('Este e-mail já tem uma conta. Entre para acessar o painel.'),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Entrar no painel' })).toHaveAttribute(
      'href',
      '/entrar',
    )
    expect(useSessaoStore.getState().slug).toBeNull()

    // Corrigido o e-mail, o atalho para entrar some junto com o erro.
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'outra@exemplo.com' } })
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Entrar no painel' })).not.toBeInTheDocument()
    })
  })

  it('termos que mudaram enquanto a página estava aberta pedem um novo aceite', async () => {
    mockarApi({
      cadastro: {
        status: 400,
        corpo: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dados inválidos.',
            details: [
              {
                instancePath: '/termsVersion',
                message:
                  'Os termos mudaram desde que a página abriu. Leia a versão atual e aceite de novo.',
              },
            ],
          },
        },
      },
    })
    abrir('/cadastro')
    preencher()

    enviar()

    expect(await screen.findByText(/Os termos mudaram desde que a página abriu/)).toBeVisible()
    expect(screen.getByRole('checkbox', { name: /Li e aceito/ })).not.toBeChecked()
  })

  it('muitos cadastros da mesma rede: diz para esperar', async () => {
    mockarApi({ cadastro: { status: 429, corpo: { error: { code: 'RATE_LIMITED' } } } })
    abrir('/cadastro')
    preencher()

    enviar()

    expect(await screen.findByRole('alert')).toHaveTextContent('Tente de novo mais tarde.')
  })

  it('o campo-armadilha fica fora do alcance de quem usa teclado ou leitor de tela', () => {
    mockarApi()
    abrir('/cadastro')

    const armadilha = screen.getByLabelText('Deixe este campo em branco')
    expect(armadilha).toHaveAttribute('tabindex', '-1')
    expect(armadilha.closest('[aria-hidden="true"]')).not.toBeNull()
  })
})
