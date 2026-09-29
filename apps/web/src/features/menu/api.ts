import { useQuery } from '@tanstack/react-query'

import { ApiError, getJson } from '@/services/api'

import type { CardapioPublico } from './types'

export function buscarCardapioPublico(
  slug: string,
  signal?: AbortSignal,
): Promise<CardapioPublico> {
  return getJson<CardapioPublico>(`/api/v1/public/${encodeURIComponent(slug)}/menu`, signal)
}

/**
 * O cardápio público de um estabelecimento.
 *
 * Recarrega a cada minuto enquanto a página está aberta: "aberto" e
 * "esgotado" mudam sozinhos, e o cliente que deixou o celular na mesa não
 * pode continuar vendo a lanchonete aberta depois que ela fechou.
 *
 * Um 404 não é repetido — o estabelecimento não vai passar a existir na
 * terceira tentativa. Falha de rede é repetida, como no padrão do TanStack.
 */
export function useCardapioPublico(slug: string) {
  return useQuery({
    queryKey: ['cardapio-publico', slug],
    queryFn: ({ signal }) => buscarCardapioPublico(slug, signal),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: (tentativas, erro) =>
      !(erro instanceof ApiError && erro.status === 404) && tentativas < 2,
  })
}
