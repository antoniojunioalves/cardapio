import { IconeInfo } from '@/components/icons'

import { descreverStatus } from '../presentation'
import type { CardapioPublico } from '../types'

interface MenuHeaderProps {
  cardapio: CardapioPublico
  /** Abre a janela com entrega, horários, endereço, contato e formas de pagamento. */
  aoAbrirInfo: () => void
}

/** Capa, logo, nome e status. O resto — entrega, horários, pagamento — fica na janela "Info". */
export function MenuHeader({ cardapio, aoAbrirInfo }: MenuHeaderProps) {
  const { establishment } = cardapio
  const status = descreverStatus(cardapio.status)

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
            className={`mt-stack flex items-center gap-2 rounded-control px-3 py-2 ${
              status.aberto ? 'bg-brand-50 text-brand-800' : 'bg-accent-50 text-accent-800'
            }`}
          >
            <div
              role="status"
              className="text-body flex min-w-0 flex-1 flex-wrap items-center gap-x-2"
            >
              <span className="font-semibold">{status.titulo}</span>
              {status.detalhe && <span className="text-caption">· {status.detalhe}</span>}
            </div>

            {/*
             * Discreto, mas de outra cor: sem borda, e no azul de informação para
             * se destacar do texto do status, na faixa verde e na âmbar. Fica
             * fora do `role="status"`, que é um anúncio, não um lugar de botão.
             * As margens negativas dão área de toque sem engordar a faixa.
             */}
            <button
              type="button"
              onClick={aoAbrirInfo}
              aria-label="Informações do estabelecimento"
              className="text-caption -my-1 -mr-1 flex shrink-0 items-center gap-1 rounded-control px-2 py-2 font-semibold text-info hover:bg-surface/60"
            >
              <IconeInfo className="size-4" />
              Info
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
