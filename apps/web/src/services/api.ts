const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333'

export interface HealthResponse {
  status: 'ok'
  name: string
  environment: string
  uptimeSeconds: number
  timestamp: string
}

/**
 * Consulta a sonda de saúde da API.
 *
 * A partir da Fase 2 o acesso a dados passa pelo TanStack Query; esta função
 * direta existe porque ainda não há estado de servidor para gerenciar — só a
 * verificação de que os dois processos se enxergam.
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_URL}/health`, { ...(signal && { signal }) })

  if (!response.ok) {
    throw new Error(`A API respondeu com status ${String(response.status)}.`)
  }

  return (await response.json()) as HealthResponse
}

export { API_URL }
