import { textoObrigatorio } from '@repo/shared'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { chaveDoChecklist } from './checklist'
import { preco, reaisSemSimbolo, textoOpcional } from './form-fields'
import type { PodeNoProduto } from './permissions'
import { chaveDoPlano } from './plan'
import { comSessao } from './session'

/** Uma categoria, como `GET /api/v1/admin/categories` devolve. */
export interface Categoria {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  /** Desligada, a categoria inteira some do cardápio público. */
  isActive: boolean
  sortOrder: number
}

/** Um produto, como `GET /api/v1/admin/products` devolve. */
export interface Produto {
  id: string
  categoryId: string
  /** Um combo é um produto feito de outros; o tipo não muda depois de criado. */
  type: 'SIMPLE' | 'COMBO'
  name: string
  description: string | null
  priceInCents: number
  imageUrl: string | null
  /** Desligado, o produto aparece no cardápio como esgotado. */
  isAvailable: boolean
  sortOrder: number
}

// --- A lista ---------------------------------------------------------------------

/** Pela ordem que o cardápio usa: a posição, e o nome no empate. */
const naOrdem = <T extends { sortOrder: number; name: string }>(a: T, b: T) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR')

/**
 * As categorias na ordem do cardápio, cada uma com os seus produtos — como o
 * cliente vê, para o dono reconhecer o próprio cardápio.
 */
export function agruparPorCategoria(
  categorias: readonly Categoria[],
  produtos: readonly Produto[],
): { categoria: Categoria; produtos: Produto[] }[] {
  return [...categorias].sort(naOrdem).map((categoria) => ({
    categoria,
    produtos: produtos.filter((p) => p.categoryId === categoria.id).sort(naOrdem),
  }))
}

/** Os ids com o da posição `indice` trocado de lugar com o vizinho de cima ou de baixo. */
export function moverNaLista(
  ids: readonly string[],
  indice: number,
  direcao: 'subir' | 'descer',
): string[] {
  const alvo = direcao === 'subir' ? indice - 1 : indice + 1
  const atual = ids[indice]
  const vizinho = ids[alvo]
  if (atual === undefined || vizinho === undefined) return [...ids]
  const nova = [...ids]
  nova[indice] = vizinho
  nova[alvo] = atual
  return nova
}

/** "3 produtos · 1 esgotado": o que a categoria recolhida deixa ver. */
export function resumoDaCategoria(produtos: readonly Produto[]): string {
  const total = `${String(produtos.length)} ${produtos.length === 1 ? 'produto' : 'produtos'}`
  const esgotados = produtos.filter((p) => !p.isAvailable).length
  if (esgotados === 0) return total
  return `${total} · ${String(esgotados)} ${esgotados === 1 ? 'esgotado' : 'esgotados'}`
}

/** O que acontece ao excluir, dito antes de a pessoa confirmar. */
export const AO_EXCLUIR = {
  produto:
    'Ele sai do cardápio, e isso não pode ser desfeito. Os pedidos já feitos continuam com o ' +
    'nome e o preço da época.',
  categoria: 'Ela sai do cardápio, e isso não pode ser desfeito.',
} as const

/** Por que a categoria não pode ser excluída agora, ou `null` se pode. */
export function porQueNaoExcluirCategoria(produtos: number): string | null {
  if (produtos === 0) return null
  return (
    `A categoria tem ${String(produtos)} ${produtos === 1 ? 'produto' : 'produtos'}. ` +
    'Para excluí-la, mova os produtos para outra categoria ou exclua-os antes.'
  )
}

// --- Formulários -----------------------------------------------------------------

/** A categoria: o que a pessoa digita entra, e sai o corpo da API. */
export const formularioDeCategoriaSchema = z.object({
  name: textoObrigatorio(80, 'Informe o nome da categoria.'),
  description: textoOpcional(1000),
  isActive: z.boolean(),
})

export type ValoresDaCategoria = z.input<typeof formularioDeCategoriaSchema>
export type DadosDaCategoria = z.output<typeof formularioDeCategoriaSchema>

export const CATEGORIA_NOVA: ValoresDaCategoria = { name: '', description: '', isActive: true }

export function categoriaParaFormulario(categoria: Categoria): ValoresDaCategoria {
  return {
    name: categoria.name,
    description: categoria.description ?? '',
    isActive: categoria.isActive,
  }
}

/** O produto: o preço é digitado em reais e vai em centavos. */
export const formularioDeProdutoSchema = z.object({
  /** Escolhido na criação; depois, a API não aceita mais o campo (`alteracaoDoProduto`). */
  type: z.enum(['SIMPLE', 'COMBO']),
  categoryId: z.string().min(1, 'Escolha a categoria.'),
  name: textoObrigatorio(120, 'Informe o nome do produto.'),
  description: textoOpcional(2000),
  priceInCents: preco,
  isAvailable: z.boolean(),
})

export type ValoresDoProduto = z.input<typeof formularioDeProdutoSchema>
export type DadosDoProduto = z.output<typeof formularioDeProdutoSchema>

export function produtoNovo(categoryId: string): ValoresDoProduto {
  return {
    type: 'SIMPLE',
    categoryId,
    name: '',
    description: '',
    priceInCents: '',
    isAvailable: true,
  }
}

/**
 * O corpo do `PATCH` de um produto: tudo, menos o tipo. Um combo não vira
 * produto simples nem o contrário — a API recusa o campo depois de criado.
 */
export function alteracaoDoProduto(dados: DadosDoProduto): Omit<DadosDoProduto, 'type'> {
  const alteracao: Partial<DadosDoProduto> = { ...dados }
  delete alteracao.type
  return alteracao as Omit<DadosDoProduto, 'type'>
}

/**
 * Da alteração, só o que o perfil da pessoa alcança. Um campo desligado na tela
 * não vai no pedido: a API recusaria a alteração inteira se ele chegasse
 * diferente do que está gravado.
 */
export function alteracaoAoAlcance(
  alteracao: Omit<DadosDoProduto, 'type'>,
  pode: PodeNoProduto,
): Partial<Omit<DadosDoProduto, 'type'>> {
  const { priceInCents, isAvailable, ...resto } = alteracao
  return {
    ...(pode.resto && resto),
    ...(pode.preco && { priceInCents }),
    ...(pode.disponibilidade && { isAvailable }),
  }
}

export function produtoParaFormulario(produto: Produto): ValoresDoProduto {
  return {
    type: produto.type,
    categoryId: produto.categoryId,
    name: produto.name,
    description: produto.description ?? '',
    priceInCents: reaisSemSimbolo(produto.priceInCents),
    isAvailable: produto.isAvailable,
  }
}

// --- API -------------------------------------------------------------------------

export const chaveDoCatalogo = (slug: string) => ['painel', 'catalogo', slug] as const
export const chaveDasCategorias = (slug: string) =>
  [...chaveDoCatalogo(slug), 'categorias'] as const
export const chaveDosProdutos = (slug: string) => [...chaveDoCatalogo(slug), 'produtos'] as const
export const chaveDoProduto = (slug: string, id: string) =>
  [...chaveDoCatalogo(slug), 'produto', id] as const

export function useCategorias(slug: string) {
  return useQuery({
    queryKey: chaveDasCategorias(slug),
    queryFn: () => comSessao<Categoria[]>('/api/v1/admin/categories'),
  })
}

export function useProdutos(slug: string) {
  return useQuery({
    queryKey: chaveDosProdutos(slug),
    queryFn: () => comSessao<Produto[]>('/api/v1/admin/products'),
  })
}

export function useProduto(slug: string, id: string) {
  return useQuery({
    queryKey: chaveDoProduto(slug, id),
    queryFn: () => comSessao<Produto>(`/api/v1/admin/products/${id}`),
  })
}

/**
 * Depois de mudar o cardápio, o que mais muda junto: o uso do plano (criar e
 * excluir contam) e a lista do Início ("ao menos um produto à venda").
 */
function marcarDependentes(queryClient: QueryClient, slug: string) {
  void queryClient.invalidateQueries({ queryKey: chaveDoPlano(slug) })
  void queryClient.invalidateQueries({ queryKey: chaveDoChecklist(slug) })
}

/** Guarda a categoria que a API devolveu na lista, sem esperar a releitura. */
function guardarCategoria(queryClient: QueryClient, slug: string, categoria: Categoria) {
  queryClient.setQueryData<Categoria[]>(chaveDasCategorias(slug), (atuais) =>
    atuais?.some((c) => c.id === categoria.id)
      ? atuais.map((c) => (c.id === categoria.id ? categoria : c))
      : [...(atuais ?? []), categoria],
  )
}

/** Guarda o produto que a API devolveu na lista e no detalhe. */
function guardarProduto(queryClient: QueryClient, slug: string, produto: Produto) {
  queryClient.setQueryData(chaveDoProduto(slug, produto.id), produto)
  queryClient.setQueryData<Produto[]>(chaveDosProdutos(slug), (atuais) =>
    atuais?.some((p) => p.id === produto.id)
      ? atuais.map((p) => (p.id === produto.id ? produto : p))
      : [...(atuais ?? []), produto],
  )
}

/** Cria (sem `id`) ou altera uma categoria. */
export function useSalvarCategoria(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dados }: { id?: string | undefined; dados: DadosDaCategoria }) =>
      id
        ? comSessao<Categoria>(`/api/v1/admin/categories/${id}`, { method: 'PATCH', body: dados })
        : comSessao<Categoria>('/api/v1/admin/categories', { method: 'POST', body: dados }),
    onSuccess: (categoria) => {
      guardarCategoria(queryClient, slug, categoria)
      marcarDependentes(queryClient, slug)
    },
  })
}

export function useExcluirCategoria(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      comSessao<undefined>(`/api/v1/admin/categories/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Categoria[]>(chaveDasCategorias(slug), (atuais) =>
        atuais?.filter((c) => c.id !== id),
      )
      marcarDependentes(queryClient, slug)
    },
  })
}

/** A ordem nova das categorias: a lista completa, como a API exige. */
export function useReordenarCategorias(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) =>
      comSessao<Categoria[]>('/api/v1/admin/categories/order', { method: 'PUT', body: { ids } }),
    onSuccess: (categorias) => {
      queryClient.setQueryData(chaveDasCategorias(slug), categorias)
    },
  })
}

/** O arquivo de uma imagem, como a rota de imagem o recebe. */
function enviarImagem<T>(caminho: string, arquivo: File) {
  const formulario = new FormData()
  formulario.append('file', arquivo)
  return comSessao<T>(caminho, { method: 'PUT', formulario })
}

/**
 * Cria o produto e, se a pessoa já escolheu a foto, envia-a em seguida — a rota da foto é a do produto, que só existe depois de
 * criado. Se a foto for recusada, o produto continua criado: o cadastro segue,
 * e ela se envia de novo no passo do produto.
 */
export function useCriarProduto(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      dados,
      foto,
    }: {
      dados: DadosDoProduto
      foto?: File | null | undefined
    }) => {
      const criado = await comSessao<Produto>('/api/v1/admin/products', {
        method: 'POST',
        body: dados,
      })
      if (!foto) return { produto: criado, fotoRecusada: false }
      try {
        const comFoto = await enviarImagem<Produto>(
          `/api/v1/admin/products/${criado.id}/image`,
          foto,
        )
        return { produto: comFoto, fotoRecusada: false }
      } catch {
        return { produto: criado, fotoRecusada: true }
      }
    },
    onSuccess: ({ produto }) => {
      guardarProduto(queryClient, slug, produto)
      marcarDependentes(queryClient, slug)
    },
  })
}

/** Altera um produto: os campos do passo dele. */
export function useAlterarProduto(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: Partial<Omit<DadosDoProduto, 'type'>> }) =>
      comSessao<Produto>(`/api/v1/admin/products/${id}`, { method: 'PATCH', body: dados }),
    onSuccess: (produto) => {
      guardarProduto(queryClient, slug, produto)
      marcarDependentes(queryClient, slug)
    },
  })
}

/**
 * Liga e desliga a disponibilidade, da lista. A caixa muda na hora, sem esperar
 * a API — num celular com rede lenta, esperar faria o toque parecer perdido —,
 * e volta ao que era se a API recusar.
 */
export function useDisponibilidade(slug: string) {
  const queryClient = useQueryClient()
  const marcar = (id: string, isAvailable: boolean) => {
    queryClient.setQueryData<Produto[]>(chaveDosProdutos(slug), (atuais) =>
      atuais?.map((p) => (p.id === id ? { ...p, isAvailable } : p)),
    )
  }
  return useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      comSessao<Produto>(`/api/v1/admin/products/${id}`, {
        method: 'PATCH',
        body: { isAvailable },
      }),
    onMutate: async ({ id, isAvailable }) => {
      // Uma releitura em andamento não pode trazer de volta o valor antigo.
      await queryClient.cancelQueries({ queryKey: chaveDosProdutos(slug) })
      marcar(id, isAvailable)
    },
    onError: (_erro, { id, isAvailable }) => {
      // Só este produto volta: outro marcado ao mesmo tempo continua como está.
      marcar(id, !isAvailable)
    },
    onSuccess: (produto) => {
      guardarProduto(queryClient, slug, produto)
      marcarDependentes(queryClient, slug)
    },
  })
}

export function useExcluirProduto(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      comSessao<undefined>(`/api/v1/admin/products/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Produto[]>(chaveDosProdutos(slug), (atuais) =>
        atuais?.filter((p) => p.id !== id),
      )
      queryClient.removeQueries({ queryKey: chaveDoProduto(slug, id) })
      marcarDependentes(queryClient, slug)
    },
  })
}

/** A ordem nova dos produtos de uma categoria: a lista completa dela. */
export function useReordenarProdutos(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (corpo: { categoryId: string; ids: string[] }) =>
      comSessao<Produto[]>('/api/v1/admin/products/order', { method: 'PUT', body: corpo }),
    onSuccess: (daCategoria) => {
      for (const produto of daCategoria) guardarProduto(queryClient, slug, produto)
    },
  })
}

/** Enviar e remover a imagem de um item: a rota responde com o item, e ele é guardado. */
function useImagem<T>(caminho: string, aoGravar: (item: T) => void) {
  const envio = useMutation({
    mutationFn: (arquivo: File) => enviarImagem<T>(caminho, arquivo),
    onSuccess: aoGravar,
  })
  const remocao = useMutation({
    mutationFn: () => comSessao<T>(caminho, { method: 'DELETE' }),
    onSuccess: aoGravar,
  })
  return { envio, remocao }
}

export function useImagemDaCategoria(slug: string, id: string) {
  const queryClient = useQueryClient()
  return useImagem<Categoria>(`/api/v1/admin/categories/${id}/image`, (categoria) => {
    guardarCategoria(queryClient, slug, categoria)
  })
}

export function useImagemDoProduto(slug: string, id: string) {
  const queryClient = useQueryClient()
  return useImagem<Produto>(`/api/v1/admin/products/${id}/image`, (produto) => {
    guardarProduto(queryClient, slug, produto)
  })
}
