import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { chaveDoChecklist } from './checklist'
import {
  booleano,
  comCamposValidos,
  minutosOpcionais,
  minutosValidos,
  reais,
  reaisSemSimbolo,
} from './form-fields'
import { comSessao } from './session'

export type ModoDeTaxa = 'FIXED' | 'BY_REGION'

/** A entrega e as regiões, como `GET /api/v1/admin/delivery` devolve. */
export interface Entrega {
  configuracao: {
    deliveryEnabled: boolean
    pickupEnabled: boolean
    feeMode: ModoDeTaxa
    fixedFeeInCents: number
    estimatedMinMinutes: number | null
    estimatedMaxMinutes: number | null
  }
  regioes: { id: string; name: string; feeInCents: number; isActive: boolean; sortOrder: number }[]
}

/** O que a API aceita numa lista de regiões. */
export const MAXIMO_DE_REGIOES = 200

// --- Formulário ----------------------------------------------------------------

/**
 * Uma linha que a pessoa acrescentou e não preencheu — sem nome e sem taxa — não
 * é uma região: não é cobrada, não conta como ativa e não é enviada. Quem
 * clica em "Adicionar região" e desiste não fica impedido de salvar.
 */
const emBranco = (regiao: { name: string; feeInCents: number }) =>
  regiao.name === '' && regiao.feeInCents === 0

const regiaoSchema = z
  .object({
    name: z.string().trim().max(80, 'Use no máximo 80 caracteres.'),
    feeInCents: reais,
    isActive: z.boolean(),
  })
  .refine((regiao) => regiao.name !== '' || regiao.feeInCents === 0, {
    message: 'Informe o nome da região.',
    path: ['name'],
    // Vale também com a taxa mal digitada: são dois erros, cada um no seu campo.
    when: comCamposValidos(['name'], (nome) => typeof nome === 'string'),
  })

/**
 * O formulário da entrega. Recebe o que a pessoa digitou — taxas em reais — e
 * entrega o corpo de `PUT /api/v1/admin/delivery`: a configuração e as regiões
 * juntas, que a API grava numa transação só.
 *
 * As regras entre campos são as da API: ao menos entrega ou retirada, uma
 * região ativa quando a taxa é por região, nomes de região sem repetição.
 */
export const formularioSchema = z
  .object({
    deliveryEnabled: z.boolean(),
    pickupEnabled: z.boolean(),
    feeMode: z.enum(['FIXED', 'BY_REGION']),
    fixedFeeInCents: reais,
    estimatedMinMinutes: minutosOpcionais,
    estimatedMaxMinutes: minutosOpcionais,
    regioes: z
      .array(regiaoSchema)
      .max(MAXIMO_DE_REGIOES, `Use no máximo ${String(MAXIMO_DE_REGIOES)} regiões.`)
      .superRefine((regioes, ctx) => {
        const vistos = new Set<string>()
        regioes.forEach((regiao, indice) => {
          const nome = regiao.name.toLowerCase()
          if (nome !== '' && vistos.has(nome)) {
            ctx.addIssue({
              code: 'custom',
              message: 'Já existe uma região com este nome.',
              path: [indice, 'name'],
            })
          }
          vistos.add(nome)
        })
      }),
  })
  .refine((v) => v.deliveryEnabled || v.pickupEnabled, {
    message: 'Ligue a entrega ou a retirada: sem nenhuma das duas, o cardápio não recebe pedidos.',
    path: ['pickupEnabled'],
    when: comCamposValidos(['deliveryEnabled', 'pickupEnabled'], booleano),
  })
  .refine(
    (v) =>
      !v.deliveryEnabled ||
      v.feeMode !== 'BY_REGION' ||
      v.regioes.some((r) => r.isActive && r.name !== ''),
    {
      message: 'Com a taxa por região, cadastre ao menos uma região ativa.',
      path: ['regioes'],
      // As regiões podem estar com um campo inválido: a regra só olha se há alguma ativa.
      when: comCamposValidos(['regioes'], Array.isArray),
    },
  )
  .refine(
    (v) =>
      v.estimatedMinMinutes === null ||
      v.estimatedMaxMinutes === null ||
      v.estimatedMinMinutes <= v.estimatedMaxMinutes,
    {
      message: 'O tempo máximo não pode ser menor que o mínimo.',
      path: ['estimatedMaxMinutes'],
      when: comCamposValidos(['estimatedMinMinutes', 'estimatedMaxMinutes'], minutosValidos),
    },
  )
  .transform(({ regioes, ...configuracao }) => ({
    configuracao,
    // A ordem da lista é a ordem em que o cliente vê as regiões.
    regioes: regioes
      .filter((regiao) => !emBranco(regiao))
      .map((regiao, indice) => ({ ...regiao, sortOrder: indice })),
  }))

/** O que os campos guardam enquanto a pessoa digita. */
export type ValoresDoFormulario = z.input<typeof formularioSchema>
/** O corpo de `PUT /api/v1/admin/delivery`. */
export type DadosDoFormulario = z.output<typeof formularioSchema>

/** O caminho de um campo de uma região, como o formulário o conhece. */
export const campoDaRegiao = <C extends 'name' | 'feeInCents' | 'isActive'>(
  indice: number,
  campo: C,
) => `regioes.${String(indice)}.${campo}` as `regioes.${number}.${C}`

export const REGIAO_NOVA: ValoresDoFormulario['regioes'][number] = {
  name: '',
  feeInCents: '',
  isActive: true,
}

/** A entrega da API como valores dos campos do formulário. */
export function paraFormulario({ configuracao, regioes }: Entrega): ValoresDoFormulario {
  return {
    deliveryEnabled: configuracao.deliveryEnabled,
    pickupEnabled: configuracao.pickupEnabled,
    feeMode: configuracao.feeMode,
    fixedFeeInCents: reaisSemSimbolo(configuracao.fixedFeeInCents),
    estimatedMinMinutes: configuracao.estimatedMinMinutes?.toString() ?? '',
    estimatedMaxMinutes: configuracao.estimatedMaxMinutes?.toString() ?? '',
    regioes: regioes.map((regiao) => ({
      name: regiao.name,
      feeInCents: reaisSemSimbolo(regiao.feeInCents),
      isActive: regiao.isActive,
    })),
  }
}

// --- API -----------------------------------------------------------------------

export const chaveDaEntrega = (slug: string) => ['painel', 'entrega', slug] as const

export function useEntrega(slug: string) {
  return useQuery({
    queryKey: chaveDaEntrega(slug),
    queryFn: () => comSessao<Entrega>('/api/v1/admin/delivery'),
  })
}

export function useSalvarEntrega(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dados: DadosDoFormulario) =>
      comSessao<Entrega>('/api/v1/admin/delivery', { method: 'PUT', body: dados }),
    onSuccess: (salva) => {
      queryClient.setQueryData(chaveDaEntrega(slug), salva)
      // O Início mostra o que ainda falta configurar.
      void queryClient.invalidateQueries({ queryKey: chaveDoChecklist(slug) })
    },
  })
}
