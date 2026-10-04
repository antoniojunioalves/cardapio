import { useEffect, useState } from 'react'

/**
 * Quais categorias estão abertas na lista do cardápio.
 *
 * Elas começam recolhidas: o dono abre a categoria em que vai trabalhar. A
 * escolha dura enquanto a aba do navegador estiver aberta (`sessionStorage`)
 * — ir editar um produto e voltar não fecha a categoria —, e amanhã a lista
 * começa recolhida de novo.
 */

const chave = (slug: string) => `painel:cardapio:abertas:${slug}`

function ler(slug: string): Set<string> {
  try {
    const guardadas: unknown = JSON.parse(sessionStorage.getItem(chave(slug)) ?? '[]')
    return new Set(Array.isArray(guardadas) ? guardadas.filter((id) => typeof id === 'string') : [])
  } catch {
    // Sem armazenamento (janela anônima, bloqueio do navegador): só não lembra.
    return new Set()
  }
}

function gravar(slug: string, abertas: ReadonlySet<string>) {
  try {
    sessionStorage.setItem(chave(slug), JSON.stringify([...abertas]))
  } catch {
    // Idem: a lista funciona do mesmo jeito, só não lembra na volta.
  }
}

/**
 * @param abrirNaChegada a categoria que deve estar aberta ao chegar — a recém-
 *   criada, ou a do produto de onde a pessoa voltou.
 */
export function useCategoriasAbertas(slug: string, abrirNaChegada: string | undefined) {
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(() => {
    const lidas = ler(slug)
    if (abrirNaChegada) lidas.add(abrirNaChegada)
    return lidas
  })

  useEffect(() => {
    gravar(slug, abertas)
  }, [slug, abertas])

  return {
    aberta: (id: string) => abertas.has(id),
    alternar: (id: string) => {
      setAbertas((atuais) => {
        const novas = new Set(atuais)
        if (novas.has(id)) novas.delete(id)
        else novas.add(id)
        return novas
      })
    },
    abrirTodas: (ids: readonly string[]) => {
      setAbertas(new Set(ids))
    },
    recolherTodas: () => {
      setAbertas(new Set())
    },
  }
}
