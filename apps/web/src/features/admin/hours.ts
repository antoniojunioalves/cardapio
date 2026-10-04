import {
  MAXIMO_DE_INTERVALOS,
  MENSAGEM_DO_INTERVALO,
  minutosDoDia,
  problemasDosHorarios,
  HORA_DO_DIA,
} from '@repo/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { chaveDoChecklist } from './checklist'
import { comSessao } from './session'

/** Um intervalo de funcionamento, como `GET /api/v1/admin/business-hours` devolve. */
export interface Horario {
  id: string
  /** 0 = domingo, 6 = sábado. */
  dayOfWeek: number
  /** `HH:MM:SS`, como o banco guarda. */
  opensAt: string
  closesAt: string
}

/** Os dias na ordem em que a tela os mostra: a semana começa na segunda. */
export const DIAS: readonly { dia: number; nome: string }[] = [
  { dia: 1, nome: 'Segunda-feira' },
  { dia: 2, nome: 'Terça-feira' },
  { dia: 3, nome: 'Quarta-feira' },
  { dia: 4, nome: 'Quinta-feira' },
  { dia: 5, nome: 'Sexta-feira' },
  { dia: 6, nome: 'Sábado' },
  { dia: 0, nome: 'Domingo' },
]

// --- Formulário ----------------------------------------------------------------

/**
 * A grade da semana, como uma lista só de intervalos: é assim que a API a
 * recebe, e a tela só a agrupa por dia para mostrar. As regras são as de
 * `@repo/shared`, as mesmas que a API aplica ao gravar.
 */
export const formularioSchema = z
  .object({
    intervalos: z
      .array(
        z.object({
          dayOfWeek: z.number().int().min(0).max(6),
          opensAt: z.string(),
          closesAt: z.string(),
        }),
      )
      .max(MAXIMO_DE_INTERVALOS, `Use no máximo ${String(MAXIMO_DE_INTERVALOS)} horários.`),
  })
  .superRefine((valores, ctx) => {
    problemasDosHorarios(valores.intervalos).forEach((problema, indice) => {
      if (!problema) return
      ctx.addIssue({
        code: 'custom',
        message: MENSAGEM_DO_INTERVALO[problema],
        path: ['intervalos', indice, 'opensAt'],
      })
    })
  })

/** O que os campos guardam; também é o corpo de `PUT /api/v1/admin/business-hours`. */
export type ValoresDoFormulario = z.infer<typeof formularioSchema>
export type IntervaloDoFormulario = ValoresDoFormulario['intervalos'][number]

/**
 * O caminho de um campo da lista, como o formulário o conhece. O índice entra
 * no texto por `String`, e o tipo diz que ali vai um número.
 */
export const campoDoIntervalo = <C extends 'opensAt' | 'closesAt'>(indice: number, campo: C) =>
  `intervalos.${String(indice)}.${campo}` as `intervalos.${number}.${C}`

/** `18:00:00` → `18:00`: o campo de hora só mostra segundos se eles vierem. */
const semSegundos = (hora: string) => hora.slice(0, 5)

/** Os horários da API como valores do formulário. */
export function paraFormulario(horarios: readonly Horario[]): ValoresDoFormulario {
  return {
    intervalos: horarios.map(({ dayOfWeek, opensAt, closesAt }) => ({
      dayOfWeek,
      opensAt: semSegundos(opensAt),
      closesAt: semSegundos(closesAt),
    })),
  }
}

/**
 * A grade com os intervalos de `origem` repetidos em todos os dias — o caso de
 * quem abre todo dia no mesmo horário e não quer digitar sete vezes.
 */
export function repetirNosOutrosDias(
  intervalos: readonly IntervaloDoFormulario[],
  origem: number,
): IntervaloDoFormulario[] {
  const doDia = intervalos.filter((intervalo) => intervalo.dayOfWeek === origem)
  return DIAS.flatMap(({ dia }) => doDia.map((intervalo) => ({ ...intervalo, dayOfWeek: dia })))
}

/** Fechar antes de abrir é atravessar a meia-noite: `18:00` às `02:00`. */
export function fechaNoDiaSeguinte({ opensAt, closesAt }: IntervaloDoFormulario): boolean {
  return (
    HORA_DO_DIA.test(opensAt) &&
    HORA_DO_DIA.test(closesAt) &&
    minutosDoDia(closesAt) < minutosDoDia(opensAt)
  )
}

// --- API -----------------------------------------------------------------------

export const chaveDosHorarios = (slug: string) => ['painel', 'horarios', slug] as const

export function useHorarios(slug: string) {
  return useQuery({
    queryKey: chaveDosHorarios(slug),
    queryFn: () => comSessao<Horario[]>('/api/v1/admin/business-hours'),
  })
}

export function useSalvarHorarios(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dados: ValoresDoFormulario) =>
      comSessao<Horario[]>('/api/v1/admin/business-hours', { method: 'PUT', body: dados }),
    onSuccess: (salvos) => {
      queryClient.setQueryData(chaveDosHorarios(slug), salvos)
      // O Início mostra o que ainda falta configurar.
      void queryClient.invalidateQueries({ queryKey: chaveDoChecklist(slug) })
    },
  })
}
