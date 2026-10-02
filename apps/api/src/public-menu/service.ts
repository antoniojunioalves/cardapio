import {
  ensureDeliverySettings,
  ensureSettings,
  listBusinessHours,
  listDeliveryRegions,
  listPaymentMethods,
} from '../settings/repository.js'
import { temComoReceber } from '../settings/delivery-fee.js'
import { statusDoEstabelecimento, type StatusDoEstabelecimento } from '../settings/opening-hours.js'
import { urlDaImagem, type StorageService } from '../storage/index.js'
import { usoDoPlano } from '../plans/service.js'
import { resolverEstabelecimentoPublico } from '../tenant/public.js'
import type { TenantContext } from '../tenant/context.js'
import type { TenantRecord } from '../tenant/repository.js'
import { withTenant, type TenantTransaction } from '../tenant/with-tenant.js'
import { podeSerPedido } from './availability.js'
import { carregarCardapio, type CardapioCarregado } from './repository.js'

/**
 * O cardápio público de um estabelecimento, resolvido pelo slug da URL.
 *
 * **Cada campo da resposta é escolhido aqui, um a um.** Nada é repassado com
 * spread de uma linha do banco: uma coluna nova em `tenant_settings` — um
 * token de integração, uma observação interna — não pode aparecer no cardápio
 * só porque alguém a criou. O schema de resposta da rota é a segunda barreira,
 * e o teste que procura campos internos na resposta é a terceira.
 */

/**
 * O status do cardápio: o do horário, ou `NAO_RECEBENDO` quando o
 * estabelecimento passou do limite de pedidos do plano (sem dizer por quê).
 */
export type StatusDoCardapio = StatusDoEstabelecimento | { aberto: false; motivo: 'NAO_RECEBENDO' }

export interface OpcaoPublica {
  id: string
  name: string
  priceDeltaInCents: number
  isAvailable: boolean
}

export interface GrupoPublico {
  id: string
  name: string
  description: string | null
  minSelections: number
  maxSelections: number
  isRequired: boolean
  options: OpcaoPublica[]
}

export interface ComboPublico {
  items: { name: string; quantity: number }[]
  /** Quanto custariam os itens separados — para o cardápio mostrar a economia. */
  precoAvulsoEmCentavos: number
}

export interface ProdutoPublico {
  id: string
  type: 'SIMPLE' | 'COMBO'
  name: string
  description: string | null
  priceInCents: number
  imageUrl: string | null
  /** Já considera componentes do combo e opções obrigatórias esgotadas. */
  isAvailable: boolean
  optionGroups: GrupoPublico[]
  combo: ComboPublico | null
}

export interface CategoriaPublica {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  products: ProdutoPublico[]
}

export interface EnderecoPublico {
  street: string
  number: string | null
  complement: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  postalCode: string | null
}

export interface CardapioPublico {
  establishment: {
    slug: string
    name: string
    description: string | null
    logoUrl: string | null
    coverUrl: string | null
    timezone: string
    whatsappPhone: string | null
    contactPhone: string | null
    address: EnderecoPublico | null
    prepTimeMinMinutes: number | null
    prepTimeMaxMinutes: number | null
    minimumOrderInCents: number
  }
  status: StatusDoCardapio
  hours: { dayOfWeek: number; opensAt: string; closesAt: string }[]
  delivery: {
    deliveryEnabled: boolean
    pickupEnabled: boolean
    feeMode: 'FIXED' | 'BY_REGION'
    /** Só no modo `FIXED`; no modo por região a taxa depende da região escolhida. */
    fixedFeeInCents: number | null
    /** Só as regiões ativas, e só no modo `BY_REGION`. */
    regions: { id: string; name: string; feeInCents: number }[]
    estimatedMinMinutes: number | null
    estimatedMaxMinutes: number | null
  }
  paymentMethods: { id: string; code: string; name: string; kind: string }[]
  categories: CategoriaPublica[]
}

export async function obterCardapioPublico(
  slug: string,
  storage: StorageService,
  agora: Date = new Date(),
): Promise<CardapioPublico> {
  const { tenant, context } = await resolverEstabelecimentoPublico(slug)
  return withTenant(context, (tx) => montarCardapioPublico(tx, context, tenant, storage, agora))
}

/**
 * Monta o cardápio público dentro de uma transação já aberta.
 *
 * Separado de `obterCardapioPublico` para o pedido (Fase 11) usar **a mesma
 * visão** que o cliente recebeu: as mesmas categorias ativas, a mesma
 * disponibilidade, as mesmas regiões e formas de pagamento. Se o pedido
 * montasse a sua própria, cedo ou tarde uma regra divergiria da outra, e o
 * cardápio ofereceria o que o pedido recusa — ou o contrário.
 */
export async function montarCardapioPublico(
  tx: TenantTransaction,
  context: TenantContext,
  tenant: Pick<TenantRecord, 'slug' | 'name' | 'timezone'>,
  storage: StorageService,
  agora: Date,
): Promise<CardapioPublico> {
  const configuracoes = await ensureSettings(tx, context)
  const intervalos = await listBusinessHours(tx)
  const entrega = await ensureDeliverySettings(tx, context)
  const regioes = await listDeliveryRegions(tx)
  const formas = await listPaymentMethods(tx)
  const cardapio = await carregarCardapio(tx)

  const porRegiao = entrega.feeMode === 'BY_REGION'

  return {
    establishment: {
      slug: tenant.slug,
      name: tenant.name,
      description: configuracoes.description,
      logoUrl: urlDaImagem(storage, configuracoes.logoKey),
      coverUrl: urlDaImagem(storage, configuracoes.coverKey),
      timezone: tenant.timezone,
      // Público por necessidade: é o número para onde o pedido será enviado.
      whatsappPhone: configuracoes.whatsappPhone,
      contactPhone: configuracoes.contactPhone,
      address: configuracoes.addressStreet
        ? {
            street: configuracoes.addressStreet,
            number: configuracoes.addressNumber,
            complement: configuracoes.addressComplement,
            neighborhood: configuracoes.addressNeighborhood,
            city: configuracoes.addressCity,
            state: configuracoes.addressState,
            postalCode: configuracoes.addressPostalCode,
          }
        : null,
      prepTimeMinMinutes: configuracoes.prepTimeMinMinutes,
      prepTimeMaxMinutes: configuracoes.prepTimeMaxMinutes,
      minimumOrderInCents: configuracoes.minimumOrderInCents,
    },
    // O cardápio para de receber pedidos em três casos, e a resposta é a mesma
    // nos três, sem dizer qual:
    // - passado o limite do plano com a tolerância — a situação comercial do
    //   estabelecimento não é da conta de quem abre o cardápio;
    // - sem entrega nem retirada funcionando (é como um estabelecimento nasce);
    // - sem nenhuma forma de pagamento.
    // Nos dois últimos, o checkout não teria o que oferecer.
    status:
      (await usoDoPlano(tx, tenant.timezone, agora)).pedidos.situacao === 'BLOQUEADO' ||
      !temComoReceber(entrega, regioes.filter((r) => r.isActive).length) ||
      !formas.some((f) => f.isEnabled)
        ? { aberto: false, motivo: 'NAO_RECEBENDO' }
        : statusDoEstabelecimento({
            intervalos,
            timezone: tenant.timezone,
            aceitandoPedidos: configuracoes.isAcceptingOrders,
            agora,
          }),
    hours: intervalos.map((i) => ({
      dayOfWeek: i.dayOfWeek,
      opensAt: i.opensAt,
      closesAt: i.closesAt,
    })),
    delivery: {
      deliveryEnabled: entrega.deliveryEnabled,
      pickupEnabled: entrega.pickupEnabled,
      feeMode: entrega.feeMode,
      fixedFeeInCents: porRegiao ? null : entrega.fixedFeeInCents,
      // Região inativa conta como inexistente, como no cálculo da taxa.
      regions: porRegiao
        ? regioes
            .filter((r) => r.isActive)
            .map((r) => ({ id: r.id, name: r.name, feeInCents: r.feeInCents }))
        : [],
      estimatedMinMinutes: entrega.estimatedMinMinutes,
      estimatedMaxMinutes: entrega.estimatedMaxMinutes,
    },
    paymentMethods: formas
      .filter((f) => f.isEnabled)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((f) => ({ id: f.id, code: f.code, name: f.name, kind: f.kind })),
    categories: montarCategorias(cardapio, storage),
  }
}

function montarCategorias(
  cardapio: CardapioCarregado,
  storage: StorageService,
): CategoriaPublica[] {
  const gruposPorProduto = agrupar(cardapio.grupos, (g) => g.productId)
  const componentesPorCombo = agrupar(cardapio.componentes, (c) => c.comboProductId)
  const produtosPorCategoria = agrupar(cardapio.produtos, (p) => p.categoryId)

  return (
    cardapio.categorias
      .map((categoria) => ({
        id: categoria.id,
        name: categoria.name,
        description: categoria.description,
        imageUrl: urlDaImagem(storage, categoria.imageKey),
        products: (produtosPorCategoria.get(categoria.id) ?? []).map((produto): ProdutoPublico => {
          const grupos = gruposPorProduto.get(produto.id) ?? []
          const componentes = componentesPorCombo.get(produto.id) ?? []

          return {
            id: produto.id,
            type: produto.type,
            name: produto.name,
            description: produto.description,
            priceInCents: produto.priceInCents,
            imageUrl: urlDaImagem(storage, produto.imageKey),
            isAvailable: podeSerPedido({
              type: produto.type,
              isAvailable: produto.isAvailable,
              groups: grupos,
              comboItems: componentes,
            }),
            optionGroups: grupos.map((g) => ({
              id: g.id,
              name: g.name,
              description: g.description,
              minSelections: g.minSelections,
              maxSelections: g.maxSelections,
              isRequired: g.minSelections >= 1,
              options: g.options.map((o) => ({
                id: o.id,
                name: o.name,
                priceDeltaInCents: o.priceDeltaInCents,
                isAvailable: o.isAvailable,
              })),
            })),
            combo:
              produto.type === 'COMBO'
                ? {
                    items: componentes.map((c) => ({ name: c.name, quantity: c.quantity })),
                    precoAvulsoEmCentavos: componentes.reduce(
                      (soma, c) => soma + c.priceInCents * c.quantity,
                      0,
                    ),
                  }
                : null,
          }
        }),
      }))
      // Categoria ativa mas sem produto é só um título solto no cardápio.
      .filter((categoria) => categoria.products.length > 0)
  )
}

function agrupar<T>(itens: readonly T[], chave: (item: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>()
  for (const item of itens) {
    const lista = mapa.get(chave(item)) ?? []
    lista.push(item)
    mapa.set(chave(item), lista)
  }
  return mapa
}
