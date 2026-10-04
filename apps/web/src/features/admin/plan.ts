import { useQuery } from '@tanstack/react-query'

import { comSessao } from './session'

/** O uso do plano, como `GET /api/v1/admin/plan` devolve. */
export interface UsoDoPlano {
  plan: { code: string; name: string } | null
  orders: {
    used: number
    limit: number | null
    ceiling: number | null
    state: 'LIVRE' | 'PERTO_DO_LIMITE' | 'NA_TOLERANCIA' | 'BLOQUEADO'
  }
  users: { active: number; limit: number | null }
  /** Todo produto conta: combo, esgotado, sem foto. */
  products: { used: number; limit: number | null }
  categories: { used: number; limit: number | null }
}

export const chaveDoPlano = (slug: string) => ['painel', 'plano', slug] as const

export function usePlano(slug: string, ativo: boolean) {
  return useQuery({
    queryKey: chaveDoPlano(slug),
    queryFn: () => comSessao<UsoDoPlano>('/api/v1/admin/plan'),
    enabled: ativo,
    refetchInterval: 5 * 60_000,
  })
}

export interface AvisoDoPlano {
  nivel: 'atencao' | 'alerta'
  texto: string
}

/**
 * O aviso do plano para o painel, ou `null` quando não há o que avisar.
 *
 * Aqui o plano é citado com todas as letras — é o lojista quem lê. No
 * cardápio público, o mesmo bloqueio aparece só como "não está recebendo
 * pedidos".
 */
export function avisoDoPlano(uso: UsoDoPlano | undefined): AvisoDoPlano | null {
  if (!uso?.plan || uso.orders.limit === null) return null
  const { used, limit, ceiling, state } = uso.orders
  const plano = uso.plan.name

  switch (state) {
    case 'PERTO_DO_LIMITE':
      return {
        nivel: 'atencao',
        texto: `Você recebeu ${String(used)} de ${String(limit)} pedidos deste mês no plano ${plano}.`,
      }
    case 'NA_TOLERANCIA':
      return {
        nivel: 'alerta',
        texto:
          `O limite de ${String(limit)} pedidos do plano ${plano} foi atingido. O cardápio ` +
          `continua recebendo até ${String(ceiling)} pedidos este mês; depois disso, para.`,
      }
    case 'BLOQUEADO':
      return {
        nivel: 'alerta',
        texto:
          `O cardápio parou de receber pedidos: o plano ${plano} chegou a ${String(ceiling)} ` +
          `pedidos este mês (limite de ${String(limit)} mais a tolerância). Ele volta a ` +
          'receber no dia 1º do mês que vem.',
      }
    default:
      return null
  }
}

/** Como o cardápio está diante do limite do plano. `null`: o plano não limita o cardápio. */
export interface CardapioNoPlano {
  /** "4 de 20 produtos e 2 de 10 categorias do plano Grátis." */
  texto: string
  produtosNoLimite: boolean
  categoriasNoLimite: boolean
}

export function cardapioNoPlano(uso: UsoDoPlano | undefined): CardapioNoPlano | null {
  if (!uso?.plan) return null
  const { products, categories } = uso
  if (products.limit === null && categories.limit === null) return null

  const parte = (usados: number, limite: number | null, um: string, varios: string) =>
    limite === null
      ? `${String(usados)} ${usados === 1 ? um : varios}`
      : `${String(usados)} de ${String(limite)} ${limite === 1 ? um : varios}`

  return {
    texto:
      `${parte(products.used, products.limit, 'produto', 'produtos')} e ` +
      `${parte(categories.used, categories.limit, 'categoria', 'categorias')} do plano ` +
      `${uso.plan.name}.`,
    produtosNoLimite: products.limit !== null && products.used >= products.limit,
    categoriasNoLimite: categories.limit !== null && categories.used >= categories.limit,
  }
}
