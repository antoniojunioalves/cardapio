import type { ReactNode } from 'react'

import { IconeHistorico, IconeInicio, IconePerfil, type IconeProps } from '@/components/icons'

interface Item {
  rotulo: string
  Icone: (props: IconeProps) => ReactNode
  /** A tela em que a pessoa está. */
  atual?: boolean
}

/**
 * Por ora só o visual: o cardápio é o Início, e Histórico e Perfil ainda não
 * levam a lugar nenhum. Quando ganharem tela, viram links aqui.
 */
const ITENS: readonly Item[] = [
  { rotulo: 'Início', Icone: IconeInicio, atual: true },
  { rotulo: 'Histórico', Icone: IconeHistorico },
  { rotulo: 'Perfil', Icone: IconePerfil },
]

/**
 * O menu de baixo do cardápio. Não é `fixed` por conta própria: quem o prende
 * ao fim da tela é a pilha de barras da página, que põe o carrinho logo acima.
 */
export function BottomNav() {
  return (
    <nav
      aria-label="Menu do cardápio"
      // O recuo de baixo é a área do gesto de início do iPhone.
      className="border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-3xl">
        {ITENS.map(({ rotulo, Icone, atual }) => (
          <li key={rotulo} className="flex-1">
            <button
              type="button"
              aria-current={atual ? 'page' : undefined}
              // Sem função ainda: quem usa leitor de tela ouve que o item está
              // indisponível, em vez de tocar e nada acontecer.
              aria-disabled={atual ? undefined : true}
              className={`text-caption flex h-14 w-full flex-col items-center justify-center gap-0.5 font-semibold ${
                atual ? 'text-primary' : 'cursor-default text-content-muted'
              }`}
            >
              <Icone className="size-6" />
              {rotulo}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
