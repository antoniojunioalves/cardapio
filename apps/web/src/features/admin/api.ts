import type { StatusDoPedido } from '@repo/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { comSessao } from './session'
import type { PedidoDoPainel } from './types'

export const chaveDosPedidos = (slug: string) => ['painel', 'pedidos', slug] as const

/**
 * Os 50 pedidos mais recentes.
 *
 * A conexão ao vivo manda recarregar a cada aviso; a recarga de minuto em
 * minuto é só a rede de segurança para quando a conexão cair sem ninguém
 * perceber.
 */
export function usePedidosDoPainel(slug: string, ativo: boolean) {
  return useQuery({
    queryKey: chaveDosPedidos(slug),
    queryFn: () => comSessao<PedidoDoPainel[]>('/api/v1/admin/orders?limit=50'),
    enabled: ativo,
    refetchInterval: 60_000,
  })
}

export function useMudarStatus(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dados: { id: string; status: StatusDoPedido; reason?: string }) =>
      comSessao<PedidoDoPainel>(`/api/v1/admin/orders/${dados.id}/status`, {
        method: 'PATCH',
        body: { status: dados.status, ...(dados.reason && { reason: dados.reason }) },
      }),
    // Deu certo ou não (outra pessoa mudou antes), a lista precisa refletir o banco.
    onSettled: () => queryClient.invalidateQueries({ queryKey: chaveDosPedidos(slug) }),
  })
}
