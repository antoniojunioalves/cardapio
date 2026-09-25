import { z } from 'zod'

/**
 * Toda variável de ambiente entra por aqui. Nenhum outro módulo lê
 * `process.env` diretamente — assim o conjunto de configurações da API é
 * conhecido, tipado e validado na inicialização, e o processo falha rápido
 * em vez de descobrir um valor faltando no meio de uma requisição.
 *
 * O arquivo `.env` da raiz é carregado pelo próprio Node, via
 * `--env-file-if-exists` nos scripts do package.json.
 */
const postgresUrl = z
  .string()
  .min(1)
  .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
    message: 'deve ser uma URL postgres:// ou postgresql://',
  })

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().max(65535).default(3333),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /** Origem do frontend autorizada no CORS. */
  WEB_ORIGIN: z.url().default('http://localhost:5173'),

  /**
   * Conexão da API em execução, com a role que só tem DML. Sem valor padrão de
   * propósito: um padrão errado apontaria silenciosamente para o banco errado,
   * o que é pior do que falhar na inicialização.
   */
  DATABASE_URL: postgresUrl,

  /**
   * Conexão com poder de DDL, usada apenas pelo comando de migrations.
   * Opcional porque a API servindo requisições não deve tê-la à mão — é essa
   * separação que impede uma injeção de SQL de alcançar `ALTER TABLE` e
   * desligar as policies de isolamento entre tenants.
   */
  MIGRATION_DATABASE_URL: postgresUrl.optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),
  /** Quanto esperar por uma conexão antes de desistir. Mantém `/ready` responsivo. */
  DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.string().min(1).default('1 minute'),
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
