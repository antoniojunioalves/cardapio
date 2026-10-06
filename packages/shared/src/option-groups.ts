/**
 * Grupo de opções — tamanho, adicionais, o que dá para tirar do lanche —: as
 * regras de coerência entre os limites de escolha e as opções, iguais na tela
 * que edita o grupo e na API que o grava.
 *
 * O caso que importa é o mínimo maior que o número de opções: "escolha 2" com
 * uma opção só torna o produto **impossível de pedir**, e ninguém perceberia
 * até o cliente travar no checkout. O máximo acima do número de opções é
 * inofensivo, mas é sempre engano de cadastro.
 */

export interface GrupoParaConferir {
  minSelections: number
  maxSelections: number
  options: readonly { name: string }[]
}

export type ProblemaDoGrupo =
  | 'SEM_OPCOES'
  | 'MINIMO_MAIOR_QUE_MAXIMO'
  | 'MINIMO_ACIMA_DAS_OPCOES'
  | 'MAXIMO_ACIMA_DAS_OPCOES'
  | 'NOMES_REPETIDOS'

/** O nome como as opções são comparadas: sem diferenciar maiúsculas nem espaços nas pontas. */
const nomeComparavel = (nome: string) => nome.trim().toLowerCase()

/** As posições das opções cujo nome já apareceu antes na lista. */
export function opcoesRepetidas(options: GrupoParaConferir['options']): number[] {
  const vistos = new Set<string>()
  return options.flatMap((opcao, indice) => {
    const nome = nomeComparavel(opcao.name)
    const repetida = nome !== '' && vistos.has(nome)
    vistos.add(nome)
    return repetida ? [indice] : []
  })
}

/** Os problemas do grupo, vazio se estiver tudo certo. */
export function problemasDoGrupoDeOpcoes(grupo: GrupoParaConferir): ProblemaDoGrupo[] {
  const problemas: ProblemaDoGrupo[] = []
  const total = grupo.options.length

  if (total === 0) problemas.push('SEM_OPCOES')
  if (grupo.minSelections > grupo.maxSelections) problemas.push('MINIMO_MAIOR_QUE_MAXIMO')
  if (total > 0 && grupo.minSelections > total) problemas.push('MINIMO_ACIMA_DAS_OPCOES')
  if (total > 0 && grupo.maxSelections > total) problemas.push('MAXIMO_ACIMA_DAS_OPCOES')
  if (opcoesRepetidas(grupo.options).length > 0) problemas.push('NOMES_REPETIDOS')

  return problemas
}

const escolhas = (n: number) => `${String(n)} ${n === 1 ? 'escolha' : 'escolhas'}`
const opcoes = (n: number) => `${String(n)} ${n === 1 ? 'opção' : 'opções'}`

/** O problema em palavras, para quem cadastra o grupo. */
export function mensagemDoProblemaDoGrupo(
  problema: ProblemaDoGrupo,
  grupo: GrupoParaConferir,
): string {
  const total = grupo.options.length
  switch (problema) {
    case 'SEM_OPCOES':
      return 'Cadastre ao menos uma opção.'
    case 'MINIMO_MAIOR_QUE_MAXIMO':
      return 'O mínimo de escolhas não pode ser maior que o máximo.'
    case 'MINIMO_ACIMA_DAS_OPCOES':
      return (
        `O grupo pede ${escolhas(grupo.minSelections)}, mas tem ${opcoes(total)}: ` +
        'o produto ficaria impossível de pedir.'
      )
    case 'MAXIMO_ACIMA_DAS_OPCOES':
      return `O máximo de escolhas (${String(grupo.maxSelections)}) passa do número de opções (${String(total)}).`
    case 'NOMES_REPETIDOS':
      return 'Há opções com o mesmo nome.'
  }
}
