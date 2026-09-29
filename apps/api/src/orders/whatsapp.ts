import { formatarCep, formatarTelefone } from '@repo/shared'

import { resumoMascarado } from '../customers/masking.js'

/**
 * A mensagem do pedido para o WhatsApp do estabelecimento, sem banco nem
 * framework.
 *
 * **A mensagem sai do celular de quem fez o pedido.** Tudo que está nela
 * passa pelo navegador e pelo WhatsApp dessa pessoa. Por isso:
 *
 * - **endereço salvo sai mascarado** (`Rua dos Ipês, 4•• — Jardim Paulista`):
 *   quem digitou o telefone de outra pessoa receberia o endereço dela. O
 *   estabelecimento vê o endereço completo no pedido. Completo aqui só depois
 *   do OTP (ROADMAP);
 * - **endereço digitado sai completo**: foi a própria pessoa que o informou;
 * - **o nome é o que a pessoa digitou**, não o nome completo que o pedido
 *   grava quando ela usa o primeiro nome preenchido pela identificação.
 *
 * O texto usa a marcação do WhatsApp: `*negrito*`.
 */

export interface ItemDaMensagem {
  quantidade: number
  nome: string
  totalEmCentavos: number
  opcoes: string[]
  observacao: string | null
  /** Componentes do combo, para a cozinha. */
  combo: { name: string; quantity: number }[] | null
}

export type EnderecoDaMensagem =
  | { tipo: 'SALVO'; street: string; number: string; neighborhood: string }
  | {
      tipo: 'NOVO'
      postalCode: string
      street: string
      number: string
      complement: string | null
      neighborhood: string
      city: string | null
      reference: string | null
    }

export interface DadosDaMensagem {
  estabelecimento: string
  numero: number
  cliente: { nome: string; telefone: string }
  itens: ItemDaMensagem[]
  subtotalEmCentavos: number
  taxaEmCentavos: number
  totalEmCentavos: number
  /** Nulo na retirada. */
  endereco: EnderecoDaMensagem | null
  regiao: string | null
  pagamento: { nome: string; trocoParaEmCentavos: number | null }
  observacao: string | null
}

const reais = (centavos: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(centavos / 100)
    // O Intl separa "R$" do valor com espaço não separável; no WhatsApp,
    // um espaço comum evita caracteres estranhos em aparelhos antigos.
    .replace(/\s/g, ' ')

function linhasDoEndereco(endereco: EnderecoDaMensagem): string[] {
  if (endereco.tipo === 'SALVO') {
    return [`${resumoMascarado(endereco)} (endereço cadastrado)`]
  }
  const rua = [endereco.street, endereco.number, endereco.complement].filter(Boolean).join(', ')
  const lugar = [endereco.neighborhood, endereco.city].filter(Boolean).join(', ')
  const linhas = [`${rua} — ${lugar}`]
  if (endereco.postalCode) linhas.push(`CEP ${formatarCep(endereco.postalCode)}`)
  if (endereco.reference) linhas.push(`Referência: ${endereco.reference}`)
  return linhas
}

export function montarMensagem(dados: DadosDaMensagem): string {
  const linhas: string[] = [`*Pedido #${String(dados.numero)}* — ${dados.estabelecimento}`, '']

  linhas.push('*Itens*')
  for (const item of dados.itens) {
    linhas.push(`${String(item.quantidade)}x ${item.nome} — ${reais(item.totalEmCentavos)}`)
    if (item.combo && item.combo.length > 0) {
      const componentes = item.combo.map((c) =>
        c.quantity > 1 ? `${String(c.quantity)}x ${c.name}` : c.name,
      )
      linhas.push(`   (${componentes.join(' + ')})`)
    }
    for (const opcao of item.opcoes) linhas.push(`   • ${opcao}`)
    if (item.observacao) linhas.push(`   Obs.: ${item.observacao}`)
  }
  linhas.push('')

  linhas.push(`Subtotal: ${reais(dados.subtotalEmCentavos)}`)
  if (dados.endereco) {
    linhas.push(`Entrega: ${dados.taxaEmCentavos === 0 ? 'grátis' : reais(dados.taxaEmCentavos)}`)
  }
  linhas.push(`*Total: ${reais(dados.totalEmCentavos)}*`, '')

  if (dados.endereco) {
    linhas.push('*Entrega*', ...linhasDoEndereco(dados.endereco))
    if (dados.regiao) linhas.push(`Região: ${dados.regiao}`)
  } else {
    linhas.push('*Retirada no local*')
  }
  linhas.push('')

  const troco =
    dados.pagamento.trocoParaEmCentavos === null
      ? ''
      : ` — troco para ${reais(dados.pagamento.trocoParaEmCentavos)}`
  linhas.push(`*Pagamento:* ${dados.pagamento.nome}${troco}`)
  linhas.push(`*Cliente:* ${dados.cliente.nome} — ${formatarTelefone(dados.cliente.telefone)}`)
  if (dados.observacao) linhas.push(`*Observações:* ${dados.observacao}`)

  return linhas.join('\n')
}

/**
 * O link que abre a conversa com o estabelecimento, com a mensagem pronta.
 * `null` quando o estabelecimento não cadastrou WhatsApp.
 */
export function linkDoWhatsapp(telefone: string | null, mensagem: string): string | null {
  const digitos = telefone?.replace(/\D/g, '') ?? ''
  if (digitos.length < 10) return null
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensagem)}`
}
