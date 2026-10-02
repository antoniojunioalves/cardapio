import { app as product } from '@repo/config'
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

/** Variável opcional: no `.env`, `CHAVE=` chega como texto vazio, que aqui vale como ausente. */
const opcional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((valor) => (valor === '' ? undefined : valor), schema.optional())

/** Exportado só para os testes conferirem as regras; a aplicação usa `env`. */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().positive().max(65535).default(3333),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

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

    /**
     * Segredo que assina os tokens de acesso. Sem valor padrão, e com tamanho
     * mínimo: um segredo curto ou previsível é o mesmo que não ter assinatura —
     * qualquer pessoa forja um token de qualquer usuário de qualquer tenant.
     *
     * É um só porque o refresh token não é assinado: ele é um valor opaco,
     * verificado contra o banco. Ver `src/auth/tokens.ts`.
     */
    JWT_SECRET: z.string().min(32, 'precisa de ao menos 32 caracteres'),

    /** Curto de propósito: é a janela em que um token roubado ainda funciona. */
    JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

    /**
     * Onde as imagens ficam. Só `local` existe no MVP; um provider S3 entra
     * trocando este valor, sem mexer em nenhuma regra de negócio.
     */
    STORAGE_DRIVER: z.enum(['local']).default('local'),
    /** Diretório do provider local. Relativo ao diretório da API. */
    STORAGE_LOCAL_PATH: z.string().min(1).default('./uploads'),
    /** Endereço público pelo qual o navegador busca as imagens. */
    STORAGE_PUBLIC_URL: z.url().default('http://localhost:3333/uploads'),
    /**
     * Teto por arquivo **enviado**. Foto de celular passa de 5 MB fácil, e o
     * que fica guardado é a versão tratada, bem menor (`storage/process-image.ts`).
     */
    UPLOAD_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 1024 * 1024),

    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_WINDOW: z.string().min(1).default('1 minute'),

    /**
     * Ligue **só** quando a API estiver atrás de um proxy reverso (nginx, load
     * balancer) que reescreve o `X-Forwarded-For`. Desligado atrás de um proxy,
     * todo cliente aparece com o IP do proxy e os limites por IP viram um limite
     * único, dividido por todo mundo. Ligado **sem** proxy, qualquer cliente
     * escolhe o próprio IP mandando o cabeçalho — e escapa dos limites.
     */
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((valor) => valor === 'true'),

    /**
     * Tamanho máximo de um corpo JSON, em bytes. O maior pedido legítimo — 50
     * itens com opções — fica bem abaixo; acima disso é engano ou abuso. O
     * upload de imagem tem limite próprio (`UPLOAD_MAX_BYTES`).
     */
    JSON_BODY_LIMIT_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(64 * 1024),

    /**
     * `smtp` envia de verdade — em desenvolvimento, para o Mailpit do
     * docker-compose, que guarda tudo numa caixa em http://localhost:8025.
     * `memory` só guarda na memória do processo: é o dos testes, e é recusado em
     * produção, porque ali descartaria todo e-mail em silêncio.
     */
    EMAIL_DRIVER: z.enum(['smtp', 'memory']).default('smtp'),
    SMTP_HOST: z.string().min(1).default('localhost'),
    SMTP_PORT: z.coerce.number().int().positive().max(65535).default(1025),
    /** TLS desde a conexão (porta 465). Com `false`, o STARTTLS é negociado se o servidor oferecer. */
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((valor) => valor === 'true'),
    SMTP_USER: opcional(z.string()),
    SMTP_PASSWORD: opcional(z.string()),
    /** Remetente. Em produção, um endereço do domínio com SPF e DKIM configurados (Fase 28). */
    EMAIL_FROM: z.preprocess(
      (valor) => (valor === '' ? undefined : valor),
      z.string().min(3).default(`${product.name} <nao-responda@localhost>`),
    ),
    /** Quem recebe o aviso de cada estabelecimento novo. Sem valor, o aviso não é enviado. */
    PLATFORM_NOTIFY_EMAIL: opcional(z.email()),
  })
  .refine((e) => !(e.NODE_ENV === 'production' && e.EMAIL_DRIVER === 'memory'), {
    message: 'EMAIL_DRIVER=memory descartaria os e-mails: em produção, use smtp',
    path: ['EMAIL_DRIVER'],
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
