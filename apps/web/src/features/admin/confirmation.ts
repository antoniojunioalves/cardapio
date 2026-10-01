import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError } from '@/services/api'

import { comSessao } from './session'

/** A confirmação do cadastro, como `GET /api/v1/admin/email-confirmation` devolve. */
export interface ConfirmacaoDoCadastro {
  /** `PENDING` enquanto o cardápio espera a confirmação do e-mail do dono. */
  status: 'PENDING' | 'CONFIRMED'
  email: string | null
}

export const chaveDaConfirmacao = (slug: string) => ['painel', 'confirmacao', slug] as const

/**
 * Consultada de novo quando a pessoa volta para a aba: quem confirmou no
 * e-mail, em outra aba ou no celular, vê o aviso sumir sem recarregar.
 */
export function useConfirmacaoDoCadastro(slug: string, ativo: boolean) {
  return useQuery({
    queryKey: chaveDaConfirmacao(slug),
    queryFn: () => comSessao<ConfirmacaoDoCadastro>('/api/v1/admin/email-confirmation'),
    enabled: ativo,
  })
}

export function useReenviarConfirmacao(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      comSessao<{ email: string }>('/api/v1/admin/email-confirmation/resend', { method: 'POST' }),
    onError: (erro) => {
      // Confirmado entre uma consulta e outra: relê, e o aviso some.
      if (erro instanceof ApiError && erro.code === 'ALREADY_CONFIRMED') {
        void queryClient.invalidateQueries({ queryKey: chaveDaConfirmacao(slug) })
      }
    },
  })
}

/** A frase de uma falha no reenvio. As da API (espera, e-mail fora do ar) já falam com a pessoa. */
export function mensagemDoReenvio(erro: unknown): string {
  if (erro instanceof ApiError && (erro.status === 429 || erro.status === 503)) return erro.message
  return 'Não foi possível reenviar agora. Tente de novo em alguns minutos.'
}
