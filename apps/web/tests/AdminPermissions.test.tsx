import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  limiteNoProduto,
  NADA_NO_PRODUTO,
  podeNoProduto,
  TUDO_NO_PRODUTO,
} from '../src/features/admin/permissions'
import { useSessaoStore } from '../src/features/admin/session'
import { abrirNoCardapio, sessao } from './helpers/cardapio-admin'
import { pararConexaoAoVivo } from './helpers/pagina'

/**
 * O preço, o que esgotou e o resto são três permissões — no produto e nas
 * opções dos opcionais. A tela desliga o que o perfil da pessoa não alcança e
 * só envia o que ela pode mudar; a API confere de novo.
 */

const VER = ['products:read']
const SO_ESGOTADO = sessao([...VER, 'products:availability'])
const SO_PRECO = sessao([...VER, 'products:price'])
const SO_O_RESTO = sessao([...VER, 'products:update'])

const clicar = (nome: string | RegExp) => {
  fireEvent.click(screen.getByRole('button', { name: nome }))
}
const escrever = (campo: HTMLElement, valor: string) => {
  fireEvent.change(campo, { target: { value: valor } })
}
const campo = (nome: string | RegExp) => screen.getByLabelText(nome)
const opcao = (indice: number) =>
  within(screen.getByRole('group', { name: `Opção ${String(indice)}` }))

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useSessaoStore.setState({ slug: null, estabelecimento: null, usuario: null, accessToken: null })
  pararConexaoAoVivo()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('o que o perfil alcança no produto', () => {
  it('lê as três permissões', () => {
    expect(podeNoProduto(['products:read', 'products:price'])).toEqual({
      resto: false,
      preco: true,
      disponibilidade: false,
    })
    expect(podeNoProduto(['products:update', 'products:price', 'products:availability'])).toEqual(
      TUDO_NO_PRODUTO,
    )
  })

  it('quem alcança tudo, ou nada, não tem recado de limite', () => {
    expect(limiteNoProduto(TUDO_NO_PRODUTO)).toBeNull()
    expect(limiteNoProduto(NADA_NO_PRODUTO)).toBeNull()
  })

  it('sem o resto, diz o que o perfil permite', () => {
    const so = (pode: Partial<typeof NADA_NO_PRODUTO>) =>
      limiteNoProduto({ ...NADA_NO_PRODUTO, ...pode })

    expect(so({ disponibilidade: true })).toBe('O seu perfil permite só marcar o que esgotou.')
    expect(so({ preco: true })).toBe('O seu perfil permite só alterar preços.')
    expect(so({ preco: true, disponibilidade: true })).toBe(
      'O seu perfil permite só alterar preços e marcar o que esgotou.',
    )
  })

  it('com o resto, diz o que falta', () => {
    const sem = (pode: Partial<typeof TUDO_NO_PRODUTO>) =>
      limiteNoProduto({ ...TUDO_NO_PRODUTO, ...pode })

    expect(sem({ preco: false })).toBe('O seu perfil não permite alterar preços.')
    expect(sem({ disponibilidade: false })).toBe('O seu perfil não permite marcar o que esgotou.')
    expect(sem({ preco: false, disponibilidade: false })).toBe(
      'O seu perfil não permite alterar preços nem marcar o que esgotou.',
    )
  })
})

describe('o passo do produto', () => {
  const abrirProduto = async (comSessao: ReturnType<typeof sessao>) => {
    const enviados = abrirNoCardapio('/produtos/p-xburger', {}, comSessao)
    await screen.findByLabelText('Nome')
    return enviados
  }

  it('quem só marca o que esgotou: só o "Disponível" está ligado, e só ele é enviado', async () => {
    const enviados = await abrirProduto(SO_ESGOTADO)

    expect(screen.getByRole('note')).toHaveTextContent(
      'O seu perfil permite só marcar o que esgotou.',
    )
    expect(campo('Nome')).toBeDisabled()
    expect(campo('Preço (R$)')).toBeDisabled()
    expect(campo('Categoria')).toBeDisabled()
    expect(campo('Descrição')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /foto/i })).toBeNull()
    expect(campo('Disponível')).toBeEnabled()

    fireEvent.click(campo('Disponível'))
    clicar('Salvar e continuar')

    await waitFor(() => {
      expect(enviados).toEqual([
        { metodo: 'PATCH', caminho: '/products/p-xburger', corpo: { isAvailable: false } },
      ])
    })
  })

  it('quem só altera preços: só o preço está ligado, e só ele é enviado', async () => {
    const enviados = await abrirProduto(SO_PRECO)

    expect(screen.getByRole('note')).toHaveTextContent('O seu perfil permite só alterar preços.')
    expect(campo('Nome')).toBeDisabled()
    expect(campo('Disponível')).toBeDisabled()
    expect(campo('Preço (R$)')).toBeEnabled()

    escrever(campo('Preço (R$)'), '28,90')
    clicar('Salvar e continuar')

    await waitFor(() => {
      expect(enviados).toEqual([
        { metodo: 'PATCH', caminho: '/products/p-xburger', corpo: { priceInCents: 2890 } },
      ])
    })
  })

  it('quem altera o produto, sem preço nem esgotado: esses dois ficam desligados e fora do envio', async () => {
    const enviados = await abrirProduto(SO_O_RESTO)

    expect(screen.getByRole('note')).toHaveTextContent(
      'O seu perfil não permite alterar preços nem marcar o que esgotou.',
    )
    expect(campo('Preço (R$)')).toBeDisabled()
    expect(campo('Disponível')).toBeDisabled()
    expect(campo('Disponível')).toBeChecked()

    escrever(campo('Nome'), 'X-Burger duplo')
    clicar('Salvar e continuar')

    await waitFor(() => {
      expect(enviados).toHaveLength(1)
    })
    expect(enviados[0]).toEqual({
      metodo: 'PATCH',
      caminho: '/products/p-xburger',
      corpo: { categoryId: 'c-lanches', name: 'X-Burger duplo', description: null },
    })
  })

  it('quem cria produtos informa tudo no produto novo, o preço inclusive', async () => {
    abrirNoCardapio('/produtos/novo', {}, sessao([...VER, 'products:create']))
    await screen.findByLabelText('Nome')

    expect(campo('Preço (R$)')).toBeEnabled()
    expect(campo('Disponível')).toBeEnabled()
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('quem só marca o que esgotou não escolhe os opcionais do produto, mas abre um grupo', async () => {
    abrirNoCardapio('/produtos/p-xburger?passo=opcionais', {}, SO_ESGOTADO)
    await screen.findByText('Adicionais')

    expect(screen.queryByRole('button', { name: /Tirar .* deste produto/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Criar um grupo novo' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^(Subir|Descer)/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Salvar/ })).toBeNull()

    clicar('Editar o grupo Adicionais')
    expect(await screen.findByRole('dialog', { name: 'Editar grupo de opcionais' })).toBeVisible()
  })
})

describe('a lista do cardápio', () => {
  const linha = (nome: string) =>
    within(screen.getByRole('link', { name: nome }).closest('li') as HTMLElement)
  /** A lista nasce com as categorias recolhidas. */
  const abrirLanches = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /^Lanches,/ }))
  }

  it('quem só marca o que esgotou tem a caixa na lista e o lápis, sem mudar a ordem', async () => {
    const enviados = abrirNoCardapio('', {}, SO_ESGOTADO)
    await abrirLanches()

    expect(screen.queryByRole('note')).toBeNull()
    expect(linha('X-Burger').getByRole('link', { name: 'Editar X-Burger' })).toBeVisible()
    expect(linha('X-Burger').queryByRole('button', { name: /^(Subir|Descer|Excluir)/ })).toBeNull()

    fireEvent.click(screen.getByLabelText('Disponível: X-Burger'))
    await waitFor(() => {
      expect(enviados).toEqual([
        { metodo: 'PATCH', caminho: '/products/p-xburger', corpo: { isAvailable: false } },
      ])
    })
  })

  it('quem só altera preços não tem a caixa do esgotado, e chega ao produto pelo lápis', async () => {
    abrirNoCardapio('', {}, SO_PRECO)
    await abrirLanches()

    expect(screen.queryByLabelText('Disponível: X-Burger')).toBeNull()
    expect(linha('X-Burger').getByRole('link', { name: 'Editar X-Burger' })).toBeVisible()
  })

  it('quem altera o produto, sem o esgotado, muda a ordem e não tem a caixa', async () => {
    abrirNoCardapio('', {}, SO_O_RESTO)
    await abrirLanches()

    expect(screen.queryByLabelText('Disponível: X-Burger')).toBeNull()
    expect(linha('X-Burger').getByRole('button', { name: 'Descer X-Burger' })).toBeVisible()
  })
})

describe('a janela do grupo de opcionais', () => {
  const abrirGrupo = async (comSessao: ReturnType<typeof sessao>) => {
    const enviados = abrirNoCardapio('/opcionais', {}, comSessao)
    await screen.findByText('Adicionais')
    clicar('Editar o grupo Adicionais')
    await screen.findByRole('dialog', { name: 'Editar grupo de opcionais' })
    return enviados
  }
  /** O grupo "Adicionais" como está gravado, no corpo que a tela envia. */
  const gravado = {
    name: 'Adicionais',
    description: 'Capriche no seu lanche',
    minSelections: 0,
    maxSelections: 2,
    options: [
      { id: 'o-bacon', name: 'Bacon', priceDeltaInCents: 500, isAvailable: true },
      { id: 'o-cheddar', name: 'Cheddar', priceDeltaInCents: 400, isAvailable: true },
      { id: 'o-ovo', name: 'Ovo', priceDeltaInCents: 300, isAvailable: false },
    ],
  }
  const comAOpcao = (indice: number, mudanca: object) => ({
    ...gravado,
    options: gravado.options.map((o, i) => (i === indice ? { ...o, ...mudanca } : o)),
  })

  it('quem só marca o que esgotou: muda o "Disponível" de uma opção, e o resto vai como estava', async () => {
    const enviados = await abrirGrupo(SO_ESGOTADO)
    const janela = within(screen.getByRole('dialog'))

    expect(janela.getByText('O seu perfil permite só marcar o que esgotou.')).toBeVisible()
    expect(janela.getByLabelText('Nome do grupo')).toBeDisabled()
    expect(janela.getByLabelText('Mínimo')).toBeDisabled()
    expect(opcao(1).getByLabelText('Nome')).toBeDisabled()
    expect(opcao(1).getByLabelText('A mais (R$)')).toBeDisabled()
    expect(opcao(1).getByLabelText('Disponível')).toBeEnabled()
    expect(
      janela.queryByRole('button', { name: /Remover|Adicionar opção|^Subir|^Descer/ }),
    ).toBeNull()

    fireEvent.click(opcao(1).getByLabelText('Disponível'))
    fireEvent.click(janela.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => {
      expect(enviados).toEqual([
        {
          metodo: 'PUT',
          caminho: '/option-groups/g-adicionais',
          corpo: comAOpcao(0, { isAvailable: false }),
        },
      ])
    })
  })

  it('quem só altera preços: muda o acréscimo, e o esgotado de cada opção vai como estava', async () => {
    const enviados = await abrirGrupo(SO_PRECO)
    const janela = within(screen.getByRole('dialog'))

    expect(opcao(3).getByLabelText('Disponível')).toBeDisabled()
    expect(opcao(3).getByLabelText('Disponível')).not.toBeChecked()
    expect(opcao(1).getByLabelText('Nome')).toBeDisabled()

    escrever(opcao(1).getByLabelText('A mais (R$)'), '6,50')
    fireEvent.click(janela.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => {
      expect(enviados).toEqual([
        {
          metodo: 'PUT',
          caminho: '/option-groups/g-adicionais',
          corpo: comAOpcao(0, { priceDeltaInCents: 650 }),
        },
      ])
    })
  })

  it('quem altera os opcionais, sem preço nem esgotado: opção nova de graça, com o "Disponível" dela', async () => {
    const enviados = await abrirGrupo(SO_O_RESTO)
    const janela = within(screen.getByRole('dialog'))

    expect(
      janela.getByText('O seu perfil não permite alterar preços nem marcar o que esgotou.'),
    ).toBeVisible()
    expect(opcao(1).getByLabelText('A mais (R$)')).toBeDisabled()
    expect(opcao(1).getByLabelText('Disponível')).toBeDisabled()

    fireEvent.click(janela.getByRole('button', { name: 'Adicionar opção' }))
    escrever(opcao(4).getByLabelText('Nome'), 'Picles')
    // O acréscimo de uma opção nova também é preço; o "disponível" dela, não é marcar o que esgotou.
    expect(opcao(4).getByLabelText('A mais (R$)')).toBeDisabled()
    expect(opcao(4).getByLabelText('Disponível')).toBeEnabled()
    fireEvent.click(janela.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => {
      expect(enviados).toHaveLength(1)
    })
    expect(enviados[0]?.corpo).toEqual({
      ...gravado,
      options: [...gravado.options, { name: 'Picles', priceDeltaInCents: 0, isAvailable: true }],
    })
  })

  it('na aba dos opcionais, criar e excluir um grupo é só de quem altera os opcionais', async () => {
    abrirNoCardapio('/opcionais', {}, SO_PRECO)
    await screen.findByText('Adicionais')

    expect(screen.getByRole('note')).toHaveTextContent('O seu perfil permite só alterar preços.')
    expect(screen.queryByRole('button', { name: /Novo grupo|^Excluir/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Editar o grupo Adicionais' })).toBeVisible()
  })
})
