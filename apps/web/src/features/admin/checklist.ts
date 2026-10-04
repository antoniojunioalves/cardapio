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
  /** Onde se resolve: a tela do painel, depois de `/{slug}/admin/`, e o que o link diz. Sem isto, a tela ainda não existe. */
  onde?: { caminho: string; rotulo: string }
}

/**
 * O que cada passo diz na lista do Início. Cada tela de gestão que nasce
 * acrescenta aqui o seu `onde`, e o passo ganha um link.
 */
export const PASSOS: Record<Passo, TextoDoPasso> = {
  emailConfirmed: {
    titulo: 'Confirmar o e-mail',
    comoFazer: 'Clique no link que enviamos no cadastro. É ele que põe o cardápio no ar.',
  },
  whatsapp: {
    titulo: 'Informar o WhatsApp do estabelecimento',
    comoFazer: 'É para ele que o cliente envia o pedido.',
    onde: { caminho: 'configuracoes', rotulo: 'Abrir as configurações' },
  },
  businessHours: {
    titulo: 'Cadastrar o horário de funcionamento',
    comoFazer: 'Sem horário, o cardápio aparece sempre fechado.',
    onde: { caminho: 'configuracoes/horarios', rotulo: 'Cadastrar os horários' },
  },
  fulfillment: {
    titulo: 'Definir entrega ou retirada',
    comoFazer: 'O cliente precisa de ao menos uma forma de receber o pedido.',
    onde: { caminho: 'configuracoes/entrega', rotulo: 'Configurar a entrega' },
  },
  paymentMethods: {
    titulo: 'Escolher as formas de pagamento',
    comoFazer: 'O cliente escolhe como vai pagar ao receber.',
    onde: { caminho: 'configuracoes/pagamento', rotulo: 'Escolher as formas de pagamento' },
  },
  products: {
    titulo: 'Cadastrar ao menos um produto',
    comoFazer: 'É o que o cliente vê e pede no cardápio.',
    onde: { caminho: 'cardapio', rotulo: 'Abrir o cardápio' },
  },
}
