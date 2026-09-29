import { formatarEndereco, horariosPorDia } from '../presentation'
import type { CardapioPublico } from '../types'

/** Horários, endereço, contato e formas de pagamento, no fim da página. */
export function MenuInfo({ cardapio }: { cardapio: CardapioPublico }) {
  const endereco = formatarEndereco(cardapio.establishment.address)
  const telefone = cardapio.establishment.contactPhone

  return (
    <section aria-labelledby="informacoes" className="rounded-card bg-surface p-card shadow-card">
      <h2 id="informacoes" className="text-heading text-content">
        Informações
      </h2>

      <h3 className="text-body mt-stack font-semibold">Horário de funcionamento</h3>
      {cardapio.hours.length === 0 ? (
        <p className="text-caption text-content-muted">Horário não informado.</p>
      ) : (
        <dl className="text-caption mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {horariosPorDia(cardapio.hours).map(({ dia, intervalos }) => (
            <div key={dia} className="contents">
              <dt className="text-content-muted capitalize">{dia}</dt>
              <dd>{intervalos.length > 0 ? intervalos.join(', ') : 'Fechado'}</dd>
            </div>
          ))}
        </dl>
      )}

      {endereco && (
        <>
          <h3 className="text-body mt-stack font-semibold">Endereço</h3>
          <p className="text-caption text-content-muted">{endereco}</p>
        </>
      )}

      {telefone && (
        <>
          <h3 className="text-body mt-stack font-semibold">Contato</h3>
          <p className="text-caption">
            <a href={`tel:+${telefone}`} className="text-primary underline">
              {telefone}
            </a>
          </p>
        </>
      )}

      {cardapio.paymentMethods.length > 0 && (
        <>
          <h3 className="text-body mt-stack font-semibold">Formas de pagamento</h3>
          <ul className="text-caption mt-1 flex flex-wrap gap-2">
            {cardapio.paymentMethods.map((forma) => (
              <li key={forma.id} className="rounded-pill border border-border px-3 py-1">
                {forma.name}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
