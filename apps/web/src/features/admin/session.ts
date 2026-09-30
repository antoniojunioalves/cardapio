import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { ApiError, requisitar } from '@/services/api'

/**
 * A sessão do painel do estabelecimento.
 *
 * - O **token de acesso** (15 minutos) fica só na memória da página.
 * - O **refresh token** (30 dias) fica no `localStorage`, para o tablet da
 *   cozinha continuar logado depois de recarregar. É uma dívida registrada em
 *   SECURITY.md: um script injetado na página poderia lê-lo. A rotação com
 *   detecção de reuso limita o estrago; o lugar certo é um cookie `httpOnly`
 *   (ROADMAP).
 *
 * A sessão é de **um** estabelecimento: o slug fica junto, e o painel de outro
 * slug pede login de novo.
 */

export interface UsuarioDoPainel {
  id: string
  name: string
  email: string
  permissions: string[]
}

interface RespostaDeSessao {
  accessToken: string
  refreshToken: string
  user: UsuarioDoPainel & { tenantId: string }
}

interface EstadoDaSessao {
  slug: string | null
  refreshToken: string | null
  usuario: UsuarioDoPainel | null
  accessToken: string | null
  guardar: (slug: string, resposta: RespostaDeSessao) => void
  encerrar: () => void
}

export const useSessaoStore = create<EstadoDaSessao>()(
  persist(
    (set) => ({
      slug: null,
      refreshToken: null,
      usuario: null,
      accessToken: null,
      guardar: (slug, resposta) => {
        set({
          slug,
          refreshToken: resposta.refreshToken,
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
        set({ slug: null, refreshToken: null, usuario: null, accessToken: null })
      },
    }),
    {
      name: 'sessao-do-painel',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // O token de acesso nunca vai para o navegador guardado.
      partialize: (s) => ({ slug: s.slug, refreshToken: s.refreshToken, usuario: s.usuario }),
    },
  ),
)

const sessao = () => useSessaoStore.getState()

export async function entrar(slug: string, email: string, senha: string): Promise<void> {
  const resposta = await requisitar<RespostaDeSessao>('/api/v1/auth/login', {
    method: 'POST',
    body: { tenantSlug: slug, email, password: senha },
  })
  sessao().guardar(slug, resposta)
}

export async function sair(): Promise<void> {
  const { refreshToken } = sessao()
  sessao().encerrar()
  if (refreshToken) {
    // Revoga no servidor; se falhar, a sessão local já acabou de qualquer jeito.
    await requisitar('/api/v1/auth/logout', { method: 'POST', body: { refreshToken } }).catch(
      () => undefined,
    )
  }
}

let renovacaoEmAndamento: Promise<string> | null = null

/**
 * Troca o refresh token por um token de acesso novo.
 *
 * Uma renovação por vez: o painel faz várias chamadas ao mesmo tempo, e duas
 * renovações simultâneas apresentariam o mesmo refresh token duas vezes — o
 * servidor entenderia como roubo e revogaria todas as sessões.
 */
export function renovarSessao(): Promise<string> {
  renovacaoEmAndamento ??= (async () => {
    const { refreshToken, slug } = sessao()
    if (!refreshToken || !slug) throw new ApiError(401, 'Sessão encerrada.')
    try {
      const resposta = await requisitar<RespostaDeSessao>('/api/v1/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
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
