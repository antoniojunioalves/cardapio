import { z } from 'zod'

/**
 * Toda variável de ambiente entra por aqui. Nenhum outro módulo lê
 * `process.env` diretamente — assim o conjunto de configurações da API é
 * conhecido, tipado e validado na inicialização, e o processo falha rápido
 * em vez de descobrir um valor faltando no meio de uma requisição.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().max(65535).default(3333),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Origem do frontend autorizada no CORS. */
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
})

export type Env = z.infer<typeof envSchema>

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n')

    throw new Error(
      `Variáveis de ambiente inválidas:\n${details}\n\nConfira o .env.example na raiz do projeto.`,
    )
  }

  return result.data
}

export const env = loadEnv()

export const isDevelopment = env.NODE_ENV === 'development'
export const isProduction = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'
