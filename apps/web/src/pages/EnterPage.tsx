import { useEffect, useId, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { SiteLayout } from '@/components/SiteLayout'
import { useSessaoStore } from '@/features/admin/session'
import { extrairSlugDigitado } from '@/features/signup/slug'

/**
 * O "entrar" da página inicial, em `/entrar`. O login do painel é por
 * estabelecimento (`/{slug}/admin`), então aqui só se pergunta qual — e quem
 * já entrou antes neste aparelho encontra o endereço preenchido.
 */
export function EnterPage() {
  const navigate = useNavigate()
  const ultimo = useSessaoStore((s) => s.slug)
  const [endereco, setEndereco] = useState(ultimo ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const id = useId()

  useEffect(() => {
    document.title = 'Entrar no painel'
  }, [])

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    const slug = extrairSlugDigitado(endereco)
    if (!slug) {
      setErro('Informe o endereço do cardápio, como lanchonete-do-ze.')
      return
    }
    void navigate(`/${slug}/admin`)
  }

  return (
    <SiteLayout>
      <main className="mx-auto flex max-w-md flex-col gap-section-y px-page-x py-section-y">
        <div className="flex flex-col gap-1">
          <h1 className="text-heading text-content">Entrar no painel</h1>
          <p className="text-body text-content-muted">Qual é o endereço do seu cardápio?</p>
        </div>

        <form
          noValidate
          onSubmit={aoEnviar}
          className="flex flex-col gap-stack rounded-card bg-surface p-card shadow-card"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={id} className="text-body font-semibold text-content">
              Endereço do cardápio
            </label>
            <div
              className={`flex items-center overflow-hidden rounded-control border bg-surface ${
                erro ? 'border-danger' : 'border-border'
              }`}
            >
              <span aria-hidden="true" className="text-body shrink-0 pl-3 text-content-muted">
                {window.location.host}/
              </span>
              <input
                id={id}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                value={endereco}
                aria-invalid={erro ? true : undefined}
                aria-describedby={`${id}-dica${erro ? ` ${id}-erro` : ''}`}
                onChange={(evento) => {
                  setEndereco(evento.target.value)
                  setErro(null)
                }}
                className="text-body min-w-0 flex-1 bg-transparent py-2 pr-3"
              />
            </div>
            <p id={`${id}-dica`} className="text-caption text-content-muted">
              Pode colar o link inteiro do cardápio.
            </p>
            {erro && (
              <p id={`${id}-erro`} className="text-caption text-danger">
                {erro}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="text-body rounded-control bg-primary px-4 py-3 font-semibold text-primary-content hover:bg-primary-hover"
          >
            Continuar
          </button>
        </form>

        <p className="text-body text-center text-content-muted">
          Ainda não tem conta?{' '}
          <Link to="/cadastro" className="font-semibold text-primary hover:underline">
            Cadastre seu estabelecimento
          </Link>
        </p>
      </main>
    </SiteLayout>
  )
}
