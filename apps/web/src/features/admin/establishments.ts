import { useQuery } from '@tanstack/react-query'

import { comSessao } from './session'

/** Um estabelecimento em que a conta entra, como `GET /api/v1/auth/establishments` devolve. */
export interface EstabelecimentoDaConta {
  slug: string
  name: string
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING'
  /** É o da sessão de agora. */
  current: boolean
}

export const chaveDosEstabelecimentos = ['painel', 'estabelecimentos-da-conta'] as const

/**
 * Os estabelecimentos em que a conta logada entra, por nome. É a lista da troca
 * pelo menu: com um só, o menu nem oferece a troca.
 */
export function useEstabelecimentosDaConta(ativo: boolean) {
  return useQuery({
    queryKey: chaveDosEstabelecimentos,
    queryFn: () => comSessao<EstabelecimentoDaConta[]>('/api/v1/auth/establishments'),
    enabled: ativo,
  })
}
