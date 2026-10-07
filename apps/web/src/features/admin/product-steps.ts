import { useEffect } from 'react'

/**
 * O cadastro de um produto, em passos: os dados do produto — com a categoria —,
 * os itens (só no combo) e os opcionais. Aqui ficam as regras, sem tela: quais
 * passos existem, em que ordem, e a quais dá para ir.
 */

export type Passo = 'produto' | 'itens' | 'opcionais'

export const NOME_DO_PASSO: Record<Passo, string> = {
  produto: 'Produto',
  itens: 'Itens do combo',
  opcionais: 'Opcionais',
}

/** Os passos de um produto, na ordem. O combo tem um a mais: os itens dele. */
export function passosDe(tipo: 'SIMPLE' | 'COMBO'): Passo[] {
  return tipo === 'COMBO' ? ['produto', 'itens', 'opcionais'] : ['produto', 'opcionais']
}

/**
 * Dá para abrir o passo? O do produto, sempre; os itens e os opcionais, só com
 * o produto criado — é nele que a API os grava.
 */
export function passoDisponivel(passo: Passo, produtoCriado: boolean): boolean {
  return passo === 'produto' || produtoCriado
}

/** O passo do endereço, se existe para este produto e já dá para abri-lo; senão, o do produto. */
export function passoAberto(
  pedido: string | null,
  passos: readonly Passo[],
  produtoCriado: boolean,
): Passo {
  const passo = passos.find((p) => p === pedido)
  return passo && passoDisponivel(passo, produtoCriado) ? passo : 'produto'
}

/** Dos dois, o que vem depois na ordem dos passos. */
export function maisAdiante(passos: readonly Passo[], a: Passo | undefined, b: Passo): Passo {
  return a && passos.indexOf(a) > passos.indexOf(b) ? a : b
}

/**
 * Os passos que o cabeçalho deixa abrir. Editando, todos. Cadastrando, só até
 * onde o cadastro já chegou: voltar a um passo feito pode; pular um que ainda
 * não foi salvo, não — adiante se vai pelo botão do passo.
 */
export function passosAlcancaveis(
  passos: readonly Passo[],
  andamento: { cadastrando: boolean; produtoCriado: boolean; ate: Passo },
): Passo[] {
  return passos.filter(
    (passo, indice) =>
      passoDisponivel(passo, andamento.produtoCriado) &&
      (!andamento.cadastrando || indice <= passos.indexOf(andamento.ate)),
  )
}

export function passoSeguinte(passos: readonly Passo[], atual: Passo): Passo | undefined {
  return passos[passos.indexOf(atual) + 1]
}

export function passoAnterior(passos: readonly Passo[], atual: Passo): Passo | undefined {
  const indice = passos.indexOf(atual)
  return indice > 0 ? passos[indice - 1] : undefined
}

/**
 * Cada passo diz à moldura se tem alteração por salvar: é ela que segura a
 * saída para outro passo. Ao sair do passo, não há mais o que segurar.
 */
export function useAlteracaoDoPasso(alterado: boolean, aoAlterar: (alterado: boolean) => void) {
  useEffect(() => {
    aoAlterar(alterado)
    return () => {
      aoAlterar(false)
    }
  }, [alterado, aoAlterar])
}
