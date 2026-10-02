import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { chaveDoChecklist } from './checklist'
import { comSessao } from './session'

/**
 * Uma forma de pagamento do catálogo da plataforma, com a escolha deste
 * estabelecimento — como `GET /api/v1/admin/payment-methods` devolve.
 */
export interface FormaDePagamento {
  id: string
  code: string
  name: string
  kind: string
  isEnabled: boolean
  sortOrder: number
}

// --- Formulário ----------------------------------------------------------------

/**
 * O formulário das formas de pagamento: uma linha por forma do catálogo, ligada
 * ou não. É também o corpo de `PUT /api/v1/admin/payment-methods` — vão todas,
 * e não só as que mudaram, para a tela e o banco nunca divergirem.
 */
export const formularioSchema = z.object({
  formas: z.array(
    z.object({
      paymentMethodId: z.string(),
      isEnabled: z.boolean(),
      sortOrder: z.number(),
    }),
  ),
})

export type ValoresDoFormulario = z.infer<typeof formularioSchema>

/** O caminho da caixa de uma forma, como o formulário o conhece. */
export const campoDaForma = (indice: number) =>
  `formas.${String(indice)}.isEnabled` as `formas.${number}.isEnabled`

/** As formas da API como valores do formulário, na mesma ordem. */
export function paraFormulario(formas: readonly FormaDePagamento[]): ValoresDoFormulario {
  return {
    formas: formas.map(({ id, isEnabled, sortOrder }) => ({
      paymentMethodId: id,
      isEnabled,
      sortOrder,
    })),
  }
}

// --- API -----------------------------------------------------------------------

export const chaveDasFormasDePagamento = (slug: string) => ['painel', 'pagamento', slug] as const

export function useFormasDePagamento(slug: string) {
  return useQuery({
    queryKey: chaveDasFormasDePagamento(slug),
    queryFn: () => comSessao<FormaDePagamento[]>('/api/v1/admin/payment-methods'),
  })
}

export function useSalvarFormasDePagamento(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dados: ValoresDoFormulario) =>
      comSessao<FormaDePagamento[]>('/api/v1/admin/payment-methods', {
        method: 'PUT',
        body: dados,
      }),
    onSuccess: (salvas) => {
      queryClient.setQueryData(chaveDasFormasDePagamento(slug), salvas)
      // O Início mostra o que ainda falta configurar.
      void queryClient.invalidateQueries({ queryKey: chaveDoChecklist(slug) })
    },
  })
}
