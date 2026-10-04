import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'

import {
  IconeConfiguracoes,
  IconeExterno,
  IconeInicio,
  IconePedidos,
  IconeSair,
  type IconeProps,
} from '@/components/icons'

import { caminhoDoPainel, itensDoMenu, type IconeDoMenu, type ItemDoMenu } from '../menu'

const ICONES: Record<IconeDoMenu, (props: IconeProps) => ReactNode> = {
  inicio: IconeInicio,
  pedidos: IconePedidos,
  configuracoes: IconeConfiguracoes,
}

const linha =
  'text-body flex items-center gap-3 rounded-control px-3 py-2.5 font-semibold text-content-inverted/80 hover:bg-content-inverted/10 hover:text-content-inverted'

interface AdminNavProps {
  id: string
  slug: string
  estabelecimento: string
  nomeDoUsuario: string
  permissoes: readonly string[]
  /** Pedidos esperando ser aceitos: o número ao lado de "Pedidos". */
  novos: number
  /** Só vale em tela pequena, onde o menu é uma gaveta; em tela grande ele fica sempre à vista. */
  aberto: boolean
  aoNavegar: () => void
  aoSair: () => void
}

/**
 * O menu do painel. Um elemento só: em tela pequena, uma gaveta que entra pela
 * esquerda; a partir de `lg`, uma coluna fixa. Fechada, a gaveta fica
 * `invisible` — fora do teclado e do leitor de tela, e não só fora da vista.
 */
export function AdminNav({
  id,
  slug,
  estabelecimento,
  nomeDoUsuario,
  permissoes,
  novos,
  aberto,
  aoNavegar,
  aoSair,
}: AdminNavProps) {
  const itens = itensDoMenu(permissoes)

  const linhaDoItem = (item: ItemDoMenu) => {
    const Icone = ICONES[item.icone]
    const comNovos = item.icone === 'pedidos' && novos > 0
    return (
      <li key={item.caminho}>
        <NavLink
          to={caminhoDoPainel(slug, item.caminho)}
          // Sem `end`, o Início ficaria marcado em todas as telas do painel.
          end
          onClick={aoNavegar}
          // O número sozinho não diz nada a quem ouve a página: o rótulo diz o que ele conta.
          aria-label={
            comNovos
              ? `${item.rotulo}, ${String(novos)} ${novos === 1 ? 'novo' : 'novos'}`
              : undefined
          }
          className={({ isActive }) =>
            `${linha} ${isActive ? 'bg-primary text-primary-content hover:bg-primary' : ''}`
          }
        >
          <Icone />
          <span className="flex-1">{item.rotulo}</span>
          {comNovos && (
            <span
              aria-hidden="true"
              className="text-caption rounded-pill bg-accent-400 px-2 py-0.5 font-semibold text-neutral-950"
            >
              {novos}
            </span>
          )}
        </NavLink>
      </li>
    )
  }

  return (
    <aside
      id={id}
      className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col gap-section-y overflow-y-auto bg-surface-inverted p-card text-content-inverted transition-[transform,visibility] lg:visible lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-64 lg:shrink-0 lg:translate-x-0 ${
        aberto ? 'visible translate-x-0 shadow-overlay' : 'invisible -translate-x-full'
      }`}
    >
      <div className="px-3">
        <p className="text-heading line-clamp-2 break-words">{estabelecimento}</p>
        <p className="text-caption text-content-inverted/60">Painel do estabelecimento</p>
      </div>

      {/* Um `nav` só, do primeiro item ao "Sair": o rodapé também é navegação do painel. */}
      <nav aria-label="Painel" className="flex flex-1 flex-col gap-section-y">
        <ul className="flex flex-1 flex-col gap-1">
          {itens.filter((item) => !item.rodape).map(linhaDoItem)}
        </ul>

        <ul className="flex flex-col gap-1 border-t border-content-inverted/20 pt-stack">
          <li>
            <Link to={`/${slug}`} target="_blank" rel="noreferrer" className={linha}>
              <IconeExterno />
              Ver cardápio
            </Link>
          </li>
          {itens.filter((item) => item.rodape).map(linhaDoItem)}
          <li>
            <p className="text-caption truncate px-3 py-1 text-content-inverted/60">
              {nomeDoUsuario}
            </p>
          </li>
          <li>
            <button type="button" onClick={aoSair} className={`${linha} w-full text-left`}>
              <IconeSair />
              Sair
            </button>
          </li>
        </ul>
      </nav>
    </aside>
  )
}
