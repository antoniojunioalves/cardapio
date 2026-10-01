import { inicioDoMes } from '../lib/timezone.js'
import type { TenantTransaction } from '../tenant/with-tenant.js'
import {
  RECURSO_PEDIDOS_POR_MES,
  RECURSO_USUARIOS,
  situacaoDosPedidos,
  type UsoDePedidos,
} from './limits.js'
import { carregarPlano, contarPedidosDesde, contarUsuariosAtivos } from './repository.js'

export interface UsoDoPlano {
  /** `null`: sem assinatura ativa — nada é limitado. */
  plano: { codigo: string; nome: string } | null
  pedidos: UsoDePedidos
  usuarios: { ativos: number; limite: number | null }
}

/**
 * O uso do plano agora. Sem assinatura ativa, nada é limitado: ainda não há
 * cobrança, e todo estabelecimento criado pelo seed tem assinatura.
 */
/** Quantos usuários ativos existem e quantos o plano permite. */
export async function usoDeUsuarios(tx: TenantTransaction): Promise<{
  plano: { codigo: string; nome: string } | null
  ativos: number
  limite: number | null
}> {
  const plano = await carregarPlano(tx)
  return {
    plano: plano && { codigo: plano.codigo, nome: plano.nome },
    ativos: await contarUsuariosAtivos(tx),
    limite: plano?.limites.get(RECURSO_USUARIOS) ?? null,
  }
}

export async function usoDoPlano(
  tx: TenantTransaction,
  timezone: string,
  agora: Date,
): Promise<UsoDoPlano> {
  const plano = await carregarPlano(tx)
  const pedidosNoMes = await contarPedidosDesde(tx, inicioDoMes(agora, timezone))
  const ativos = await contarUsuariosAtivos(tx)

  return {
    plano: plano && { codigo: plano.codigo, nome: plano.nome },
    pedidos: situacaoDosPedidos(pedidosNoMes, plano?.limites.get(RECURSO_PEDIDOS_POR_MES) ?? null),
    usuarios: { ativos, limite: plano?.limites.get(RECURSO_USUARIOS) ?? null },
  }
}
