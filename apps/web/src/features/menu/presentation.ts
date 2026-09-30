import { formatarPreco } from '@/utils/money'
import { normalizarParaBusca } from '@/utils/text'

import type {
  CardapioPublico,
  CategoriaPublica,
  EntregaPublica,
  ProdutoPublico,
  StatusDoEstabelecimento,
} from './types'

/**
 * Regras de apresentação do cardápio, sem React.
 *
 * Tudo aqui transforma a resposta da API em texto para a tela. Nenhuma regra
 * de negócio é decidida no navegador: se está aberto, se o produto está
 * disponível e quanto custa vêm prontos do servidor, e o pedido é validado de
 * novo lá.
 */

/** O id da seção de uma categoria, alvo da navegação por categorias. */
export const idDaSecao = (categoriaId: string) => `categoria-${categoriaId}`

export const DIAS_DA_SEMANA = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
] as const

/** `'18:00:00'` → `'18:00'`. */
export function formatarHora(hora: string): string {
  return hora.slice(0, 5)
}

export interface StatusDescrito {
  aberto: boolean
  titulo: string
  detalhe: string | null
}

export function descreverStatus(status: StatusDoEstabelecimento): StatusDescrito {
  if (status.aberto) {
    return {
      aberto: true,
      titulo: 'Aberto agora',
      detalhe: `Fecha às ${formatarHora(status.fechaAs)}`,
    }
  }

  // O estabelecimento passou do limite de pedidos do plano. O texto não diz
  // isso: a situação comercial dele não é assunto de quem abre o cardápio.
  if (status.motivo === 'NAO_RECEBENDO') {
    return {
      aberto: false,
      titulo: 'Fechado no momento',
      detalhe: 'O estabelecimento não está recebendo pedidos pela internet agora.',
    }
  }

  if (status.motivo === 'PAUSADO') {
    return {
      aberto: false,
      titulo: 'Fechado no momento',
      detalhe: 'O estabelecimento pausou os pedidos. Tente novamente em instantes.',
    }
  }

  const proxima = status.proximaAbertura
  if (!proxima) return { aberto: false, titulo: 'Fechado', detalhe: null }

  const hora = formatarHora(proxima.opensAt)
  const quando =
    proxima.emDias === 0
      ? `hoje às ${hora}`
      : proxima.emDias === 1
        ? `amanhã às ${hora}`
        : `${DIAS_DA_SEMANA[proxima.dayOfWeek] ?? ''} às ${hora}`

  return { aberto: false, titulo: 'Fechado', detalhe: `Abre ${quando}` }
}

/**
 * As condições de entrega em frases curtas, na ordem em que o cliente se
 * pergunta: entrega? quanto? em quanto tempo? tem mínimo? posso buscar?
 */
export function resumoDaEntrega(entrega: EntregaPublica, pedidoMinimoEmCentavos: number): string[] {
  const frases: string[] = []

  if (entrega.deliveryEnabled) {
    if (entrega.feeMode === 'FIXED') {
      const taxa = entrega.fixedFeeInCents ?? 0
      frases.push(taxa === 0 ? 'Entrega grátis' : `Entrega ${formatarPreco(taxa)}`)
    } else if (entrega.regions.length > 0) {
      const menor = Math.min(...entrega.regions.map((r) => r.feeInCents))
      frases.push(
        menor === 0
          ? 'Entrega grátis em algumas regiões'
          : `Entrega a partir de ${formatarPreco(menor)}`,
      )
    } else {
      frases.push('Entrega indisponível no momento')
    }

    const { estimatedMinMinutes: min, estimatedMaxMinutes: max } = entrega
    if (min !== null && max !== null) frases.push(`${String(min)}–${String(max)} min`)
    else if (max !== null) frases.push(`até ${String(max)} min`)
  }

  if (pedidoMinimoEmCentavos > 0)
    frases.push(`Pedido mínimo ${formatarPreco(pedidoMinimoEmCentavos)}`)

  if (entrega.pickupEnabled) {
    frases.push(entrega.deliveryEnabled ? 'Retirada no local' : 'Somente retirada no local')
  }

  return frases
}

/**
 * O preço como aparece no cartão.
 *
 * "A partir de" quando um grupo obrigatório tem opção que custa mais — o
 * tamanho grande, a pizza de 12 fatias. Sem isso o cartão mostraria o preço do
 * menor tamanho como se fosse o de todos.
 */
export function precoDoCartao(produto: ProdutoPublico): string {
  const variaComEscolha = produto.optionGroups.some(
    (g) => g.isRequired && g.options.some((o) => o.priceDeltaInCents > 0),
  )
  const preco = formatarPreco(produto.priceInCents)
  return variaComEscolha ? `a partir de ${preco}` : preco
}

/** Quanto o combo economiza em relação aos itens avulsos, ou `null` se não economiza. */
export function economiaDoCombo(produto: ProdutoPublico): number | null {
  if (!produto.combo) return null
  const economia = produto.combo.precoAvulsoEmCentavos - produto.priceInCents
  return economia > 0 ? economia : null
}

/** `1x X-Salada + 2x Refrigerante`, omitindo o `1x`. */
export function descreverItensDoCombo(produto: ProdutoPublico): string | null {
  if (!produto.combo || produto.combo.items.length === 0) return null
  return produto.combo.items
    .map((i) => (i.quantity > 1 ? `${String(i.quantity)}x ${i.name}` : i.name))
    .join(' + ')
}

/**
 * Filtra o cardápio pelo termo digitado, em nome e descrição do produto.
 * Categorias sem nenhum produto correspondente somem da lista.
 */
export function filtrarCardapio(
  categorias: readonly CategoriaPublica[],
  termo: string,
): CategoriaPublica[] {
  const busca = normalizarParaBusca(termo)
  if (busca === '') return [...categorias]

  const corresponde = (p: ProdutoPublico) =>
    normalizarParaBusca(`${p.name} ${p.description ?? ''}`).includes(busca)

  return categorias
    .map((c) => ({ ...c, products: c.products.filter(corresponde) }))
    .filter((c) => c.products.length > 0)
}

/** Os horários agrupados por dia da semana, a partir de segunda. */
export function horariosPorDia(
  horarios: CardapioPublico['hours'],
): { dia: string; intervalos: string[] }[] {
  const ordem = [1, 2, 3, 4, 5, 6, 0]
  return ordem.map((dia) => ({
    dia: DIAS_DA_SEMANA[dia] ?? '',
    intervalos: horarios
      .filter((h) => h.dayOfWeek === dia)
      .map((h) => `${formatarHora(h.opensAt)} às ${formatarHora(h.closesAt)}`),
  }))
}

/** `Rua das Flores, 123 — Centro, São Paulo/SP`. */
export function formatarEndereco(
  endereco: CardapioPublico['establishment']['address'],
): string | null {
  if (!endereco) return null
  const rua = [endereco.street, endereco.number].filter(Boolean).join(', ')
  const cidade = [endereco.city, endereco.state].filter(Boolean).join('/')
  const resto = [endereco.neighborhood, cidade].filter(Boolean).join(', ')
  return resto ? `${rua} — ${resto}` : rua
}
