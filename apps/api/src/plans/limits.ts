/**
 * Os limites do plano, sem banco nem framework.
 *
 * **Pedidos por mês** (decisão do Junio): o painel avisa a partir de 80% do
 * limite; atingido o limite, ainda há uma **tolerância de 10%**, e só passada
 * ela o estabelecimento para de receber pedidos. Pedido cancelado conta —
 * cancelar não devolve a vaga, senão bastaria cancelar para nunca chegar ao
 * limite. O mês é o do calendário, no fuso do estabelecimento.
 *
 * **Usuários**: limite exato, sem tolerância — é o dono que cria usuário, e
 * ele pode desativar um para abrir vaga. Só usuário ativo conta.
 *
 * **Produtos e categorias**: limite exato, sem tolerância. Todo produto conta —
 * combo, indisponível, sem foto —, porque o que o limite contém é o espaço que
 * um cadastro gratuito pode ocupar. Para abrir vaga, exclui-se um.
 *
 * `null` é ilimitado. Recurso desligado no plano (`isEnabled = false`) vale
 * como limite zero.
 */

export const RECURSO_PEDIDOS_POR_MES = 'maxOrdersPerMonth'
export const RECURSO_USUARIOS = 'maxUsers'
export const RECURSO_PRODUTOS = 'maxProducts'
export const RECURSO_CATEGORIAS = 'maxCategories'

export const TOLERANCIA_DE_PEDIDOS = 0.1
export const AVISO_A_PARTIR_DE = 0.8

export type SituacaoDosPedidos = 'LIVRE' | 'PERTO_DO_LIMITE' | 'NA_TOLERANCIA' | 'BLOQUEADO'

export interface UsoDePedidos {
  usados: number
  /** `null`: ilimitado. */
  limite: number | null
  /** Limite mais a tolerância: a partir daqui, bloqueia. */
  teto: number | null
  situacao: SituacaoDosPedidos
}

export function situacaoDosPedidos(usados: number, limite: number | null): UsoDePedidos {
  if (limite === null) return { usados, limite, teto: null, situacao: 'LIVRE' }

  const teto = limite + Math.ceil(limite * TOLERANCIA_DE_PEDIDOS)
  const situacao: SituacaoDosPedidos =
    usados >= teto
      ? 'BLOQUEADO'
      : usados >= limite
        ? 'NA_TOLERANCIA'
        : usados >= Math.ceil(limite * AVISO_A_PARTIR_DE)
          ? 'PERTO_DO_LIMITE'
          : 'LIVRE'
  return { usados, limite, teto, situacao }
}

/** Se cabe mais um num limite exato, sem tolerância. */
export function cabeMaisUm(usados: number, limite: number | null): boolean {
  return limite === null || usados < limite
}

export const cabeMaisUmUsuario = cabeMaisUm
