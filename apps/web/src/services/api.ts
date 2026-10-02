const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333'

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

export interface Requisicao {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Enviado como JSON. */
  body?: unknown
  /** Enviado como `multipart/form-data` — o upload de imagem. Não combina com `body`. */
  formulario?: FormData
  /** Token de acesso do painel, enviado como `Authorization: Bearer`. */
  token?: string
  /** Envia os cookies — só as rotas de autenticação precisam (o refresh token). */
  comCookie?: boolean
  signal?: AbortSignal
}

/** Chama a API e devolve o JSON da resposta, ou lança `ApiError`. 204 devolve `undefined`. */
export async function requisitar<T>(caminho: string, requisicao: Requisicao = {}): Promise<T> {
  const headers: Record<string, string> = {}
  // Com `FormData` o navegador define o `Content-Type`, com a fronteira das partes.
  if (requisicao.body !== undefined) headers['content-type'] = 'application/json'
  if (requisicao.token) headers.authorization = `Bearer ${requisicao.token}`

  const response = await fetch(`${API_URL}${caminho}`, {
    ...(requisicao.method && { method: requisicao.method }),
    ...(Object.keys(headers).length > 0 && { headers }),
    ...(requisicao.body !== undefined && { body: JSON.stringify(requisicao.body) }),
    ...(requisicao.formulario && { body: requisicao.formulario }),
    ...(requisicao.signal && { signal: requisicao.signal }),
    ...(requisicao.comCookie && { credentials: 'include' as const }),
  })
  if (response.status === 204) return undefined as T
  return lerResposta<T>(response)
}

/** GET que devolve o JSON da resposta ou lança `ApiError`. */
export async function getJson<T>(caminho: string, signal?: AbortSignal): Promise<T> {
  return requisitar<T>(caminho, signal ? { signal } : {})
}

/** POST com corpo JSON, que devolve o JSON da resposta ou lança `ApiError`. */
export async function postJson<T>(caminho: string, corpo: unknown): Promise<T> {
  return requisitar<T>(caminho, { method: 'POST', body: corpo })
}

/**
 * Os erros de validação da API, por campo: `{ whatsappPhone: 'informe apenas dígitos…' }`.
 *
 * A API devolve um item por problema, com o caminho do campo (`instancePath:
 * "/whatsappPhone"`). Fica a primeira mensagem de cada campo.
 */
export function errosPorCampo(detalhes: unknown): Record<string, string> {
  if (!Array.isArray(detalhes)) return {}
  const erros: Record<string, string> = {}
  for (const item of detalhes as { instancePath?: unknown; message?: unknown }[]) {
    if (typeof item.instancePath !== 'string' || typeof item.message !== 'string') continue
    const campo = item.instancePath.slice(1)
    if (campo) erros[campo] ??= item.message
  }
  return erros
}

export { API_URL }
