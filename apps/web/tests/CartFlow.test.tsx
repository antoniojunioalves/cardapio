import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCarrinhoStore } from '../src/features/cart/store'
import type { CardapioPublico } from '../src/features/menu/types'
import { cardapioDoZe, produtoDoFixture } from './helpers/cardapio'
import { abrirCardapio } from './helpers/pagina'

beforeEach(() => {
  localStorage.clear()
  useCarrinhoStore.setState({ carrinhos: {} })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const janela = () => screen.getByRole('dialog')

function abrirProduto(nome: string) {
  fireEvent.click(screen.getByRole('button', { name: nome }))
  return janela()
}

/** Monta um X-Salada ao ponto, com bacon e cheddar, 2 unidades. */
function montarXSalada() {
  const dialogo = abrirProduto('X-Salada')
  fireEvent.click(within(dialogo).getByRole('radio', { name: /Ao ponto/ }))
  fireEvent.click(within(dialogo).getByRole('checkbox', { name: /Bacon/ }))
  fireEvent.click(within(dialogo).getByRole('checkbox', { name: /Cheddar/ }))
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Aumentar quantidade' }))
  return dialogo
}

describe('escolher o produto', () => {
  it('tocar no produto abre a janela dele', async () => {
    await abrirCardapio()

    const dialogo = abrirProduto('X-Salada')
    expect(within(dialogo).getByRole('heading', { name: 'X-Salada' })).toBeInTheDocument()
    expect(within(dialogo).getByText('Pão, hambúrguer, alface e tomate')).toBeVisible()
  })

  it('grupo obrigatório sem escolha impede adicionar e diz o que falta', async () => {
    await abrirCardapio()
    const dialogo = abrirProduto('X-Salada')

    expect(within(dialogo).getByRole('button', { name: /^Adicionar/ })).toBeDisabled()
    expect(within(dialogo).getByText('Falta escolher: Ponto da carne')).toBeVisible()
    expect(within(dialogo).getByText('Obrigatório')).toBeVisible()

    fireEvent.click(within(dialogo).getByRole('radio', { name: /Bem passada/ }))

    expect(within(dialogo).getByRole('button', { name: /^Adicionar/ })).toBeEnabled()
    expect(within(dialogo).getByText('Pronto')).toBeVisible()
  })

  it('o máximo do grupo desabilita as opções restantes, e esgotada nunca habilita', async () => {
    await abrirCardapio()
    const dialogo = abrirProduto('X-Salada')

    const ovo = within(dialogo).getByRole('checkbox', { name: /Ovo/ })
    expect(ovo).toBeDisabled()

    fireEvent.click(within(dialogo).getByRole('checkbox', { name: /Bacon/ }))
    expect(within(dialogo).getByRole('checkbox', { name: /Cheddar/ })).toBeEnabled()
    fireEvent.click(within(dialogo).getByRole('checkbox', { name: /Cheddar/ }))

    // Com dois de dois, dá para desmarcar, mas não marcar outro.
    expect(within(dialogo).getByRole('checkbox', { name: /Bacon/ })).toBeEnabled()
    expect(ovo).toBeDisabled()
  })

  it('o botão mostra o preço com opções e quantidade', async () => {
    await abrirCardapio()
    const dialogo = montarXSalada()

    // (25,90 + 5,00 + 4,00) × 2
    expect(within(dialogo).getByRole('button', { name: /^Adicionar/ })).toHaveTextContent(
      'R$ 69,80',
    )
  })

  it('produto esgotado abre, mas não deixa adicionar', async () => {
    await abrirCardapio()
    const dialogo = abrirProduto('X-Bacon')

    expect(within(dialogo).getByRole('button', { name: 'Esgotado' })).toBeDisabled()
  })

  it('Esc fecha a janela sem adicionar nada', async () => {
    await abrirCardapio()
    abrirProduto('Açaí na tigela')

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Ver carrinho/ })).not.toBeInTheDocument()
  })

  it('o link com ?produto= abre o produto direto; id desconhecido é ignorado', async () => {
    const cardapio = cardapioDoZe()
    const acai = produtoDoFixture(cardapio, 'Açaí na tigela')

    const { pagina } = await abrirCardapio(cardapio, `?produto=${acai.id}`)
    expect(within(janela()).getByRole('heading', { name: 'Açaí na tigela' })).toBeVisible()

    fireEvent.click(within(janela()).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    pagina.unmount()

    await abrirCardapio(cardapioDoZe(), '?produto=nao-existe')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('carrinho', () => {
  it('adicionar fecha a janela e mostra o indicador', async () => {
    await abrirCardapio()
    const dialogo = montarXSalada()

    fireEvent.click(within(dialogo).getByRole('button', { name: /^Adicionar/ }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Ver carrinho/ })).toHaveAccessibleName(
      /2 itens, R\$\s69,80/,
    )
  })

  it('o carrinho lista opções e observação, e o "−" na última unidade remove', async () => {
    await abrirCardapio()
    const dialogo = abrirProduto('X-Salada')
    fireEvent.click(within(dialogo).getByRole('radio', { name: /Ao ponto/ }))
    fireEvent.click(within(dialogo).getByRole('checkbox', { name: /Bacon/ }))
    fireEvent.change(within(dialogo).getByLabelText('Alguma observação?'), {
      target: { value: 'sem cebola' },
    })
    fireEvent.click(within(dialogo).getByRole('button', { name: /^Adicionar/ }))

    fireEvent.click(screen.getByRole('button', { name: /^Ver carrinho/ }))
    const carrinho = janela()
    const linha = within(carrinho).getByRole('listitem', { name: 'X-Salada' })

    expect(within(linha).getByText('Ao ponto, Bacon')).toBeVisible()
    expect(within(linha).getByText('Obs.: sem cebola')).toBeVisible()
    expect(within(linha).getByText('R$ 30,90')).toBeVisible()
    expect(within(carrinho).getByText('A taxa de entrega é calculada no checkout.')).toBeVisible()

    fireEvent.click(within(linha).getByRole('button', { name: 'Remover X-Salada' }))
    expect(within(carrinho).getByText('Seu carrinho está vazio.')).toBeVisible()
  })

  it('avisa quanto falta para o pedido mínimo', async () => {
    await abrirCardapio()
    fireEvent.click(
      within(abrirProduto('Açaí na tigela')).getByRole('button', { name: /^Adicionar/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: /^Ver carrinho/ }))

    // Mínimo de R$ 20,00 e um açaí de R$ 18,00.
    expect(
      within(janela()).getByText(/Faltam R\$\s2,00 para o pedido mínimo de R\$\s20,00/),
    ).toBeVisible()
  })

  it('continua lá ao sair e voltar para a página', async () => {
    const { pagina } = await abrirCardapio()
    fireEvent.click(
      within(abrirProduto('Açaí na tigela')).getByRole('button', { name: /^Adicionar/ }),
    )
    pagina.unmount()

    await abrirCardapio()
    expect(screen.getByRole('button', { name: /^Ver carrinho/ })).toHaveAccessibleName(/1 item,/)
  })

  it('o carrinho de um estabelecimento não aparece no outro', async () => {
    const { pagina } = await abrirCardapio()
    fireEvent.click(
      within(abrirProduto('Açaí na tigela')).getByRole('button', { name: /^Adicionar/ }),
    )
    pagina.unmount()

    const pizzaria: CardapioPublico = cardapioDoZe()
    pizzaria.establishment = {
      ...pizzaria.establishment,
      slug: 'pizzaria-da-esquina',
      name: 'Pizzaria da Esquina',
    }
    await abrirCardapio(pizzaria)

    expect(screen.queryByRole('button', { name: /^Ver carrinho/ })).not.toBeInTheDocument()
  })

  it('produto que esgotou depois de ir para o carrinho aparece marcado, fora do subtotal', async () => {
    const cardapio = cardapioDoZe()
    const { pagina } = await abrirCardapio(cardapio)
    fireEvent.click(
      within(abrirProduto('Açaí na tigela')).getByRole('button', { name: /^Adicionar/ }),
    )
    pagina.unmount()

    // O mesmo cardápio, agora com o açaí esgotado — como a próxima recarga da API traria.
    const depois: CardapioPublico = structuredClone(cardapio)
    const acai = produtoDoFixture(depois, 'Açaí na tigela')
    acai.isAvailable = false
    await abrirCardapio(depois, '?carrinho=1')

    const linha = within(janela()).getByRole('listitem', { name: 'Açaí na tigela' })
    expect(within(linha).getByText('Este produto esgotou.')).toBeVisible()
    expect(within(janela()).getByText('Subtotal').nextSibling).toHaveTextContent('R$ 0,00')
  })

  it('"Continuar" leva ao checkout', async () => {
    await abrirCardapio()
    const dialogo = montarXSalada()
    fireEvent.click(within(dialogo).getByRole('button', { name: /^Adicionar/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Ver carrinho/ }))

    fireEvent.click(within(janela()).getByRole('button', { name: 'Continuar' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Finalizar pedido' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('abaixo do mínimo, "Continuar" fica desabilitado', async () => {
    await abrirCardapio()
    fireEvent.click(
      within(abrirProduto('Açaí na tigela')).getByRole('button', { name: /^Adicionar/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: /^Ver carrinho/ }))

    expect(within(janela()).getByRole('button', { name: 'Continuar' })).toBeDisabled()
  })

  it('com o estabelecimento fechado, o carrinho avisa', async () => {
    const fechado: CardapioPublico = {
      ...cardapioDoZe(),
      status: { aberto: false, motivo: 'PAUSADO' },
    }
    await abrirCardapio(fechado, '?carrinho=1')

    expect(within(janela()).getByRole('note')).toHaveTextContent('está fechado agora')
  })
})
