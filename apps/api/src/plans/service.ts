import { sql } from 'drizzle-orm'

import { ConflictError } from '../lib/errors.js'
import { inicioDoMes } from '../lib/timezone.js'
import type { TenantContext } from '../tenant/context.js'
import type { TenantTransaction } from '../tenant/with-tenant.js'
import {
  cabeMaisUm,
  RECURSO_CATEGORIAS,
  RECURSO_PEDIDOS_POR_MES,
  RECURSO_PRODUTOS,
  RECURSO_USUARIOS,
  situacaoDosPedidos,
  type UsoDePedidos,
} from './limits.js'
import {
  carregarPlano,
  contarCategorias,
  contarPedidosDesde,
  contarProdutos,
  contarUsuariosAtivos,
} from './repository.js'

export interface UsoDoPlano {
  /** `null`: sem assinatura ativa — nada é limitado. */
  plano: { codigo: string; nome: string } | null
  pedidos: UsoDePedidos
  usuarios: { ativos: number; limite: number | null }
  produtos: { usados: number; limite: number | null }
  categorias: { usados: number; limite: number | null }
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
    produtos: {
      usados: await contarProdutos(tx),
      limite: plano?.limites.get(RECURSO_PRODUTOS) ?? null,
    },
    categorias: {
      usados: await contarCategorias(tx),
      limite: plano?.limites.get(RECURSO_CATEGORIAS) ?? null,
    },
  }
}

/** Os dois limites do cardápio: o recurso do plano, como contar e como dizer que acabou. */
const ITENS_DO_CARDAPIO = {
  produto: {
    recurso: RECURSO_PRODUTOS,
    contar: contarProdutos,
    codigo: 'PLAN_PRODUCT_LIMIT',
    limiteDe: (n: number) => `${String(n)} ${n === 1 ? 'produto' : 'produtos'}`,
    comoAbrir: 'Exclua um produto',
  },
  categoria: {
    recurso: RECURSO_CATEGORIAS,
    contar: contarCategorias,
    codigo: 'PLAN_CATEGORY_LIMIT',
    limiteDe: (n: number) => `${String(n)} ${n === 1 ? 'categoria' : 'categorias'}`,
    comoAbrir: 'Exclua uma categoria',
  },
} as const

/**
 * Enfileira, até o fim da transação, quem confere o mesmo limite do mesmo
 * estabelecimento. **Chame antes de contar.**
 *
 * Sem a trava, dez criações simultâneas contam todas "19 de 20" e as dez
 * passam: cada transação não enxerga o que as outras ainda não confirmaram.
 * Com ela, a segunda espera a primeira terminar e só então conta. A chave leva
 * o recurso e o id do tenant — um estabelecimento não espera por outro, e criar
 * produto não espera por criar usuário.
 */
export async function travarLimiteDoPlano(
  tx: TenantTransaction,
  context: TenantContext,
  recurso: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${recurso}:${context.tenantId}`}, 0))`,
  )
}

/**
 * Confere, antes de criar um produto ou uma categoria, se o plano ainda tem
 * vaga. Roda na transação da criação, e trava antes de contar
 * (`travarLimiteDoPlano`). Sem assinatura ativa, nada é limitado.
 */
export async function exigirVagaNoCardapio(
  tx: TenantTransaction,
  context: TenantContext,
  item: keyof typeof ITENS_DO_CARDAPIO,
): Promise<void> {
  const { recurso, contar, codigo, limiteDe, comoAbrir } = ITENS_DO_CARDAPIO[item]

  const plano = await carregarPlano(tx)
  const limite = plano?.limites.get(recurso) ?? null
  if (limite === null) return

  await travarLimiteDoPlano(tx, context, recurso)

  if (!cabeMaisUm(await contar(tx), limite)) {
    throw new ConflictError(
      `O plano ${plano?.nome ?? ''} permite ${limiteDe(limite)}. ` +
        `${comoAbrir} para abrir vaga, ou mude de plano.`,
      codigo,
    )
  }
}
