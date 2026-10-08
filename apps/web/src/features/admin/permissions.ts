/**
 * O que o perfil da pessoa alcança numa tela, sem React.
 *
 * A API confere tudo de novo, pelo que cada pedido muda — isto só evita
 * oferecer um campo ou um botão que ela recusaria.
 */

/**
 * As três permissões de quem mexe num produto ou nas opções de um grupo de
 * opcionais: o preço, o que esgotou e o resto são separados.
 */
export interface PodeNoProduto {
  /** Nome, descrição, foto, categoria, ordem, opcionais e itens do combo. */
  resto: boolean
  /** O preço do produto e o acréscimo das opções. */
  preco: boolean
  /** O "disponível" do produto e das opções. */
  disponibilidade: boolean
}

export const TUDO_NO_PRODUTO: PodeNoProduto = { resto: true, preco: true, disponibilidade: true }
export const NADA_NO_PRODUTO: PodeNoProduto = { resto: false, preco: false, disponibilidade: false }

export function podeNoProduto(permissoes: readonly string[]): PodeNoProduto {
  return {
    resto: permissoes.includes('products:update'),
    preco: permissoes.includes('products:price'),
    disponibilidade: permissoes.includes('products:availability'),
  }
}

export const podeAlgoNoProduto = (pode: PodeNoProduto) =>
  pode.resto || pode.preco || pode.disponibilidade

export const SO_VE_O_CARDAPIO = 'Você pode ver o cardápio, mas o seu perfil não permite alterá-lo.'

/**
 * O recado para quem alcança só uma parte, para os campos desligados não
 * parecerem defeito. Quem alcança tudo, ou nada, não tem recado aqui — para
 * quem só vê, o aviso é o de sempre (`SO_VE_O_CARDAPIO`).
 */
export function limiteNoProduto(pode: PodeNoProduto): string | null {
  const partes = [
    ...(pode.preco ? [] : ['alterar preços']),
    ...(pode.disponibilidade ? [] : ['marcar o que esgotou']),
  ]
  if (!podeAlgoNoProduto(pode) || (pode.resto && partes.length === 0)) return null
  if (pode.resto) return `O seu perfil não permite ${partes.join(' nem ')}.`

  const permitido = [
    ...(pode.preco ? ['alterar preços'] : []),
    ...(pode.disponibilidade ? ['marcar o que esgotou'] : []),
  ]
  return `O seu perfil permite só ${permitido.join(' e ')}.`
}
