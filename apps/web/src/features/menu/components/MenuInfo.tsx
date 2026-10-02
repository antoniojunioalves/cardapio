import { formatarTelefone } from '@repo/shared'

import { Sheet } from '@/components/Sheet'

import { formatarEndereco, horariosPorDia, resumoDaEntrega } from '../presentation'
import type { CardapioPublico } from '../types'

interface MenuInfoProps {
  cardapio: CardapioPublico
  aoFechar: () => void
}

/**
 * A janela de informações do estabelecimento — entrega e retirada, horários,
 * endereço, contato e formas de pagamento —, aberta pelo botão "Info" ao lado
 * do status.
 */
export function MenuInfo({ cardapio, aoFechar }: MenuInfoProps) {
  const endereco = formatarEndereco(cardapio.establishment.address)
  const telefone = cardapio.establishment.contactPhone
  const condicoes = resumoDaEntrega(cardapio.delivery, cardapio.establishment.minimumOrderInCents)

  return (
    <Sheet titulo="Informações" aoFechar={aoFechar}>
      <div className="flex flex-col gap-stack">
        {condicoes.length > 0 && (
          <section>
            <h3 className="text-body font-semibold text-content">Entrega e retirada</h3>
            <ul className="text-caption mt-1 flex flex-wrap gap-2">
              {condicoes.map((frase) => (
                <li key={frase} className="rounded-pill border border-border px-3 py-1">
                  {frase}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="text-body font-semibold text-content">Horário de funcionamento</h3>
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
        </section>

        {endereco && (
          <section>
            <h3 className="text-body font-semibold text-content">Endereço</h3>
            <p className="text-caption text-content-muted">{endereco}</p>
          </section>
        )}

        {telefone && (
          <section>
            <h3 className="text-body font-semibold text-content">Contato</h3>
            <p className="text-caption">
              <a href={`tel:+${telefone}`} className="text-primary underline">
                {/* Guardado só com dígitos e o país; um valor antigo, livre, aparece como está. */}
                {/^55\d{10,11}$/.test(telefone) ? formatarTelefone(telefone) : telefone}
              </a>
            </p>
          </section>
        )}

        {cardapio.paymentMethods.length > 0 && (
          <section>
            <h3 className="text-body font-semibold text-content">Formas de pagamento</h3>
            <ul className="text-caption mt-1 flex flex-wrap gap-2">
              {cardapio.paymentMethods.map((forma) => (
                <li key={forma.id} className="rounded-pill border border-border px-3 py-1">
                  {forma.name}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Sheet>
  )
}
