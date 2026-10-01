import { useQuery } from '@tanstack/react-query'

import { comSessao } from './session'

/** O resumo dos pedidos, como `GET /api/v1/admin/orders/summary` devolve. */
export interface ResumoDosPedidos {
  /** Esperando ser aceitos. */
  new: number
  /** Aceitos e ainda não entregues. */
  inProgress: number
  /** Concluídos desde a meia-noite, no fuso do estabelecimento. */
  completedToday: number
}

export const chaveDoResumo = (slug: string) => ['painel', 'resumo', slug] as const

/**
 * Os números do Início e do menu. A conexão ao vivo manda reler a cada aviso;
 * a recarga de minuto em minuto é a rede de segurança, como na lista.
 */
export function useResumoDosPedidos(slug: string, ativo: boolean) {
  return useQuery({
    queryKey: chaveDoResumo(slug),
    queryFn: () => comSessao<ResumoDosPedidos>('/api/v1/admin/orders/summary'),
    enabled: ativo,
    refetchInterval: 60_000,
  })
}
