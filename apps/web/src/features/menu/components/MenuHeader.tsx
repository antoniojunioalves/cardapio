import { descreverStatus, resumoDaEntrega } from '../presentation'
import type { CardapioPublico } from '../types'

/** Capa, logo, nome, status e condições de entrega. */
export function MenuHeader({ cardapio }: { cardapio: CardapioPublico }) {
  const { establishment } = cardapio
  const status = descreverStatus(cardapio.status)
  const condicoes = resumoDaEntrega(cardapio.delivery, establishment.minimumOrderInCents)

  return (
    <header>
      <div className="h-36 bg-primary sm:h-48">
        {establishment.coverUrl && (
          <img src={establishment.coverUrl} alt="" className="size-full object-cover" />
        )}
      </div>

      <div className="px-page-x">
        {/*
         * `relative` é o que mantém o cartão por cima da capa. Sem ele, o
         * navegador pinta primeiro os fundos e depois o conteúdo em linha: a
         * <img> da capa cobria o fundo branco do cartão, e só o logo e o nome
         * — também conteúdo em linha, e depois no HTML — ficavam visíveis.
         */}
        <div className="relative mx-auto -mt-10 max-w-3xl rounded-card bg-surface p-card shadow-raised">
          <div className="flex items-start gap-stack">
            {establishment.logoUrl ? (
              <img
                src={establishment.logoUrl}
                alt={`Logo de ${establishment.name}`}
                className="size-16 shrink-0 rounded-control border border-border object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-16 shrink-0 items-center justify-center rounded-control bg-primary text-display text-primary-content"
              >
                {establishment.name.charAt(0)}
              </span>
            )}

            <div className="min-w-0">
              <h1 className="text-heading text-content">{establishment.name}</h1>
              {establishment.description && (
                <p className="text-caption mt-1 text-content-muted">{establishment.description}</p>
              )}
            </div>
          </div>

          <div
            role="status"
            className={`text-body mt-stack flex flex-wrap items-center gap-x-2 rounded-control px-3 py-2 ${
              status.aberto ? 'bg-brand-50 text-brand-800' : 'bg-accent-50 text-accent-800'
            }`}
          >
            <span className="font-semibold">{status.titulo}</span>
            {status.detalhe && <span className="text-caption">· {status.detalhe}</span>}
          </div>

          {condicoes.length > 0 && (
            <ul className="text-caption mt-stack flex flex-wrap gap-2 text-content-muted">
              {condicoes.map((frase) => (
                <li key={frase} className="rounded-pill border border-border px-3 py-1">
                  {frase}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </header>
  )
}
