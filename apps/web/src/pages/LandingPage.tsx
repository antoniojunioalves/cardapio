import { app as product } from '@repo/config'
import { useEffect } from 'react'
import { Link } from 'react-router'

import { SiteLayout } from '@/components/SiteLayout'

const botaoPrincipal =
  'text-body rounded-control bg-primary px-5 py-3 text-center font-semibold text-primary-content hover:bg-primary-hover'
const botaoSecundario =
  'text-body rounded-control border border-border-strong bg-surface px-5 py-3 text-center font-semibold text-content hover:bg-neutral-50'

const PASSOS = [
  {
    titulo: 'Cadastre o estabelecimento',
    texto: 'Nome, endereço do cardápio e seu e-mail. Confirmou o e-mail, o cardápio está no ar.',
  },
  {
    titulo: 'Monte o cardápio',
    texto:
      'Categorias, produtos com foto, adicionais, combos, horários, entrega e formas de pagamento.',
  },
  {
    titulo: 'Receba os pedidos',
    texto:
      'O cliente pede pelo celular, e o pedido chega pronto no seu WhatsApp e no painel, na hora.',
  },
]

const RECURSOS = [
  {
    titulo: 'Um link só seu',
    texto: `Seu cardápio em ${window.location.host}/seu-estabelecimento, para mandar aos clientes e divulgar.`,
  },
  {
    titulo: 'Pedido com a conta certa',
    texto:
      'Preço, adicionais, taxa de entrega e total são calculados pelo sistema — o cliente não altera.',
  },
  {
    titulo: 'Painel ao vivo',
    texto: 'Pedido novo aparece sem recarregar, com alerta sonoro e o status de cada um.',
  },
]

/** A página inicial do produto, em `/`. */
export function LandingPage() {
  useEffect(() => {
    document.title = product.name
  }, [])

  return (
    <SiteLayout
      acoes={
        <Link to="/entrar" className="text-body font-semibold text-primary hover:underline">
          Entrar
        </Link>
      }
    >
      <main>
        <section className="bg-surface">
          <div className="mx-auto flex max-w-4xl flex-col gap-section-y px-page-x py-12">
            <div className="flex flex-col gap-stack">
              <h1 className="text-display text-content">
                Seu cardápio digital, com pedidos pelo WhatsApp
              </h1>
              <p className="text-body max-w-2xl text-content-muted">{product.description}</p>
            </div>
            <div className="flex flex-col gap-stack sm:flex-row">
              <Link to="/cadastro" className={botaoPrincipal}>
                Começar grátis
              </Link>
              <Link to="/entrar" className={botaoSecundario}>
                Já tenho conta
              </Link>
            </div>
            <p className="text-caption text-content-muted">
              Plano gratuito, sem cartão de crédito. O cardápio fica pronto em minutos.
            </p>
          </div>
        </section>

        <section aria-labelledby="como-funciona" className="mx-auto max-w-4xl px-page-x py-12">
          <h2 id="como-funciona" className="text-heading mb-section-y text-content">
            Como funciona
          </h2>
          <ol className="grid gap-stack sm:grid-cols-3">
            {PASSOS.map((passo, indice) => (
              <li key={passo.titulo} className="rounded-card bg-surface p-card shadow-card">
                <span
                  aria-hidden="true"
                  className="text-caption mb-2 inline-flex size-7 items-center justify-center rounded-pill bg-brand-100 font-semibold text-brand-800"
                >
                  {indice + 1}
                </span>
                <h3 className="text-body font-semibold text-content">{passo.titulo}</h3>
                <p className="text-caption mt-1 text-content-muted">{passo.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="recursos" className="bg-surface">
          <div className="mx-auto max-w-4xl px-page-x py-12">
            <h2 id="recursos" className="text-heading mb-section-y text-content">
              O que vem junto
            </h2>
            <ul className="grid gap-stack sm:grid-cols-3">
              {RECURSOS.map((recurso) => (
                <li key={recurso.titulo} className="rounded-card border border-border p-card">
                  <h3 className="text-body font-semibold text-content">{recurso.titulo}</h3>
                  <p className="text-caption mt-1 text-content-muted">{recurso.texto}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto flex max-w-4xl flex-col items-start gap-stack px-page-x py-12">
          <h2 className="text-heading text-content">Pronto para começar?</h2>
          <Link to="/cadastro" className={botaoPrincipal}>
            Cadastrar meu estabelecimento
          </Link>
        </section>
      </main>
    </SiteLayout>
  )
}
