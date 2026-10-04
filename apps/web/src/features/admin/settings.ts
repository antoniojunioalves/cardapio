import {
  formatarCep,
  formatarTelefone,
  fusoValido,
  normalizarCep,
  normalizarTelefone,
  textoObrigatorio,
} from '@repo/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { chaveDoChecklist } from './checklist'
import {
  comCamposValidos,
  minutosOpcionais,
  minutosValidos,
  reais,
  reaisSemSimbolo,
  textoOpcional,
} from './form-fields'
import { comSessao, useSessaoStore } from './session'

/** As configurações do estabelecimento, como `GET /api/v1/admin/settings` devolve. */
export interface Configuracoes {
  name: string
  /** O endereço do cardápio. Só leitura. */
  slug: string
  timezone: string
  description: string | null
  logoUrl: string | null
  coverUrl: string | null
  whatsappPhone: string | null
  contactPhone: string | null
  contactEmail: string | null
  addressStreet: string | null
  addressNumber: string | null
  addressComplement: string | null
  addressNeighborhood: string | null
  addressCity: string | null
  addressState: string | null
  addressPostalCode: string | null
  prepTimeMinMinutes: number | null
  prepTimeMaxMinutes: number | null
  minimumOrderInCents: number
  isAcceptingOrders: boolean
}

export type ImagemDoEstabelecimento = 'logo' | 'cover'

// --- Formulário ----------------------------------------------------------------

/**
 * Os fusos do Brasil, com o nome que a pessoa reconhece. O fuso é o que decide
 * "aberto agora" e o que conta como "hoje"; quase todo mundo está no de
 * Brasília.
 */
export const FUSOS: readonly { valor: string; rotulo: string }[] = [
  { valor: 'America/Sao_Paulo', rotulo: 'Horário de Brasília' },
  { valor: 'America/Manaus', rotulo: 'Amazonas, Rondônia e Roraima (1 h a menos)' },
  { valor: 'America/Cuiaba', rotulo: 'Mato Grosso e Mato Grosso do Sul (1 h a menos)' },
  { valor: 'America/Rio_Branco', rotulo: 'Acre (2 h a menos)' },
  { valor: 'America/Noronha', rotulo: 'Fernando de Noronha (1 h a mais)' },
]

export const UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const

/** Telefone como a pessoa digitou; em branco é `null`, e o resto vira só dígitos, com o país. */
const telefoneOpcional = z.string().transform((valor, ctx) => {
  if (valor.trim() === '') return null
  const normalizado = normalizarTelefone(valor)
  if (!normalizado) {
    ctx.addIssue({ code: 'custom', message: 'Informe um telefone com DDD, como (11) 98765-4321.' })
    return z.NEVER
  }
  return normalizado
})

/**
 * O formulário das configurações. Recebe o que a pessoa digitou — telefone com
 * máscara, valor em reais — e entrega o corpo que a API espera: só dígitos,
 * centavos, `null` no que ficou em branco.
 */
export const formularioSchema = z
  .object({
    name: textoObrigatorio(120, 'Informe o nome do estabelecimento.'),
    description: textoOpcional(2000),
    timezone: z.string().refine(fusoValido, 'Escolha o fuso horário.'),

    whatsappPhone: telefoneOpcional,
    contactPhone: telefoneOpcional,
    contactEmail: z
      .string()
      .trim()
      .max(254, 'Use no máximo 254 caracteres.')
      .transform((valor) => (valor === '' ? null : valor))
      .refine(
        (valor) => valor === null || z.email().safeParse(valor).success,
        'Informe um e-mail válido, como contato@exemplo.com.',
      ),

    addressPostalCode: z.string().transform((valor, ctx) => {
      if (valor.trim() === '') return null
      const normalizado = normalizarCep(valor)
      if (!normalizado) {
        ctx.addIssue({ code: 'custom', message: 'Informe um CEP com 8 dígitos, como 01310-100.' })
        return z.NEVER
      }
      return normalizado
    }),
    addressStreet: textoOpcional(160),
    addressNumber: textoOpcional(20),
    addressComplement: textoOpcional(80),
    addressNeighborhood: textoOpcional(80),
    addressCity: textoOpcional(80),
    addressState: z
      .string()
      .transform((valor) => (valor === '' ? null : valor))
      .refine(
        (valor) => valor === null || (UFS as readonly string[]).includes(valor),
        'Escolha o estado.',
      ),

    prepTimeMinMinutes: minutosOpcionais,
    prepTimeMaxMinutes: minutosOpcionais,
    minimumOrderInCents: reais,
    isAcceptingOrders: z.boolean(),
  })
  .refine(
    (v) =>
      v.prepTimeMinMinutes === null ||
      v.prepTimeMaxMinutes === null ||
      v.prepTimeMinMinutes <= v.prepTimeMaxMinutes,
    {
      message: 'O tempo máximo não pode ser menor que o mínimo.',
      path: ['prepTimeMaxMinutes'],
      when: comCamposValidos(['prepTimeMinMinutes', 'prepTimeMaxMinutes'], minutosValidos),
    },
  )

/** O que os campos guardam enquanto a pessoa digita. */
export type ValoresDoFormulario = z.input<typeof formularioSchema>
/** O corpo de `PATCH /api/v1/admin/settings`. */
export type DadosDoFormulario = z.output<typeof formularioSchema>

const telefoneParaExibir = (telefone: string | null) =>
  // Só formata o que foi guardado normalizado; um valor antigo, livre, aparece como está.
  telefone && /^55\d{10,11}$/.test(telefone) ? formatarTelefone(telefone) : (telefone ?? '')

/** As configurações da API como valores dos campos do formulário. */
export function paraFormulario(configuracoes: Configuracoes): ValoresDoFormulario {
  const cep = configuracoes.addressPostalCode
  return {
    name: configuracoes.name,
    description: configuracoes.description ?? '',
    timezone: configuracoes.timezone,
    whatsappPhone: telefoneParaExibir(configuracoes.whatsappPhone),
    contactPhone: telefoneParaExibir(configuracoes.contactPhone),
    contactEmail: configuracoes.contactEmail ?? '',
    addressPostalCode: cep && /^\d{8}$/.test(cep) ? formatarCep(cep) : (cep ?? ''),
    addressStreet: configuracoes.addressStreet ?? '',
    addressNumber: configuracoes.addressNumber ?? '',
    addressComplement: configuracoes.addressComplement ?? '',
    addressNeighborhood: configuracoes.addressNeighborhood ?? '',
    addressCity: configuracoes.addressCity ?? '',
    addressState: configuracoes.addressState ?? '',
    prepTimeMinMinutes: configuracoes.prepTimeMinMinutes?.toString() ?? '',
    prepTimeMaxMinutes: configuracoes.prepTimeMaxMinutes?.toString() ?? '',
    minimumOrderInCents: reaisSemSimbolo(configuracoes.minimumOrderInCents),
    isAcceptingOrders: configuracoes.isAcceptingOrders,
  }
}

/**
 * Os fusos do seletor. O do estabelecimento entra mesmo fora da lista — quem
 * se cadastrou de outro país ficou com o fuso do aparelho, e salvar o
 * formulário não pode trocá-lo sem a pessoa pedir.
 */
export function fusosParaEscolher(atual: string): readonly { valor: string; rotulo: string }[] {
  return FUSOS.some((fuso) => fuso.valor === atual)
    ? FUSOS
    : [...FUSOS, { valor: atual, rotulo: atual }]
}

// --- API -----------------------------------------------------------------------

export const chaveDasConfiguracoes = (slug: string) => ['painel', 'configuracoes', slug] as const

export function useConfiguracoes(slug: string) {
  return useQuery({
    queryKey: chaveDasConfiguracoes(slug),
    queryFn: () => comSessao<Configuracoes>('/api/v1/admin/settings'),
  })
}

export function useSalvarConfiguracoes(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dados: DadosDoFormulario) =>
      comSessao<Configuracoes>('/api/v1/admin/settings', { method: 'PATCH', body: dados }),
    onSuccess: (salvas) => {
      queryClient.setQueryData(chaveDasConfiguracoes(slug), salvas)
      // O menu do painel mostra o nome; o Início, o que ainda falta configurar.
      useSessaoStore.setState({ estabelecimento: salvas.name })
      void queryClient.invalidateQueries({ queryKey: chaveDoChecklist(slug) })
    },
  })
}

/** As rotas de imagem devolvem as configurações sem o nome, o endereço e o fuso. */
type RespostaDeImagem = Pick<Configuracoes, 'logoUrl' | 'coverUrl'>

function guardarImagens(
  queryClient: ReturnType<typeof useQueryClient>,
  slug: string,
  resposta: RespostaDeImagem,
) {
  queryClient.setQueryData<Configuracoes>(
    chaveDasConfiguracoes(slug),
    (atuais) => atuais && { ...atuais, logoUrl: resposta.logoUrl, coverUrl: resposta.coverUrl },
  )
}

export function useEnviarImagem(slug: string, qual: ImagemDoEstabelecimento) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (arquivo: File) => {
      const formulario = new FormData()
      formulario.append('file', arquivo)
      return comSessao<RespostaDeImagem>(`/api/v1/admin/settings/${qual}`, {
        method: 'PUT',
        formulario,
      })
    },
    onSuccess: (resposta) => {
      guardarImagens(queryClient, slug, resposta)
    },
  })
}

export function useRemoverImagem(slug: string, qual: ImagemDoEstabelecimento) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      comSessao<RespostaDeImagem>(`/api/v1/admin/settings/${qual}`, { method: 'DELETE' }),
    onSuccess: (resposta) => {
      guardarImagens(queryClient, slug, resposta)
    },
  })
}
