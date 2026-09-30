import type { Cadastro } from '@repo/shared'
import { useQuery } from '@tanstack/react-query'

import { useSessaoStore, type UsuarioDoPainel } from '@/features/admin/session'
import { getJson, requisitar } from '@/services/api'

/** A resposta de `POST /api/v1/public/signup`: a sessão, como no login, e o estabelecimento. */
export interface EstabelecimentoCadastrado {
  accessToken: string
  user: UsuarioDoPainel & { tenantId: string }
  establishment: { id: string; slug: string; name: string; status: 'PENDING' }
  /** Falso quando o servidor de e-mail falhou: o cadastro vale, e o painel oferece o reenvio. */
  confirmationEmailSent: boolean
}

/**
 * Cadastra o estabelecimento e já abre a sessão do painel.
 *
 * Com `credentials`, como no login: a resposta traz o refresh token num cookie
 * `httpOnly`, e sem isso o navegador o descartaria.
 */
export async function cadastrar(dados: Cadastro): Promise<EstabelecimentoCadastrado> {
  const resposta = await requisitar<EstabelecimentoCadastrado>('/api/v1/public/signup', {
    method: 'POST',
    body: dados,
    comCookie: true,
  })
  useSessaoStore.getState().guardar(resposta.establishment.slug, resposta)
  return resposta
}

/** O que o cadastro deixa para o painel, no estado da navegação. */
export interface ChegadaDoCadastro {
  /** O e-mail de confirmação não saiu: o aviso do painel pede o reenvio. */
  emailNaoEnviado: boolean
}

export interface Disponibilidade {
  slug: string
  available: boolean
  reason: string | null
}

/** Se o endereço está livre. Só consulta endereço já no formato certo — o resto o formulário diz. */
export function useDisponibilidadeDoEndereco(slug: string | null) {
  return useQuery({
    queryKey: ['cadastro', 'endereco', slug],
    queryFn: ({ signal }) =>
      getJson<Disponibilidade>(
        `/api/v1/public/signup/slug-availability?slug=${encodeURIComponent(slug ?? '')}`,
        signal,
      ),
    enabled: slug !== null,
    staleTime: 30_000,
    retry: false,
  })
}

export interface ResultadoDaConfirmacao {
  status: 'CONFIRMED' | 'ALREADY_CONFIRMED'
  slug: string
}

export function confirmarEmail(token: string): Promise<ResultadoDaConfirmacao> {
  return requisitar<ResultadoDaConfirmacao>('/api/v1/public/signup/confirm-email', {
    method: 'POST',
    body: { token },
  })
}
