import type { ClienteIdentificado } from '@repo/shared'
import { useMutation } from '@tanstack/react-query'

import { postJson } from '@/services/api'

export function identificarCliente(slug: string, phone: string): Promise<ClienteIdentificado> {
  return postJson<ClienteIdentificado>(
    `/api/v1/public/${encodeURIComponent(slug)}/customers/identify`,
    { phone },
  )
}

/**
 * Busca o cliente pelo telefone.
 *
 * É mutação, não consulta: não entra no cache — é dado pessoal, e não deve
 * ficar guardado na memória da página para outro telefone reaproveitar — e
 * roda uma vez por telefone digitado, quando a pessoa sai do campo.
 */
export function useIdentificacao(slug: string) {
  return useMutation({
    mutationFn: (phone: string) => identificarCliente(slug, phone),
  })
}
