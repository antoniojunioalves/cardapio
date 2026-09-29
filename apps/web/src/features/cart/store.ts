import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { limitarQuantidade, limparObservacao, sanearCarrinhos, type ItemDoCarrinho } from './cart'
import { mesmaSelecao } from './selection'

/**
 * O carrinho no navegador, um por estabelecimento.
 *
 * Separado pelo slug: quem monta um pedido na lanchonete e abre a pizzaria
 * não pode ver os lanches no carrinho da pizza. O slug é só a chave local —
 * o estabelecimento do pedido será decidido pelo servidor, na Fase 11.
 */

export type NovoItem = Omit<ItemDoCarrinho, 'id'>

interface EstadoDoCarrinho {
  carrinhos: Record<string, ItemDoCarrinho[]>
  adicionar: (slug: string, novo: NovoItem) => void
  alterarQuantidade: (slug: string, itemId: string, quantidade: number) => void
  remover: (slug: string, itemId: string) => void
  esvaziar: (slug: string) => void
}

const SEM_ITENS: readonly ItemDoCarrinho[] = []

// Não usa `crypto.randomUUID`: ele só existe em contexto seguro, e o Vite
// aberto pelo IP da rede no celular (http) não é. O id é local e não precisa
// ser imprevisível.
let sequencia = 0
const novoId = () => `${Date.now().toString(36)}-${(++sequencia).toString(36)}`

export const useCarrinhoStore = create<EstadoDoCarrinho>()(
  persist(
    (set) => {
      const atualizar = (slug: string, mudar: (itens: ItemDoCarrinho[]) => ItemDoCarrinho[]) => {
        set((estado) => {
          const itens = mudar(estado.carrinhos[slug] ?? [])
          const carrinhos = { ...estado.carrinhos, [slug]: itens }
          if (itens.length === 0) delete carrinhos[slug]
          return { carrinhos }
        })
      }

      return {
        carrinhos: {},

        // O mesmo produto com as mesmas escolhas e a mesma observação soma
        // quantidade em vez de virar outra linha.
        adicionar: (slug, novo) => {
          const item = {
            ...novo,
            quantidade: limitarQuantidade(novo.quantidade),
            observacao: limparObservacao(novo.observacao),
          }
          atualizar(slug, (itens) => {
            const igual = itens.find(
              (i) =>
                i.productId === item.productId &&
                i.observacao === item.observacao &&
                mesmaSelecao(i.selecao, item.selecao),
            )
            if (!igual) return [...itens, { ...item, id: novoId() }]
            return itens.map((i) =>
              i === igual
                ? {
                    ...i,
                    nome: item.nome,
                    quantidade: limitarQuantidade(i.quantidade + item.quantidade),
                  }
                : i,
            )
          })
        },

        alterarQuantidade: (slug, itemId, quantidade) => {
          atualizar(slug, (itens) =>
            quantidade < 1
              ? itens.filter((i) => i.id !== itemId)
              : itens.map((i) =>
                  i.id === itemId ? { ...i, quantidade: limitarQuantidade(quantidade) } : i,
                ),
          )
        },

        remover: (slug, itemId) => {
          atualizar(slug, (itens) => itens.filter((i) => i.id !== itemId))
        },

        esvaziar: (slug) => {
          atualizar(slug, () => [])
        },
      }
    },
    {
      name: 'carrinho',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (estado) => ({ carrinhos: estado.carrinhos }),
      // O que vem do navegador passa pela mesma limpeza de um dado externo.
      merge: (guardado, atual) => ({
        ...atual,
        carrinhos: sanearCarrinhos((guardado as { carrinhos?: unknown } | undefined)?.carrinhos),
      }),
    },
  ),
)

/** Os itens e as ações do carrinho de um estabelecimento. */
export function useCarrinho(slug: string) {
  const itens = useCarrinhoStore((estado) => estado.carrinhos[slug] ?? SEM_ITENS)
  const adicionar = useCarrinhoStore((estado) => estado.adicionar)
  const alterarQuantidade = useCarrinhoStore((estado) => estado.alterarQuantidade)
  const remover = useCarrinhoStore((estado) => estado.remover)
  const esvaziar = useCarrinhoStore((estado) => estado.esvaziar)

  return {
    itens,
    adicionar: (novo: NovoItem) => {
      adicionar(slug, novo)
    },
    alterarQuantidade: (itemId: string, quantidade: number) => {
      alterarQuantidade(slug, itemId, quantidade)
    },
    remover: (itemId: string) => {
      remover(slug, itemId)
    },
    esvaziar: () => {
      esvaziar(slug)
    },
  }
}
