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
 * - No `localStorage` fica só o que não é segredo: o slug e quem está logado,
 *   para o painel saber que há sessão a renovar depois de recarregar.
 *
 * A sessão é de **um** estabelecimento: abrir o painel de outro slug pede
 * login de novo.
 */

export interface UsuarioDoPainel {
  id: string
  name: string
  email: string
  permissions: string[]
}

interface RespostaDeSessao {
  accessToken: string
  user: UsuarioDoPainel & { tenantId: string }
}

interface EstadoDaSessao {
  slug: string | null
  usuario: UsuarioDoPainel | null
  accessToken: string | null
  guardar: (slug: string, resposta: RespostaDeSessao) => void
  encerrar: () => void
}

export const useSessaoStore = create<EstadoDaSessao>()(
  persist(
    (set) => ({
      slug: null,
      usuario: null,
      accessToken: null,
      guardar: (slug, resposta) => {
        set({
          slug,
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
        set({ slug: null, usuario: null, accessToken: null })
      },
    }),
    {
      // Nome novo: a versão anterior guardava o refresh token aqui, e ele não
      // deve ser lido de volta.
      name: 'painel',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // O token de acesso nunca vai para o navegador guardado.
      partialize: (s) => ({ slug: s.slug, usuario: s.usuario }),
    },
  ),
)

/**
 * Até a Fase 14, o refresh token ficava no `localStorage`, na chave
 * `sessao-do-painel`. A chave nova não o lê, mas o antigo continuaria ali, ao
 * alcance de um script injetado. Apagado ao carregar o painel.
 */
export function apagarSessaoAntiga(): void {
  try {
    localStorage.removeItem('sessao-do-painel')
  } catch {
    /* navegador sem localStorage: não há o que apagar */
  }
}
apagarSessaoAntiga()

const sessao = () => useSessaoStore.getState()

export async function entrar(slug: string, email: string, senha: string): Promise<void> {
  const resposta = await requisitar<RespostaDeSessao>('/api/v1/auth/login', {
    method: 'POST',
    body: { tenantSlug: slug, email, password: senha },
    comCookie: true,
  })
  sessao().guardar(slug, resposta)
}

export async function sair(): Promise<void> {
  sessao().encerrar()
  // Revoga no servidor e apaga o cookie; se falhar, a sessão local já acabou.
  await requisitar('/api/v1/auth/logout', { method: 'POST', comCookie: true }).catch(
    () => undefined,
  )
}

let renovacaoEmAndamento: Promise<string> | null = null

/**
 * Troca o refresh token por um token de acesso novo.
 *
 * Uma renovação por vez: o painel faz várias chamadas ao mesmo tempo, e duas
 * renovações simultâneas apresentariam o mesmo cookie duas vezes — o servidor
 * entenderia como roubo e revogaria todas as sessões.
 */
export function renovarSessao(): Promise<string> {
  renovacaoEmAndamento ??= (async () => {
    const { slug } = sessao()
    if (!slug) throw new ApiError(401, 'Sessão encerrada.')
    try {
      const resposta = await requisitar<RespostaDeSessao>('/api/v1/auth/refresh', {
        method: 'POST',
        comCookie: true,
      })
      sessao().guardar(slug, resposta)
      return resposta.accessToken
    } catch (erro) {
      if (erro instanceof ApiError && erro.status === 401) sessao().encerrar()
      throw erro
    }
  })().finally(() => {
    renovacaoEmAndamento = null
  })
  return renovacaoEmAndamento
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
