import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renovarSessao, trocarSenha, useSessaoStore } from '../src/features/admin/session'
import { ADMIN, sessao } from './helpers/cardapio-admin'
import {
  abrirComLocal,
  localAtual,
  mockarRotas,
  pararConexaoAoVivo,
  type Resposta,
} from './helpers/pagina'

/** A sessão nova que a troca de senha devolve. */
const SESSAO_NOVA = { ...sessao([]), accessToken: 'token-depois-da-troca' }

interface Api {
  nome?: Resposta
  senha?: Resposta
}

/** O painel em "Minha conta", com a API simulada. Devolve o mock, para conferir o que foi enviado. */
function abrirMinhaConta(api: Api = {}, permissoes: string[] = []) {
  const fetch = mockarRotas((url, metodo, corpo) => {
    if (url.endsWith('/auth/account') && metodo === 'PATCH') {
      return (
        api.nome ?? {
          status: 200,
          corpo: { ...sessao(permissoes).user, name: (corpo as { name: string }).name },
        }
      )
    }
    if (url.endsWith('/auth/account/password'))
      return api.senha ?? { status: 200, corpo: SESSAO_NOVA }
    if (url.endsWith('/auth/establishments')) return { status: 200, corpo: [] }
    if (url.endsWith('/admin/orders/summary')) {
      return { status: 200, corpo: { new: 0, inProgress: 0, completedToday: 0 } }
    }
    return { status: 200, corpo: {} }
  })
  useSessaoStore.getState().guardar(sessao(permissoes))
  abrirComLocal(`${ADMIN}/minha-conta`)
  return fetch
}

const corpoDe = (fetch: ReturnType<typeof abrirMinhaConta>, trecho: string) => {
  const chamada = fetch.mock.calls.find(([url]) => url.endsWith(trecho))
  const corpo = chamada?.[1]?.body
  return typeof corpo === 'string' ? (JSON.parse(corpo) as unknown) : undefined
}

const escrever = (rotulo: string, valor: string) => {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } })
}

const recusa = (code: string, message: string): Resposta => ({
  status: 400,
  corpo: { error: { code, message } },
})

beforeEach(() => {
  localStorage.clear()
  useSessaoStore.setState({ slug: null, estabelecimento: null, usuario: null, accessToken: null })
  pararConexaoAoVivo()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('o caminho até "Minha conta"', () => {
  it('o menu leva todo mundo até ela, mesmo quem não tem permissão nenhuma', async () => {
    abrirMinhaConta()

    expect(await screen.findByRole('heading', { level: 1, name: 'Minha conta' })).toBeVisible()
    const menu = within(screen.getByRole('navigation', { name: 'Painel' }))
    expect(menu.getByRole('link', { name: 'Minha conta' })).toHaveAttribute(
      'href',
      `${ADMIN}/minha-conta`,
    )
    expect(menu.getByRole('link', { name: 'Minha conta' })).toHaveAttribute('aria-current', 'page')
  })
})

describe('o nome', () => {
  it('mostra o nome e o e-mail; o e-mail não se muda por aqui', async () => {
    abrirMinhaConta()
    await screen.findByRole('heading', { level: 1, name: 'Minha conta' })

    expect(screen.getByLabelText('Nome')).toHaveValue('Zé')
    expect(screen.getByLabelText('E-mail')).toHaveValue('ze@exemplo.com')
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Salvar nome' })).toBeDisabled()
  })

  it('salva o nome novo, e o menu o mostra na hora', async () => {
    const fetch = abrirMinhaConta()
    await screen.findByRole('heading', { level: 1, name: 'Minha conta' })

    escrever('Nome', 'José da Silva')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))

    expect(await screen.findByText('Nome salvo.')).toBeVisible()
    expect(corpoDe(fetch, '/auth/account')).toEqual({ name: 'José da Silva' })
    expect(useSessaoStore.getState().usuario?.name).toBe('José da Silva')
    expect(
      within(screen.getByRole('navigation', { name: 'Painel' })).getByText('José da Silva'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar nome' })).toBeDisabled()
  })

  it('nome em branco não é enviado', async () => {
    const fetch = abrirMinhaConta()
    await screen.findByRole('heading', { level: 1, name: 'Minha conta' })

    escrever('Nome', '  ')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }))

    expect(await screen.findByText('Informe o seu nome.')).toBeVisible()
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/auth/account'))).toBe(false)
  })
})

describe('a senha', () => {
  it('troca a senha: a sessão nova fica guardada, os campos se limpam e a página diz o que mudou', async () => {
    const fetch = abrirMinhaConta()
    await screen.findByRole('heading', { level: 1, name: 'Minha conta' })

    expect(screen.getByLabelText('Senha atual')).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByLabelText('Senha nova')).toHaveAttribute('autocomplete', 'new-password')
    escrever('Senha atual', 'senha-de-antes')
    escrever('Senha nova', 'Senha-nova-123')
    fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }))

    expect(await screen.findByText(/^Senha trocada\. Nos outros aparelhos/)).toBeVisible()
    expect(corpoDe(fetch, '/auth/account/password')).toEqual({
      currentPassword: 'senha-de-antes',
      newPassword: 'Senha-nova-123',
    })
    // O cookie da sessão nova vem na resposta: sem `credentials`, o navegador o descartaria.
    const troca = fetch.mock.calls.find(([url]) => url.endsWith('/auth/account/password'))
    expect(troca?.[1]?.credentials).toBe('include')
    expect(useSessaoStore.getState().accessToken).toBe('token-depois-da-troca')
    expect(screen.getByLabelText('Senha atual')).toHaveValue('')
    expect(screen.getByLabelText('Senha nova')).toHaveValue('')
    expect(localAtual()).toBe(`${ADMIN}/minha-conta`)
  })

  it('a senha atual errada marca o campo dela', async () => {
    abrirMinhaConta({ senha: recusa('CURRENT_PASSWORD_INVALID', 'A senha atual não confere.') })
    await screen.findByRole('heading', { level: 1, name: 'Minha conta' })

    escrever('Senha atual', 'errada')
    escrever('Senha nova', 'Senha-nova-123')
    fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }))

    expect(await screen.findByText('A senha atual não confere.')).toBeVisible()
    expect(screen.getByLabelText('Senha atual')).toHaveAttribute('aria-invalid', 'true')
    expect(useSessaoStore.getState().accessToken).toBe('token-de-acesso')
  })

  it('a nova igual à atual marca o campo da nova', async () => {
    abrirMinhaConta({
      senha: recusa('SAME_PASSWORD', 'A senha nova precisa ser diferente da atual.'),
    })
    await screen.findByRole('heading', { level: 1, name: 'Minha conta' })

    escrever('Senha atual', 'Senha-igual-123')
    escrever('Senha nova', 'Senha-igual-123')
    fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }))

    expect(await screen.findByText('A senha nova precisa ser diferente da atual.')).toBeVisible()
    expect(screen.getByLabelText('Senha nova')).toHaveAttribute('aria-invalid', 'true')
  })

  it('a nova fora das regras não é enviada, e as regras dizem o que falta', async () => {
    const fetch = abrirMinhaConta()
    await screen.findByRole('heading', { level: 1, name: 'Minha conta' })

    escrever('Senha atual', 'senha-de-antes')
    escrever('Senha nova', 'fraca')
    const regras = within(screen.getByRole('list', { name: 'Regras da senha' }))
    expect(regras.getByText('Uma letra maiúscula').parentElement).toHaveTextContent(': falta')
    fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }))

    expect(await screen.findByText(/^A senha precisa de/)).toBeVisible()
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/auth/account/password'))).toBe(false)
  })
})

describe('a renovação durante a troca de senha', () => {
  /** Uma resposta que só chega quando o teste mandar. */
  function respostaSegurada() {
    let soltar = (_: Resposta) => undefined as void
    const promessa = new Promise<Resposta>((resolve) => {
      soltar = resolve
    })
    return { promessa, soltar: (r: Resposta) => soltar(r) }
  }

  function mockarTroca(troca: Promise<Resposta>) {
    const fetch = vi.fn(async (url: string) => {
      const resposta = url.endsWith('/auth/account/password')
        ? await troca
        : { status: 200, corpo: { ...sessao([]), accessToken: 'token-da-renovacao' } }
      if (resposta === 'falha-de-rede') throw new Error('conexão recusada')
      return {
        ok: resposta.status < 400,
        status: resposta.status,
        json: () => Promise.resolve(resposta.corpo),
      }
    })
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  const renovacoes = (fetch: ReturnType<typeof mockarTroca>) =>
    fetch.mock.calls.filter(([url]) => url.endsWith('/auth/refresh')).length

  it('espera a troca e recebe o token novo: o cookie de antes já foi apagado', async () => {
    useSessaoStore.getState().guardar(sessao([]))
    const troca = respostaSegurada()
    const fetch = mockarTroca(troca.promessa)

    const trocando = trocarSenha('senha-de-antes', 'Senha-nova-123')
    // A API fechou a conexão ao vivo deste aparelho, e ela pede uma renovação.
    const renovando = renovarSessao()
    troca.soltar({ status: 200, corpo: SESSAO_NOVA })

    expect(await renovando).toBe('token-depois-da-troca')
    await trocando
    expect(renovacoes(fetch)).toBe(0)
    expect(useSessaoStore.getState().slug).toBe('lanchonete-do-ze')
  })

  it('se a troca falha, nada foi encerrado, e a renovação segue como sempre', async () => {
    useSessaoStore.getState().guardar(sessao([]))
    const troca = respostaSegurada()
    const fetch = mockarTroca(troca.promessa)

    const trocando = trocarSenha('errada', 'Senha-nova-123')
    const renovando = renovarSessao()
    troca.soltar(recusa('CURRENT_PASSWORD_INVALID', 'A senha atual não confere.'))

    await expect(trocando).rejects.toMatchObject({ code: 'CURRENT_PASSWORD_INVALID' })
    expect(await renovando).toBe('token-da-renovacao')
    await waitFor(() => {
      expect(renovacoes(fetch)).toBe(1)
    })
  })

  it('a troca que falha não pede renovação nenhuma', async () => {
    useSessaoStore.getState().guardar(sessao([]))
    const troca = respostaSegurada()
    const fetch = mockarTroca(troca.promessa)

    const trocando = trocarSenha('errada', 'Senha-nova-123')
    troca.soltar(recusa('CURRENT_PASSWORD_INVALID', 'A senha atual não confere.'))

    await expect(trocando).rejects.toMatchObject({ code: 'CURRENT_PASSWORD_INVALID' })
    expect(renovacoes(fetch)).toBe(0)
  })
})
