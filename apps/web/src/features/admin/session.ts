import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { ApiError, requisitar } from '@/services/api'

/**
 * A sessão do painel do estabelecimento.
 *
 * - O **token de acesso** (15 minutos) fica só na memória da página.
 * - O **refresh token** (30 dias) fica num cookie `httpOnly` que a API define:
 *   o JavaScript da página não o vê, e um script injetado não tem como
 *   roubá-lo. As chamadas de autenticação mandam o cookie
 *   (`credentials: 'include'`); as demais, não.
 * - No `localStorage` fica só o que não é segredo: o slug, o nome do
 *   estabelecimento e quem está logado, para o painel saber que há sessão a
 *   renovar depois de recarregar — e já ter o que mostrar no menu.
 *
 * A sessão é de **um** estabelecimento, e quem diz qual é a API: o login pede
 * só o e-mail e a senha da conta, e a resposta traz o estabelecimento em que a
 * pessoa entrou — o que ela usou por último. É do slug dele que o painel tira o
 * endereço. Quem trabalha em mais de um troca pelo menu
 * (`trocarDeEstabelecimento`), e a troca vale para o navegador inteiro: as
 * abas dividem o cookie da sessão.
 */

export interface UsuarioDoPainel {
  id: string
  name: string
  email: string
  permissions: string[]
}

/** O que o login, a renovação e o cadastro devolvem. */
export interface RespostaDeSessao {
  accessToken: string
  user: UsuarioDoPainel & { tenantId: string }
  establishment: { id: string; slug: string; name: string; status: string }
}

interface EstadoDaSessao {
  slug: string | null
  /** O nome do estabelecimento, para o menu do painel. */
  estabelecimento: string | null
  usuario: UsuarioDoPainel | null
  accessToken: string | null
  guardar: (resposta: RespostaDeSessao) => void
  encerrar: () => void
}

export const useSessaoStore = create<EstadoDaSessao>()(
  persist(
    (set) => ({
      slug: null,
      estabelecimento: null,
      usuario: null,
      accessToken: null,
      guardar: (resposta) => {
        set({
          slug: resposta.establishment.slug,
          estabelecimento: resposta.establishment.name,
          accessToken: resposta.accessToken,
          usuario: {
            id: resposta.user.id,
            name: resposta.user.name,
            email: resposta.user.email,
            permissions: resposta.user.permissions,
          },
        })
      },
      encerrar: () => {
        set({ slug: null, estabelecimento: null, usuario: null, accessToken: null })
      },
    }),
    {
      // Nome novo: a versão anterior guardava o refresh token aqui, e ele não
      // deve ser lido de volta.
      name: 'painel',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // O token de acesso nunca vai para o navegador guardado.
      partialize: (s) => ({
        slug: s.slug,
        estabelecimento: s.estabelecimento,
        usuario: s.usuario,
      }),
    },
  ),
)

const sessao = () => useSessaoStore.getState()

/** Entra com e-mail e senha. Devolve o slug do estabelecimento em que a pessoa entrou, para o painel ir até ele. */
export async function entrar(email: string, senha: string): Promise<string> {
  const resposta = await requisitar<RespostaDeSessao>('/api/v1/auth/login', {
    method: 'POST',
    body: { email, password: senha },
    comCookie: true,
  })
  sessao().guardar(resposta)
  return resposta.establishment.slug
}

/**
 * Troca a sessão para outro estabelecimento da conta, sem pedir a senha: quem
 * prova a conta é o cookie da sessão de agora, que a API revoga. Não muda o
 * endereço: o painel segue a sessão, e com a de outro estabelecimento a moldura
 * vai para o painel dele (`AdminLayout`). Devolve o slug do estabelecimento novo.
 */
export async function trocarDeEstabelecimento(slug: string): Promise<string> {
  const resposta = await requisitar<RespostaDeSessao>('/api/v1/auth/switch', {
    method: 'POST',
    body: { establishmentSlug: slug },
    comCookie: true,
  })
  sessao().guardar(resposta)
  return resposta.establishment.slug
}

/** O nome novo da conta, no que o painel guarda da sessão: o menu o mostra na hora. */
export function renomearNaSessao(nome: string): void {
  useSessaoStore.setState((s) => (s.usuario ? { usuario: { ...s.usuario, name: nome } } : {}))
}

export async function sair(): Promise<void> {
  sessao().encerrar()
  // Revoga no servidor e apaga o cookie; se falhar, a sessão local já acabou.
  await requisitar('/api/v1/auth/logout', { method: 'POST', comCookie: true }).catch(
    () => undefined,
  )
}

let renovacaoEmAndamento: Promise<string> | null = null
/** A troca de senha em andamento: ela devolve a sessão nova (`trocarSenha`). */
let trocaEmAndamento: Promise<RespostaDeSessao> | null = null

/** A renovação em si: o cookie vai, a sessão nova volta. Sem a fila — quem chama é `renovarSessao`. */
async function renovar(): Promise<string> {
  if (!sessao().slug) throw new ApiError(401, 'Sessão encerrada.')
  try {
    const resposta = await requisitar<RespostaDeSessao>('/api/v1/auth/refresh', {
      method: 'POST',
      comCookie: true,
    })
    sessao().guardar(resposta)
    return resposta.accessToken
  } catch (erro) {
    if (erro instanceof ApiError && erro.status === 401) sessao().encerrar()
    throw erro
  }
}

/**
 * Troca o refresh token por um token de acesso novo.
 *
 * Uma renovação por vez: o painel faz várias chamadas ao mesmo tempo, e duas
 * renovações simultâneas apresentariam o mesmo cookie duas vezes — o servidor
 * entenderia como roubo e revogaria todas as sessões.
 */
export function renovarSessao(): Promise<string> {
  // Durante uma troca de senha, a sessão nova vem dela: o cookie de agora já foi
  // apagado. Se a troca falhar, nada foi encerrado, e a renovação segue como sempre.
  if (trocaEmAndamento) {
    return trocaEmAndamento.then(
      (resposta) => resposta.accessToken,
      () => renovarSessao(),
    )
  }
  renovacaoEmAndamento ??= renovar().finally(() => {
    renovacaoEmAndamento = null
  })
  return renovacaoEmAndamento
}

/**
 * Troca a senha da conta ("Minha conta"). A API encerra **todas** as sessões
 * da conta — as deste aparelho também — e devolve uma sessão nova, com o
 * cookie novo.
 *
 * A API fecha a conexão ao vivo deste aparelho, e ela pede uma renovação: se
 * essa renovação saísse antes de a troca voltar, levaria o cookie de antes, já
 * apagado, e encerraria a sessão — a pessoa cairia no login logo depois de
 * trocar a senha. Por isso quem pede renovação durante a troca espera por ela
 * e recebe o token da sessão nova (`renovarSessao`).
 */
export async function trocarSenha(senhaAtual: string, senhaNova: string): Promise<void> {
  const pedir = (token: string) =>
    requisitar<RespostaDeSessao>('/api/v1/auth/account/password', {
      method: 'POST',
      body: { currentPassword: senhaAtual, newPassword: senhaNova },
      comCookie: true,
      token,
    })

  const troca = (async () => {
    try {
      return await pedir(await tokenDeAcesso())
    } catch (erro) {
      // O token de acesso venceu enquanto a página estava aberta: renova e tenta de novo.
      if (!(erro instanceof ApiError) || erro.status !== 401) throw erro
      return pedir(await renovar())
    }
  })().then((resposta) => {
    sessao().guardar(resposta)
    return resposta
  })

  trocaEmAndamento = troca
  try {
    await troca
  } finally {
    trocaEmAndamento = null
  }
}

/** Um token de acesso válido: o da memória, ou um renovado. */
export async function tokenDeAcesso(): Promise<string> {
  return sessao().accessToken ?? renovarSessao()
}

/**
 * Chama a API com a sessão do painel. Um 401 renova a sessão e tenta mais uma
 * vez — o token de acesso dura 15 minutos e expira no meio do expediente.
 */
export async function comSessao<T>(
  caminho: string,
  requisicao: Parameters<typeof requisitar>[1] = {},
): Promise<T> {
  try {
    return await requisitar<T>(caminho, { ...requisicao, token: await tokenDeAcesso() })
  } catch (erro) {
    if (!(erro instanceof ApiError) || erro.status !== 401) throw erro
    return requisitar<T>(caminho, { ...requisicao, token: await renovarSessao() })
  }
}
