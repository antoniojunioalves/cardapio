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
  /** O código estável da API (`ORDER_REJECTED`, `PRICE_CHANGED`), para a tela decidir o que fazer. */
  readonly code: string | null
  readonly details: unknown

  constructor(status: number, message: string, code: string | null = null, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

interface CorpoDeErro {
  error?: { code?: string; message?: string; details?: unknown }
}

async function lerResposta<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const corpo = (await response.json().catch(() => ({}))) as CorpoDeErro
    throw new ApiError(
      response.status,
      corpo.error?.message ?? `A API respondeu com status ${String(response.status)}.`,
      corpo.error?.code ?? null,
      corpo.error?.details,
    )
  }

  return (await response.json()) as T
}

/** GET que devolve o JSON da resposta ou lança `ApiError`. */
export async function getJson<T>(caminho: string, signal?: AbortSignal): Promise<T> {
  return lerResposta<T>(await fetch(`${API_URL}${caminho}`, { ...(signal && { signal }) }))
}

/** POST com corpo JSON, que devolve o JSON da resposta ou lança `ApiError`. */
export async function postJson<T>(caminho: string, corpo: unknown): Promise<T> {
  return lerResposta<T>(
    await fetch(`${API_URL}${caminho}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    }),
  )
}

/** Consulta a sonda de saúde da API. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return getJson<HealthResponse>('/health', signal)
}

export { API_URL }
