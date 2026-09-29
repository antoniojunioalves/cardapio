import type { NovoPedido, PedidoCriado, ProblemaDoPedido } from '@repo/shared'

import { recordAudit } from '../audit/record.js'
import {
  buscarClientePorTelefone,
  buscarEnderecoDoCliente,
  inserirCliente,
  marcarEnderecoUsado,
  salvarEnderecoUsado,
  type DadosDeEndereco,
} from '../customers/repository.js'
import type { Order, OrderStatus } from '../db/schema/index.js'
import { UNICIDADE, violacaoDoBanco } from '../lib/db-errors.js'
import { AppError, ConflictError, NotFoundError } from '../lib/errors.js'
import { montarCardapioPublico } from '../public-menu/service.js'
import type { StorageService } from '../storage/index.js'
import type { TenantContext } from '../tenant/context.js'
import { resolverEstabelecimentoPublico } from '../tenant/public.js'
import { withTenant, type TenantTransaction } from '../tenant/with-tenant.js'
import { calcularPedido } from './pricing.js'
import {
  buscarPedido,
  buscarPorIdempotencia,
  carregarItens,
  inserirItens,
  inserirPedido,
  listarPedidos as listarPedidosDoBanco,
  mudarStatus as mudarStatusNoBanco,
  proximoNumero,
  type FiltroDePedidos,
  type ItemComOpcoes,
} from './repository.js'
import { MENSAGEM_DA_RECUSA, problemaDaTransicao } from './status.js'

/** 422 — o pedido chegou bem formado, mas não pode ser aceito como está. */
export class PedidoRecusadoError extends AppError {
  constructor(problemas: ProblemaDoPedido[]) {
    super('O pedido não pôde ser aceito.', 422, 'ORDER_REJECTED', { problemas })
    this.name = 'PedidoRecusadoError'
  }
}

/** 409 — o total calculado agora não é o que o cliente viu. */
export class PrecoMudouError extends AppError {
  constructor(totalEmCentavos: number) {
    super(
      'Os valores mudaram desde que você abriu o cardápio. Confira o novo total.',
      409,
      'PRICE_CHANGED',
      { totalInCents: totalEmCentavos },
    )
    this.name = 'PrecoMudouError'
  }
}

/**
 * Cria um pedido a partir do checkout.
 *
 * Nada do que o navegador calculou é usado: o cardápio é montado de novo,
 * dentro da mesma transação, e o pedido é recalculado sobre ele
 * (`pricing.ts`). O navegador só manda ids, quantidades e escolhas — e o total
 * que viu, para o pedido ser recusado se o daqui for outro.
 *
 * Os `throw` desta função acontecem antes de qualquer escrita que precise
 * persistir: a transação volta, e nada fica pela metade.
 */
export async function criarPedido(
  slug: string,
  entrada: NovoPedido,
  storage: StorageService,
  agora: Date = new Date(),
): Promise<PedidoCriado> {
  const { tenant, context } = await resolverEstabelecimentoPublico(slug)

  try {
    return await withTenant(context, async (tx) => {
      // O mesmo envio de novo — duplo clique, rede que caiu depois do commit.
      const existente = await buscarPorIdempotencia(tx, entrada.idempotencyKey)
      if (existente) return apresentarCriado(tx, existente)

      const cardapio = await montarCardapioPublico(tx, context, tenant, storage, agora)
      const calculo = calcularPedido(cardapio, entrada)
      const problemas = calculo.ok ? [] : [...calculo.problemas]

      const cliente = await buscarClientePorTelefone(tx, entrada.customer.phone)
      const entrega = entrada.fulfillment === 'DELIVERY'

      let endereco: DadosDeEndereco | null = null
      let enderecoSalvoId: string | null = null
      if (entrega) {
        if (!entrada.address) {
          problemas.push({ tipo: 'ENDERECO_INVALIDO', mensagem: 'Informe o endereço de entrega.' })
        } else if ('savedAddressId' in entrada.address) {
          const salvo = cliente
            ? await buscarEnderecoDoCliente(tx, cliente.id, entrada.address.savedAddressId)
            : null
          if (salvo) {
            enderecoSalvoId = salvo.id
            endereco = {
              postalCode: salvo.postalCode ?? '',
              street: salvo.street,
              number: salvo.number,
              complement: salvo.complement,
              neighborhood: salvo.neighborhood,
              city: salvo.city,
              reference: salvo.reference,
            }
          } else {
            problemas.push({
              tipo: 'ENDERECO_INVALIDO',
              mensagem: 'Não encontramos o endereço escolhido. Informe o endereço de novo.',
            })
          }
        } else {
          endereco = entrada.address.newAddress
        }
      }

      if (!calculo.ok || problemas.length > 0) throw new PedidoRecusadoError(problemas)

      const calculado = calculo.pedido
      if (calculado.totalEmCentavos !== entrada.expectedTotalInCents) {
        throw new PrecoMudouError(calculado.totalEmCentavos)
      }

      // A partir daqui, só escrita. O cliente que já existe mantém o nome
      // guardado: o telefone não prova quem está digitando, e o nome de quem
      // pediu fica registrado no próprio pedido.
      const clienteId =
        cliente?.id ??
        (
          await inserirCliente(tx, {
            tenantId: context.tenantId,
            phone: entrada.customer.phone,
            name: entrada.customer.name,
          })
        ).id

      if (endereco) {
        if (enderecoSalvoId) await marcarEnderecoUsado(tx, enderecoSalvoId)
        else await salvarEnderecoUsado(tx, context.tenantId, clienteId, endereco)
      }

      const pedido = await inserirPedido(tx, {
        tenantId: context.tenantId,
        number: await proximoNumero(tx, context.tenantId),
        idempotencyKey: entrada.idempotencyKey,
        customerId: clienteId,
        customerName: entrada.customer.name,
        customerPhone: entrada.customer.phone,
        fulfillment: entrada.fulfillment,
        addressPostalCode: endereco?.postalCode || null,
        addressStreet: endereco?.street ?? null,
        addressNumber: endereco?.number ?? null,
        addressComplement: endereco?.complement ?? null,
        addressNeighborhood: endereco?.neighborhood ?? null,
        addressCity: endereco?.city ?? null,
        addressReference: endereco?.reference ?? null,
        deliveryRegionName: calculado.regiao?.name ?? null,
        paymentMethodCode: calculado.formaDePagamento.code,
        paymentMethodName: calculado.formaDePagamento.name,
        paymentMethodKind: calculado.formaDePagamento.kind as Order['paymentMethodKind'],
        changeForInCents: calculado.trocoParaEmCentavos,
        notes: entrada.notes,
        subtotalInCents: calculado.subtotalEmCentavos,
        deliveryFeeInCents: calculado.taxaEmCentavos,
        totalInCents: calculado.totalEmCentavos,
      })

      await inserirItens(
        tx,
        context.tenantId,
        pedido.id,
        calculado.itens.map((item) => ({
          productId: item.produto.id,
          productName: item.produto.name,
          productType: item.produto.type,
          unitPriceInCents: item.unitarioEmCentavos,
          quantity: item.quantidade,
          totalInCents: item.totalEmCentavos,
          notes: item.observacao,
          comboComponents: item.produto.combo?.items ?? null,
          opcoes: item.opcoes.map((o) => ({
            groupName: o.grupo,
            optionName: o.opcao,
            priceDeltaInCents: o.acrescimoEmCentavos,
          })),
        })),
      )

      return apresentarCriado(tx, pedido)
    })
  } catch (error) {
    // Dois envios com a mesma chave ao mesmo tempo: o segundo esbarra na
    // restrição única depois de o primeiro gravar. Devolve o que foi gravado.
    const violacao = violacaoDoBanco(error)
    if (violacao?.code === UNICIDADE && violacao.constraint === 'orders_idempotencia_unica') {
      return withTenant(context, async (tx) => {
        const gravado = await buscarPorIdempotencia(tx, entrada.idempotencyKey)
        if (!gravado) throw error
        return apresentarCriado(tx, gravado)
      })
    }
    throw error
  }
}

async function apresentarCriado(tx: TenantTransaction, pedido: Order): Promise<PedidoCriado> {
  const itens = (await carregarItens(tx, [pedido.id])).get(pedido.id) ?? []
  return {
    number: pedido.number,
    status: pedido.status,
    fulfillment: pedido.fulfillment,
    items: itens.map((i) => ({
      name: i.productName,
      quantity: i.quantity,
      options: i.opcoes.map((o) => o.optionName),
      notes: i.notes,
      totalInCents: i.totalInCents,
    })),
    subtotalInCents: pedido.subtotalInCents,
    deliveryFeeInCents: pedido.deliveryFeeInCents,
    totalInCents: pedido.totalInCents,
    paymentMethodName: pedido.paymentMethodName,
    changeForInCents: pedido.changeForInCents,
    createdAt: pedido.createdAt.toISOString(),
  }
}

// --- Painel do estabelecimento ------------------------------------------------

export interface PedidoDoPainel extends Order {
  itens: ItemComOpcoes[]
}

export async function listarPedidos(
  context: TenantContext,
  filtro: FiltroDePedidos,
): Promise<PedidoDoPainel[]> {
  return withTenant(context, async (tx) => {
    const pedidos = await listarPedidosDoBanco(tx, filtro)
    const itens = await carregarItens(
      tx,
      pedidos.map((p) => p.id),
    )
    return pedidos.map((p) => ({ ...p, itens: itens.get(p.id) ?? [] }))
  })
}

export async function obterPedido(context: TenantContext, id: string): Promise<PedidoDoPainel> {
  return withTenant(context, async (tx) => {
    const pedido = await buscarPedido(tx, id)
    // Pedido de outro estabelecimento é invisível pelo RLS e cai aqui: 404.
    if (!pedido) throw new NotFoundError('Pedido não encontrado.')
    return { ...pedido, itens: (await carregarItens(tx, [id])).get(id) ?? [] }
  })
}

/** Muda o status, conferindo o caminho permitido, e registra na auditoria. */
export async function mudarStatusDoPedido(
  context: TenantContext,
  actorUserId: string,
  id: string,
  para: OrderStatus,
  motivo: string | null,
): Promise<PedidoDoPainel> {
  return withTenant(context, async (tx) => {
    const pedido = await buscarPedido(tx, id)
    if (!pedido) throw new NotFoundError('Pedido não encontrado.')

    const recusa = problemaDaTransicao(pedido.status, para, pedido.fulfillment)
    if (recusa) throw new ConflictError(MENSAGEM_DA_RECUSA[recusa], 'INVALID_STATUS_TRANSITION')
    if (para === 'CANCELLED' && !motivo) {
      throw new AppError('Informe o motivo do cancelamento.', 400, 'CANCELLATION_REASON_REQUIRED')
    }

    const atualizado = await mudarStatusNoBanco(tx, id, pedido.status, para, motivo)
    if (!atualizado) {
      throw new ConflictError(
        'O pedido foi atualizado por outra pessoa. Recarregue e confira.',
        'ORDER_CHANGED',
      )
    }

    await recordAudit(tx, context, {
      action: 'order.status_changed',
      entityType: 'order',
      entityId: id,
      actorUserId,
      metadata: {
        number: pedido.number,
        de: pedido.status,
        para,
        ...(para === 'CANCELLED' && { motivo }),
      },
    })

    return { ...atualizado, itens: (await carregarItens(tx, [id])).get(id) ?? [] }
  })
}
