import {
  enderecoSchema,
  nomeDoClienteSchema,
  telefoneSchema,
  textoOpcional,
  type Endereco,
} from '@repo/shared'
import { z } from 'zod'

import type { LinhaDoCarrinho, ResumoDoCarrinho } from '@/features/cart/cart'
import { descreverStatus } from '@/features/menu/presentation'
import type { CardapioPublico, EntregaPublica } from '@/features/menu/types'
import { formatarPreco, lerReais } from '@/utils/money'

/**
 * As regras do checkout, sem React.
 *
 * Tudo aqui guia o cliente e mostra uma prévia. O pedido vai ser validado e
 * precificado de novo, do zero, no servidor (Fase 11): taxa, total, região,
 * forma de pagamento e troco que o navegador calcula não valem nada lá.
 */

export type Modalidade = 'DELIVERY' | 'PICKUP'

export const OBSERVACAO_DO_PEDIDO_MAXIMA = 280

/** Entrega e retirada, na ordem em que aparecem, só as que o estabelecimento oferece. */
export function modalidadesDisponiveis(entrega: EntregaPublica): Modalidade[] {
  const modalidades: Modalidade[] = []
  if (entrega.deliveryEnabled) modalidades.push('DELIVERY')
  if (entrega.pickupEnabled) modalidades.push('PICKUP')
  return modalidades
}

/**
 * A taxa de entrega, em centavos.
 *
 * `null` quando ainda não dá para saber: entrega por região sem região
 * escolhida, ou modalidade ainda não escolhida.
 */
export function taxaDeEntrega(
  entrega: EntregaPublica,
  modalidade: string,
  regiaoId: string,
): number | null {
  if (modalidade === 'PICKUP') return 0
  if (modalidade !== 'DELIVERY') return null
  if (entrega.feeMode === 'FIXED') return entrega.fixedFeeInCents ?? 0
  return entrega.regions.find((r) => r.id === regiaoId)?.feeInCents ?? null
}

/**
 * O que impede enviar o pedido, em frases para o cliente. Lista vazia: pode
 * enviar.
 */
export function impedimentosDoPedido(
  cardapio: CardapioPublico,
  linhas: readonly LinhaDoCarrinho[],
  resumo: ResumoDoCarrinho,
): string[] {
  const impedimentos: string[] = []

  if (!cardapio.status.aberto) {
    const status = descreverStatus(cardapio.status)
    impedimentos.push(
      ['O estabelecimento está fechado agora.', status.detalhe].filter(Boolean).join(' '),
    )
  }
  if (modalidadesDisponiveis(cardapio.delivery).length === 0) {
    impedimentos.push('O estabelecimento não está recebendo pedidos por aqui no momento.')
  }
  if (resumo.temProblema) {
    impedimentos.push('Alguns itens do carrinho mudaram. Volte ao carrinho para revisar.')
  }
  if (linhas.length > 0 && resumo.faltaParaMinimoEmCentavos > 0) {
    impedimentos.push(
      `Faltam ${formatarPreco(resumo.faltaParaMinimoEmCentavos)} para o pedido mínimo de ` +
        `${formatarPreco(cardapio.establishment.minimumOrderInCents)}.`,
    )
  }

  return impedimentos
}

/** Os campos do formulário, como a pessoa os preenche: tudo texto. */
export interface ValoresDoCheckout {
  phone: string
  name: string
  /** `DELIVERY`, `PICKUP`, ou vazio enquanto a pessoa não escolheu. */
  fulfillment: string
  /** Id de um endereço salvo, ou vazio para um endereço novo. */
  savedAddressId: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  reference: string
  deliveryRegionId: string
  paymentMethodId: string
  /** "Troco para quanto?", em reais, como digitado. */
  changeFor: string
  notes: string
}

/**
 * O pedido conferido, pronto para ser enviado.
 *
 * É o formato que a Fase 11 vai mandar para a API. O endereço salvo vai só
 * pelo id: o navegador nunca recebeu o endereço completo.
 */
export interface DadosDoCheckout {
  phone: string
  name: string
  fulfillment: Modalidade
  address: { savedAddressId: string } | { newAddress: Endereco } | null
  deliveryRegionId: string | null
  paymentMethodId: string
  changeForInCents: number | null
  notes: string | null
}

export interface ContextoDoCheckout {
  cardapio: CardapioPublico
  /** Ids dos endereços que a identificação devolveu. */
  enderecosSalvos: readonly string[]
  /** Subtotal mais a taxa, para conferir o troco. */
  totalEmCentavos: number
}

const CAMPOS_DO_ENDERECO = [
  'street',
  'number',
  'complement',
  'neighborhood',
  'city',
  'reference',
] as const

function enderecoDosValores(v: Record<(typeof CAMPOS_DO_ENDERECO)[number], string>) {
  return Object.fromEntries(CAMPOS_DO_ENDERECO.map((campo) => [campo, v[campo]]))
}

/**
 * O schema do formulário, montado para o cardápio atual.
 *
 * Os campos usam os schemas de `@repo/shared` — os mesmos que a API aplica. As
 * regras que dependem do estabelecimento (região, forma de pagamento aceita,
 * troco a partir do total) vêm junto.
 *
 * A base aceita tudo como texto, e toda regra roda num `superRefine` só: no
 * Zod 4 o `superRefine` não roda quando um campo da base já falhou, e a pessoa
 * veria o erro do telefone, corrigiria, e só então descobriria os outros.
 */
export function criarSchemaDoCheckout(contexto: ContextoDoCheckout) {
  const { cardapio, enderecosSalvos, totalEmCentavos } = contexto
  const { delivery } = cardapio
  const modalidades = modalidadesDisponiveis(delivery)
  const porRegiao = delivery.feeMode === 'BY_REGION'
  const observacaoSchema = textoOpcional(OBSERVACAO_DO_PEDIDO_MAXIMA)

  const campos = Object.fromEntries(
    Object.keys(VALORES_INICIAIS).map((campo) => [campo, z.string()]),
  ) as Record<keyof ValoresDoCheckout, z.ZodString>

  return z
    .object(campos)
    .superRefine((v, ctx) => {
      const erro = (campo: keyof ValoresDoCheckout, mensagem: string) => {
        ctx.addIssue({ code: 'custom', path: [campo], message: mensagem })
      }
      const conferir = (campo: keyof ValoresDoCheckout, schema: z.ZodType, valor: unknown) => {
        const resultado = schema.safeParse(valor)
        const primeira = resultado.error?.issues[0]
        if (primeira) erro(campo, primeira.message)
      }

      conferir('phone', telefoneSchema, v.phone)
      conferir('name', nomeDoClienteSchema, v.name)
      conferir('notes', observacaoSchema, v.notes)

      if (!modalidades.includes(v.fulfillment as Modalidade)) {
        erro('fulfillment', 'Escolha entrega ou retirada.')
      }

      if (v.fulfillment === 'DELIVERY') {
        if (v.savedAddressId) {
          if (!enderecosSalvos.includes(v.savedAddressId)) {
            erro('savedAddressId', 'Escolha um dos seus endereços, ou informe outro.')
          }
        } else {
          for (const issue of enderecoSchema.safeParse(enderecoDosValores(v)).error?.issues ?? []) {
            ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
          }
        }

        if (porRegiao && !delivery.regions.some((r) => r.id === v.deliveryRegionId)) {
          erro('deliveryRegionId', 'Escolha a região de entrega.')
        }
      }

      const forma = cardapio.paymentMethods.find((f) => f.id === v.paymentMethodId)
      if (!forma) {
        erro('paymentMethodId', 'Escolha a forma de pagamento.')
      } else if (forma.kind === 'CASH' && v.changeFor.trim() !== '') {
        const troco = lerReais(v.changeFor)
        if (troco === null) erro('changeFor', 'Informe um valor, como 50,00.')
        else if (troco < totalEmCentavos) {
          erro(
            'changeFor',
            `O troco precisa ser para um valor a partir do total, ${formatarPreco(totalEmCentavos)}.`,
          )
        }
      }
    })
    .transform((v): DadosDoCheckout => {
      // Só chega aqui o que passou pelo `superRefine`: os `parse` não lançam.
      const fulfillment = v.fulfillment as Modalidade
      const entrega = fulfillment === 'DELIVERY'
      const forma = cardapio.paymentMethods.find((f) => f.id === v.paymentMethodId)

      return {
        phone: telefoneSchema.parse(v.phone),
        name: nomeDoClienteSchema.parse(v.name),
        fulfillment,
        address: !entrega
          ? null
          : v.savedAddressId
            ? { savedAddressId: v.savedAddressId }
            : { newAddress: enderecoSchema.parse(enderecoDosValores(v)) },
        deliveryRegionId: entrega && porRegiao ? v.deliveryRegionId : null,
        paymentMethodId: v.paymentMethodId,
        changeForInCents:
          forma?.kind === 'CASH' && v.changeFor.trim() !== '' ? lerReais(v.changeFor) : null,
        notes: observacaoSchema.parse(v.notes),
      }
    })
}

export const VALORES_INICIAIS: ValoresDoCheckout = {
  phone: '',
  name: '',
  fulfillment: '',
  savedAddressId: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  reference: '',
  deliveryRegionId: '',
  paymentMethodId: '',
  changeFor: '',
  notes: '',
}
