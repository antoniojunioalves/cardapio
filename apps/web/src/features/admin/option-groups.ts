import {
  mensagemDoProblemaDoGrupo,
  opcoesRepetidas,
  problemasDoGrupoDeOpcoes,
  textoObrigatorio,
  type ProblemaDoGrupo,
} from '@repo/shared'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { descreverRegraDoGrupo } from '@/features/cart/selection'

import { chaveDoCatalogo, chaveDoProduto, type Produto } from './catalog'
import { chaveDoChecklist } from './checklist'
import { comCamposValidos, reais, reaisSemSimbolo, textoOpcional } from './form-fields'
import { comSessao } from './session'

/**
 * Grupos de opção — tamanho, adicionais, o que dá para tirar — e combos, no
 * painel. Um grupo é do estabelecimento, e não de um produto: "Adicionais" se
 * cria uma vez e se liga a vários lanches.
 */

export interface Opcao {
  id: string
  name: string
  /** Quanto a opção soma ao preço do produto. Zero: não muda o preço. */
  priceDeltaInCents: number
  isAvailable: boolean
  sortOrder: number
}

/** Um grupo, como `GET /api/v1/admin/option-groups` devolve. */
export interface GrupoDeOpcoes {
  id: string
  name: string
  description: string | null
  minSelections: number
  maxSelections: number
  /** Derivado do mínimo: com mínimo 1 ou mais, o cliente tem de escolher. */
  isRequired: boolean
  options: Opcao[]
  /** Os produtos que usam o grupo: mudar o grupo muda todos eles. */
  products: { id: string; name: string }[]
}

/** Um item de um combo, como `GET /products/:id/combo-items` devolve. */
export interface ItemDoCombo {
  productId: string
  name: string
  priceInCents: number
  isAvailable: boolean
  quantity: number
}

export interface ComposicaoDoCombo {
  items: ItemDoCombo[]
  precoAvulsoEmCentavos: number
  todosDisponiveis: boolean
}

// --- Em palavras -----------------------------------------------------------------

/** "Escolha 1 · obrigatório", "Escolha até 3 · opcional". */
export function regraEmPalavras(grupo: Pick<GrupoDeOpcoes, 'minSelections' | 'maxSelections'>) {
  return `${descreverRegraDoGrupo(grupo)} · ${grupo.minSelections >= 1 ? 'obrigatório' : 'opcional'}`
}

/** "Bacon (+R$ 5,00), Cheddar (+R$ 4,00), Ovo (esgotado)". */
export function opcoesEmPalavras(opcoes: readonly Opcao[]): string {
  return opcoes
    .map((o) => {
      const extras = [
        o.priceDeltaInCents > 0 ? `+R$ ${reaisSemSimbolo(o.priceDeltaInCents)}` : null,
        o.isAvailable ? null : 'esgotado',
      ].filter(Boolean)
      return extras.length > 0 ? `${o.name} (${extras.join(', ')})` : o.name
    })
    .join(', ')
}

/** "X-Burger", "X-Burger e X-Salada", "X-Burger, X-Salada e Combo do Zé". */
export function listaEmPalavras(nomes: readonly string[]): string {
  if (nomes.length <= 1) return nomes.join('')
  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1) ?? ''}`
}

/** Por que o grupo não pode ser excluído agora, ou `null` se pode. */
export function porQueNaoExcluirGrupo(grupo: Pick<GrupoDeOpcoes, 'products'>): string | null {
  const nomes = grupo.products.map((p) => p.name)
  if (nomes.length === 0) return null
  return (
    `O grupo está em ${listaEmPalavras(nomes)}. Para excluí-lo, tire-o ` +
    (nomes.length === 1
      ? 'desse produto antes, na página dele.'
      : 'desses produtos antes, na página de cada um.')
  )
}

// --- Formulário do grupo ---------------------------------------------------------

/** Um número inteiro digitado, de `minimo` a 50. */
const escolhas = (minimo: number, mensagem: string) =>
  z.string().transform((valor, ctx) => {
    const texto = valor.trim()
    const numero = Number(texto)
    if (!/^\d{1,2}$/.test(texto) || numero < minimo || numero > 50) {
      ctx.addIssue({ code: 'custom', message: mensagem })
      return z.NEVER
    }
    return numero
  })

const numero = (valor: unknown) => typeof valor === 'number'

interface GrupoConferido {
  minSelections: number
  maxSelections: number
  options: { name: string }[]
}

type CampoDoGrupo = 'minSelections' | 'maxSelections' | 'options'

/**
 * Uma regra do grupo, de `@repo/shared`, como `refine` do formulário: o erro
 * vai no `campo`, e a regra roda quando os campos de que ela depende estão
 * válidos — mesmo que outro esteja errado.
 */
function regra(
  problema: ProblemaDoGrupo,
  campo: CampoDoGrupo,
  dependeDe: readonly CampoDoGrupo[],
): [
  (v: GrupoConferido) => boolean,
  {
    path: PropertyKey[]
    error: (issue: { input: unknown }) => string
    when: (entrada: { value: unknown }) => boolean
  },
] {
  return [
    (v) => !problemasDoGrupoDeOpcoes(v).includes(problema),
    {
      path: [campo],
      error: (issue) => mensagemDoProblemaDoGrupo(problema, issue.input as GrupoConferido),
      when: comCamposValidos(dependeDe, (valor) => numero(valor) || Array.isArray(valor)),
    },
  ]
}

/**
 * O formulário do grupo. Recebe o que a pessoa digita — números como texto,
 * acréscimos em reais — e entrega o corpo de `POST`/`PUT /option-groups`. As
 * regras entre os limites e as opções são as de `@repo/shared`, as mesmas que
 * a API aplica ao gravar.
 */
export const formularioDoGrupoSchema = z
  .object({
    name: textoObrigatorio(80, 'Informe o nome do grupo.'),
    description: textoOpcional(500),
    minSelections: escolhas(0, 'Informe um número de 0 a 50.'),
    maxSelections: escolhas(1, 'Informe um número de 1 a 50.'),
    options: z
      .array(
        z.object({
          id: z.string().optional(),
          name: textoObrigatorio(80, 'Informe o nome da opção.'),
          priceDeltaInCents: reais,
          isAvailable: z.boolean(),
        }),
      )
      .max(100, 'Use no máximo 100 opções.')
      .superRefine((opcoes, ctx) => {
        for (const indice of opcoesRepetidas(opcoes)) {
          ctx.addIssue({
            code: 'custom',
            message: 'Já existe uma opção com este nome.',
            path: [indice, 'name'],
          })
        }
      }),
  })
  .refine(...regra('SEM_OPCOES', 'options', ['options']))
  .refine(...regra('MINIMO_MAIOR_QUE_MAXIMO', 'maxSelections', ['minSelections', 'maxSelections']))
  .refine(...regra('MINIMO_ACIMA_DAS_OPCOES', 'minSelections', ['minSelections', 'options']))
  .refine(...regra('MAXIMO_ACIMA_DAS_OPCOES', 'maxSelections', ['maxSelections', 'options']))

export type ValoresDoGrupo = z.input<typeof formularioDoGrupoSchema>
export type DadosDoGrupo = z.output<typeof formularioDoGrupoSchema>

export const OPCAO_NOVA: ValoresDoGrupo['options'][number] = {
  name: '',
  priceDeltaInCents: '',
  isAvailable: true,
}

export const GRUPO_NOVO: ValoresDoGrupo = {
  name: '',
  description: '',
  minSelections: '0',
  maxSelections: '1',
  options: [OPCAO_NOVA],
}

export function grupoParaFormulario(grupo: GrupoDeOpcoes): ValoresDoGrupo {
  return {
    name: grupo.name,
    description: grupo.description ?? '',
    minSelections: String(grupo.minSelections),
    maxSelections: String(grupo.maxSelections),
    options: grupo.options.map((o) => ({
      id: o.id,
      name: o.name,
      priceDeltaInCents: reaisSemSimbolo(o.priceDeltaInCents),
      isAvailable: o.isAvailable,
    })),
  }
}

/** O caminho de um campo de uma opção, como o formulário o conhece. */
export const campoDaOpcao = <C extends 'name' | 'priceDeltaInCents' | 'isAvailable'>(
  indice: number,
  campo: C,
) => `options.${String(indice)}.${campo}` as `options.${number}.${C}`

/**
 * A regra digitada em palavras, para a pessoa conferir o que o cliente vai
 * ver. Com o mínimo ou o máximo ainda inválidos, nada.
 */
export function regraDigitada(minimo: string, maximo: string): string | null {
  const min = Number(minimo)
  const max = Number(maximo)
  if (!/^\d{1,2}$/.test(minimo.trim()) || !/^\d{1,2}$/.test(maximo.trim()) || min > max || max < 1)
    return null
  return regraEmPalavras({ minSelections: min, maxSelections: max })
}

// --- API -------------------------------------------------------------------------

export const chaveDosGrupos = (slug: string) => [...chaveDoCatalogo(slug), 'grupos'] as const
export const chaveDosGruposDoProduto = (slug: string, produtoId: string) =>
  [...chaveDoProduto(slug, produtoId), 'grupos'] as const
export const chaveDaComposicao = (slug: string, comboId: string) =>
  [...chaveDoProduto(slug, comboId), 'combo'] as const

export function useGrupos(slug: string) {
  return useQuery({
    queryKey: chaveDosGrupos(slug),
    queryFn: () => comSessao<GrupoDeOpcoes[]>('/api/v1/admin/option-groups'),
  })
}

export function useGruposDoProduto(slug: string, produtoId: string) {
  return useQuery({
    queryKey: chaveDosGruposDoProduto(slug, produtoId),
    queryFn: () => comSessao<GrupoDeOpcoes[]>(`/api/v1/admin/products/${produtoId}/option-groups`),
  })
}

export function useComposicao(slug: string, comboId: string) {
  return useQuery({
    queryKey: chaveDaComposicao(slug, comboId),
    queryFn: () => comSessao<ComposicaoDoCombo>(`/api/v1/admin/products/${comboId}/combo-items`),
  })
}

/**
 * Depois de mexer num grupo ou nos grupos de um produto, o resto do cardápio
 * que depende disso: a lista dos grupos (quem usa cada um), os grupos dos
 * produtos e a lista do Início ("ao menos um produto à venda" — opção
 * obrigatória toda esgotada tira o produto de venda).
 */
function marcarGrupos(queryClient: QueryClient, slug: string) {
  // A lista dos grupos e a de cada produto: as duas chaves terminam em "grupos".
  void queryClient.invalidateQueries({
    predicate: ({ queryKey }) =>
      queryKey[0] === 'painel' &&
      queryKey[1] === 'catalogo' &&
      queryKey[2] === slug &&
      queryKey.at(-1) === 'grupos',
  })
  void queryClient.invalidateQueries({ queryKey: chaveDoChecklist(slug) })
}

/**
 * Cria (sem `id`) ou altera um grupo. O grupo salvo entra na lista na hora, sem
 * esperar a releitura: quem o criou a partir de um produto já o vê para ligar.
 */
export function useSalvarGrupo(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dados }: { id?: string | undefined; dados: DadosDoGrupo }) =>
      id
        ? comSessao<GrupoDeOpcoes>(`/api/v1/admin/option-groups/${id}`, {
            method: 'PUT',
            body: dados,
          })
        : comSessao<GrupoDeOpcoes>('/api/v1/admin/option-groups', {
            method: 'POST',
            body: dados,
          }),
    onSuccess: (salvo) => {
      queryClient.setQueryData<GrupoDeOpcoes[]>(chaveDosGrupos(slug), (atuais) =>
        atuais?.some((g) => g.id === salvo.id)
          ? atuais.map((g) => (g.id === salvo.id ? salvo : g))
          : [...(atuais ?? []), salvo],
      )
      marcarGrupos(queryClient, slug)
    },
  })
}

export function useExcluirGrupo(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      comSessao<undefined>(`/api/v1/admin/option-groups/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      queryClient.setQueryData<GrupoDeOpcoes[]>(chaveDosGrupos(slug), (atuais) =>
        atuais?.filter((g) => g.id !== id),
      )
      marcarGrupos(queryClient, slug)
    },
  })
}

/** Os grupos do produto, na ordem em que o cliente os vê: a lista inteira. */
export function useDefinirGruposDoProduto(slug: string, produtoId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (groupIds: readonly string[]) =>
      comSessao<GrupoDeOpcoes[]>(`/api/v1/admin/products/${produtoId}/option-groups`, {
        method: 'PUT',
        body: { groupIds },
      }),
    onSuccess: (grupos) => {
      queryClient.setQueryData(chaveDosGruposDoProduto(slug, produtoId), grupos)
      marcarGrupos(queryClient, slug)
    },
  })
}

/** Os itens do combo: a lista inteira, com as quantidades. */
export function useDefinirComposicao(slug: string, comboId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (items: { productId: string; quantity: number }[]) =>
      comSessao<ComposicaoDoCombo>(`/api/v1/admin/products/${comboId}/combo-items`, {
        method: 'PUT',
        body: { items },
      }),
    onSuccess: (composicao) => {
      queryClient.setQueryData(chaveDaComposicao(slug, comboId), composicao)
      // Combo sem itens não está à venda: a lista do Início pode mudar.
      void queryClient.invalidateQueries({ queryKey: chaveDoChecklist(slug) })
    },
  })
}

// --- Itens do combo ----------------------------------------------------------------

/** Os produtos que podem entrar num combo: os simples, menos os que já estão nele. */
export function produtosParaOCombo(
  produtos: readonly Produto[],
  noCombo: readonly string[],
): Produto[] {
  return produtos
    .filter((p) => p.type === 'SIMPLE' && !noCombo.includes(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/** Quanto os itens custariam comprados separados, pelos preços de agora. */
export function precoAvulso(
  itens: readonly { productId: string; quantity: number }[],
  produtos: readonly Produto[],
): number {
  return itens.reduce(
    (soma, item) =>
      soma + (produtos.find((p) => p.id === item.productId)?.priceInCents ?? 0) * item.quantity,
    0,
  )
}
