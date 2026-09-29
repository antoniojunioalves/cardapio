import { app as product } from '@repo/config'
import { useEffect, useState } from 'react'

import { API_URL, fetchHealth, type HealthResponse } from '@/services/api'
import { applyTenantTheme, resetTenantTheme, type TenantTheme } from '@/theme'

type ApiState =
  { kind: 'carregando' } | { kind: 'ok'; data: HealthResponse } | { kind: 'erro'; mensagem: string }

/** Tema fictício, só para demonstrar que a troca acontece em runtime. */
const TEMA_DE_EXEMPLO: TenantTheme = {
  primary: '#c2410c',
  primaryHover: '#9a3412',
  radiusCard: '1.5rem',
}

const AMOSTRAS_DE_COR = [
  { nome: 'primary', classe: 'bg-primary' },
  { nome: 'brand-600', classe: 'bg-brand-600' },
  { nome: 'brand-300', classe: 'bg-brand-300' },
  { nome: 'accent-500', classe: 'bg-accent-500' },
  { nome: 'neutral-800', classe: 'bg-neutral-800' },
  { nome: 'neutral-200', classe: 'bg-neutral-200' },
] as const

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card bg-surface p-card shadow-card">
      <h2 className="text-heading mb-stack text-content">{titulo}</h2>
      {children}
    </section>
  )
}

function EstadoDaApi({ estado }: { estado: ApiState }) {
  if (estado.kind === 'carregando') {
    return <p className="text-body text-content-muted">Consultando a API…</p>
  }

  if (estado.kind === 'erro') {
    return (
      <div className="text-body">
        <p className="font-semibold text-danger">API indisponível</p>
        <p className="text-caption mt-1 text-content-muted">{estado.mensagem}</p>
        <p className="text-caption mt-2 text-content-muted">
          Esperando resposta em <code className="font-mono">{API_URL}/health</code>. Rode{' '}
          <code className="font-mono">pnpm dev</code> na raiz para subir os dois processos.
        </p>
      </div>
    )
  }

  return (
    <dl className="text-body grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      <dt className="text-content-muted">Status</dt>
      <dd className="font-semibold text-success">{estado.data.status}</dd>
      <dt className="text-content-muted">Ambiente</dt>
      <dd>{estado.data.environment}</dd>
      <dt className="text-content-muted">No ar há</dt>
      <dd>{estado.data.uptimeSeconds}s</dd>
    </dl>
  )
}

/**
 * Página de verificação do ambiente: API no ar, tokens de cor e tema por
 * tenant. Fica na raiz até existir uma página institucional do produto.
 */
export function HomePage() {
  const [api, setApi] = useState<ApiState>({ kind: 'carregando' })
  const [temaDoTenantAtivo, setTemaDoTenantAtivo] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    fetchHealth(controller.signal)
      .then((data) => {
        setApi({ kind: 'ok', data })
      })
      .catch((erro: unknown) => {
        if (controller.signal.aborted) return
        setApi({
          kind: 'erro',
          mensagem: erro instanceof Error ? erro.message : 'Falha desconhecida.',
        })
      })

    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (temaDoTenantAtivo) {
      applyTenantTheme(TEMA_DE_EXEMPLO)
    } else {
      resetTenantTheme()
    }
  }, [temaDoTenantAtivo])

  return (
    <div className="min-h-dvh">
      <header className="bg-primary px-page-x py-section-y text-primary-content">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-display">{product.name}</h1>
          <p className="text-body mt-2 opacity-90">{product.description}</p>
        </div>
      </header>

      <main className="px-page-x py-section-y">
        <div className="mx-auto flex max-w-3xl flex-col gap-stack">
          <Cartao titulo="Conexão com a API">
            <div role="status" aria-live="polite">
              <EstadoDaApi estado={api} />
            </div>
          </Cartao>

          <Cartao titulo="Tokens de cor">
            <ul className="grid grid-cols-2 gap-stack sm:grid-cols-3">
              {AMOSTRAS_DE_COR.map(({ nome, classe }) => (
                <li key={nome} className="flex items-center gap-2">
                  <span
                    className={`${classe} rounded-control size-9 border border-border`}
                    aria-hidden="true"
                  />
                  <code className="text-caption font-mono text-content-muted">{nome}</code>
                </li>
              ))}
            </ul>
          </Cartao>

          <Cartao titulo="Escala tipográfica">
            <div className="flex flex-col gap-1">
              <p className="text-display">Display</p>
              <p className="text-heading">Heading</p>
              <p className="text-body">Body — o texto corrente do cardápio.</p>
              <p className="text-caption text-content-muted">Caption — informação secundária.</p>
            </div>
          </Cartao>

          <Cartao titulo="Tema por tenant">
            <p className="text-body text-content-muted">
              A troca abaixo reescreve custom properties em <code className="font-mono">:root</code>
              . Repare que nenhum componente sabe disso — e que não houve rebuild.
            </p>
            <button
              type="button"
              onClick={() => {
                setTemaDoTenantAtivo((ativo) => !ativo)
              }}
              aria-pressed={temaDoTenantAtivo}
              className="rounded-control mt-stack bg-primary px-4 py-2 font-semibold text-primary-content transition-colors hover:bg-primary-hover"
            >
              {temaDoTenantAtivo ? 'Voltar ao tema do produto' : 'Aplicar tema de exemplo'}
            </button>
          </Cartao>
        </div>
      </main>
    </div>
  )
}
