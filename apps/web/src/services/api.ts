const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333'

export interface HealthResponse {
  status: 'ok'
  name: string
  environment: string
  uptimeSeconds: number
  timestamp: string
}

/**
 * Erro de uma resposta da API, com o status HTTP preservado.
 *
 * Guardar o status é o que permite à tela distinguir "este estabelecimento não
 * existe" (404, mostrar a página de não encontrado) de "a API caiu" (mostrar
 * tentar de novo) — duas situações que pedem respostas diferentes ao cliente.
 */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface CorpoDeErro {
  error?: { message?: string }
}

/** GET que devolve o JSON da resposta ou lança `ApiError`. */
export async function getJson<T>(caminho: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_URL}${caminho}`, { ...(signal && { signal }) })

  if (!response.ok) {
    const corpo = (await response.json().catch(() => ({}))) as CorpoDeErro
    throw new ApiError(
      response.status,
      corpo.error?.message ?? `A API respondeu com status ${String(response.status)}.`,
    )
  }

  return (await response.json()) as T
}

/** Consulta a sonda de saúde da API. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return getJson<HealthResponse>('/health', signal)
}

export { API_URL }
