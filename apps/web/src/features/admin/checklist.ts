import { useQuery } from '@tanstack/react-query'

import { comSessao } from './session'

/** Os passos, como `GET /api/v1/admin/setup-checklist` os nomeia. */
export type Passo =
  'emailConfirmed' | 'whatsapp' | 'businessHours' | 'fulfillment' | 'paymentMethods' | 'products'

export interface Checklist {
  ready: boolean
  steps: { key: Passo; done: boolean }[]
}

export const chaveDoChecklist = (slug: string) => ['painel', 'checklist', slug] as const

export function useChecklist(slug: string, ativo: boolean) {
  return useQuery({
    queryKey: chaveDoChecklist(slug),
    queryFn: () => comSessao<Checklist>('/api/v1/admin/setup-checklist'),
    enabled: ativo,
  })
}

interface TextoDoPasso {
  titulo: string
  /** O que fazer, para quem ainda não fez. */
  comoFazer: string
  /** A tela do painel onde se resolve, depois de `/{slug}/admin/`. Sem ela, a tela ainda não existe. */
  caminho?: string
}

/**
 * O que cada passo diz na lista do Início. Cada tela de gestão que nasce
 * acrescenta aqui o seu `caminho`, e o passo vira um link.
 */
export const PASSOS: Record<Passo, TextoDoPasso> = {
  emailConfirmed: {
    titulo: 'Confirmar o e-mail',
    comoFazer: 'Clique no link que enviamos no cadastro. É ele que põe o cardápio no ar.',
  },
  whatsapp: {
    titulo: 'Informar o WhatsApp do estabelecimento',
    comoFazer: 'É para ele que o cliente envia o pedido.',
    caminho: 'configuracoes',
  },
  businessHours: {
    titulo: 'Cadastrar o horário de funcionamento',
    comoFazer: 'Sem horário, o cardápio aparece sempre fechado.',
  },
  fulfillment: {
    titulo: 'Definir entrega ou retirada',
    comoFazer: 'O cliente precisa de ao menos uma forma de receber o pedido.',
  },
  paymentMethods: {
    titulo: 'Escolher as formas de pagamento',
    comoFazer: 'O cliente escolhe como vai pagar ao receber.',
  },
  products: {
    titulo: 'Cadastrar ao menos um produto',
    comoFazer: 'É o que o cliente vê e pede no cardápio.',
  },
}
