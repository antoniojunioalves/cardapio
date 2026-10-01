import { useEffect } from 'react'
import { useOutletContext } from 'react-router'

import type { EstadoDaConexao } from './live'
import type { UsuarioDoPainel } from './session'

/**
 * O que a moldura do painel (`AdminLayout`) entrega a cada tela. A sessão já
 * foi conferida lá: uma tela do painel nunca roda sem usuário.
 */
export interface ContextoDoPainel {
  slug: string
  estabelecimento: string
  usuario: UsuarioDoPainel
  permissoes: readonly string[]
  /** A conexão ao vivo é uma só, da moldura; as telas só leem o estado. */
  conexao: EstadoDaConexao
  /** Pedidos esperando ser aceitos. */
  novos: number
}

export function usePainel(): ContextoDoPainel {
  return useOutletContext<ContextoDoPainel>()
}

/**
 * O título da aba, com os pedidos novos na frente — `(2) Pedidos` — para quem
 * está com outra aba aberta, em qualquer tela do painel.
 */
export function useTituloDoPainel(titulo: string): void {
  const { novos } = usePainel()
  useEffect(() => {
    document.title = novos > 0 ? `(${String(novos)}) ${titulo}` : titulo
  }, [novos, titulo])
}
