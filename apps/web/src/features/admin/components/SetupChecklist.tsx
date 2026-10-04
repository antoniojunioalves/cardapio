import { Link } from 'react-router'

import { IconeFeito, IconePendente } from '@/components/icons'

import { PASSOS, useChecklist } from '../checklist'
import { caminhoDoPainel } from '../menu'

/**
 * "O que falta para receber pedidos", no Início do painel. Some quando tudo
 * está feito — e volta se algo deixar de estar, como a entrega desligada.
 */
export function SetupChecklist({ slug }: { slug: string }) {
  const { data } = useChecklist(slug, true)
  if (!data || data.ready) return null

  const feitos = data.steps.filter((passo) => passo.done).length

  return (
    <section
      aria-labelledby="o-que-falta"
      className="flex flex-col gap-stack rounded-card bg-surface p-card shadow-card"
    >
      <div>
        <h2 id="o-que-falta" className="text-body font-semibold text-content">
          O que falta para receber pedidos
        </h2>
        <p className="text-caption text-content-muted">
          {feitos} de {data.steps.length} passos feitos.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {data.steps.map(({ key, done }) => {
          const { titulo, comoFazer, caminho } = PASSOS[key]
          return (
            <li key={key} className="flex items-start gap-3">
              <span className={done ? 'text-success' : 'text-content-muted'}>
                {done ? <IconeFeito /> : <IconePendente />}
              </span>
              <div className="min-w-0">
                <p
                  className={`text-body ${done ? 'text-content-muted' : 'font-semibold text-content'}`}
                >
                  {titulo}
                  <span className="sr-only">{done ? ' — feito' : ' — falta'}</span>
                </p>
                {!done && <p className="text-caption text-content-muted">{comoFazer}</p>}
                {!done && caminho && (
                  <Link
                    to={caminhoDoPainel(slug, caminho)}
                    className="text-caption font-semibold text-primary hover:underline"
                  >
                    Abrir as configurações
                  </Link>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
