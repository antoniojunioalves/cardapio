import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { chaveDoChecklist } from '../src/features/admin/checklist'
import {
  formularioSchema as entregaSchema,
  paraFormulario as entregaParaFormulario,
  useSalvarEntrega,
  type Entrega,
} from '../src/features/admin/delivery'
import {
  fechaNoDiaSeguinte,
  formularioSchema as horariosSchema,
  paraFormulario as horariosParaFormulario,
  repetirNosOutrosDias,
  useSalvarHorarios,
  type Horario,
} from '../src/features/admin/hours'
import { useSalvarFormasDePagamento, type FormaDePagamento } from '../src/features/admin/payment'
import { useSessaoStore } from '../src/features/admin/session'
import { abrir, mockarRotas, pararConexaoAoVivo, type Resposta } from './helpers/pagina'

const sessao = (permissions: string[]) => ({
  accessToken: 'token-de-acesso',
  user: { id: 'u', tenantId: 't', name: 'Zé', email: 'ze@exemplo.com', permissions },
  establishment: { id: 't', slug: 'lanchonete-do-ze', name: 'Lanchonete do Zé', status: 'ACTIVE' },
})
const SLUG = 'lanchonete-do-ze'
const DONO = sessao(['settings:read', 'settings:update'])
const SO_LEITURA = sessao(['settings:read'])

const HORARIOS: Horario[] = [
  { id: 'h1', dayOfWeek: 1, opensAt: '11:00:00', closesAt: '14:00:00' },
  { id: 'h2', dayOfWeek: 1, opensAt: '18:00:00', closesAt: '23:00:00' },
  { id: 'h3', dayOfWeek: 5, opensAt: '18:00:00', closesAt: '02:00:00' },
]

/** Como um estabelecimento nasce: sem entrega nem retirada. */
const ENTREGA_NOVA: Entrega = {
  configuracao: {
    deliveryEnabled: false,
    pickupEnabled: false,
    feeMode: 'FIXED',
    fixedFeeInCents: 0,
    estimatedMinMinutes: null,
    estimatedMaxMinutes: null,
  },
  regioes: [],
}

const ENTREGA_POR_REGIAO: Entrega = {
  configuracao: {
    deliveryEnabled: true,
    pickupEnabled: true,
    feeMode: 'BY_REGION',
    fixedFeeInCents: 0,
    estimatedMinMinutes: 30,
    estimatedMaxMinutes: 50,
  },
  regioes: [
    { id: 'r1', name: 'Centro', feeInCents: 500, isActive: true, sortOrder: 0 },
    { id: 'r2', name: 'Vila Nova', feeInCents: 850, isActive: false, sortOrder: 1 },
  ],
}

const FORMAS: FormaDePagamento[] = [
  { id: 'p-pix', code: 'PIX', name: 'Pix', kind: 'PIX', isEnabled: false, sortOrder: 0 },
  { id: 'p-din', code: 'CASH', name: 'Dinheiro', kind: 'CASH', isEnabled: false, sortOrder: 10 },
  { id: 'p-car', code: 'CARD', name: 'Cartão', kind: 'CARD', isEnabled: false, sortOrder: 20 },
]

interface Api {
  horarios?: Horario[]
  entrega?: Entrega
  formas?: FormaDePagamento[]
  /** A resposta de qualquer `PUT`. Sem ela, a API devolve o que recebeu, no formato da leitura. */
  salvar?: Resposta
}

/** O painel num endereço das configurações, com a API simulada. Devolve o que foi enviado. */
function abrirAba(aba: string, api: Api = {}, comSessao = DONO) {
  const enviados: { url: string; corpo: unknown }[] = []
  mockarRotas((url, metodo, corpo) => {
    if (metodo === 'PUT') {
      enviados.push({ url, corpo })
      if (api.salvar) return api.salvar
    }
    if (url.endsWith('/admin/business-hours')) {
      if (metodo !== 'PUT') return { status: 200, corpo: api.horarios ?? HORARIOS }
      const { intervalos } = corpo as { intervalos: Omit<Horario, 'id'>[] }
      return {
        status: 200,
        corpo: intervalos.map((intervalo, i) => ({ ...intervalo, id: `novo-${String(i)}` })),
      }
    }
    if (url.endsWith('/admin/delivery')) {
      if (metodo !== 'PUT') return { status: 200, corpo: api.entrega ?? ENTREGA_NOVA }
      const enviado = corpo as { configuracao: object; regioes: object[] }
      return {
        status: 200,
        corpo: {
          configuracao: enviado.configuracao,
          regioes: enviado.regioes.map((regiao, i) => ({ ...regiao, id: `nova-${String(i)}` })),
        },
      }
    }
    if (url.endsWith('/admin/payment-methods')) {
      const formas = api.formas ?? FORMAS
      if (metodo !== 'PUT') return { status: 200, corpo: formas }
      const { formas: escolhas } = corpo as {
        formas: { paymentMethodId: string; isEnabled: boolean }[]
      }
      return {
        status: 200,
        corpo: formas.map((forma) => ({
          ...forma,
          isEnabled: escolhas.find((e) => e.paymentMethodId === forma.id)?.isEnabled ?? false,
        })),
      }
    }
    return { status: 200, corpo: {} }
  })
  useSessaoStore.getState().guardar(comSessao)
  abrir(`/lanchonete-do-ze/admin/configuracoes${aba}`)
  return enviados
}

const salvar = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
}
const escrever = (campo: HTMLElement, valor: string) => {
  fireEvent.change(campo, { target: { value: valor } })
}
/** Dá tempo ao formulário de conferir de novo o que mudou. */
const assentar = () => act(() => new Promise<void>((resolver) => setTimeout(resolver, 100)))
/**
 * A mensagem saiu da tela e continua fora. Olhar uma vez só engana: o formulário
 * confere de novo depois de cada mudança, e pode pôr a mensagem de volta.
 */
async function sumiuDeVez(texto: string | RegExp) {
  await waitFor(() => {
    expect(screen.queryByText(texto)).toBeNull()
  })
  await assentar()
  expect(screen.queryByText(texto)).toBeNull()
}
const horario = (nome: string) => screen.getByRole('group', { name: nome })
const regiao = (numero: number) => screen.getByRole('group', { name: `Região ${String(numero)}` })

beforeEach(() => {
  localStorage.clear()
  useSessaoStore.setState({ slug: null, estabelecimento: null, usuario: null, accessToken: null })
  pararConexaoAoVivo()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('abas das configurações', () => {
  it('cada aba tem o seu endereço, e a do endereço aberto fica marcada', async () => {
    abrirAba('/horarios')
    await screen.findByRole('group', { name: 'Segunda-feira, 1º horário' })

    expect(screen.getByRole('heading', { level: 1, name: 'Configurações' })).toBeVisible()
    const abas = within(screen.getByRole('navigation', { name: 'Configurações' }))
    expect(
      abas.getAllByRole('link').map((aba) => [aba.textContent, aba.getAttribute('href')]),
    ).toEqual([
      ['Estabelecimento', '/lanchonete-do-ze/admin/configuracoes'],
      ['Horários', '/lanchonete-do-ze/admin/configuracoes/horarios'],
      ['Entrega', '/lanchonete-do-ze/admin/configuracoes/entrega'],
      ['Pagamento', '/lanchonete-do-ze/admin/configuracoes/pagamento'],
    ])
    expect(abas.getByRole('link', { name: 'Horários' })).toHaveAttribute('aria-current', 'page')
    expect(abas.getByRole('link', { name: 'Estabelecimento' })).not.toHaveAttribute('aria-current')
  })

  it('o menu do painel continua marcando "Configurações" dentro de uma aba — e só ele', async () => {
    abrirAba('/pagamento')
    await screen.findByLabelText('Pix')

    const menu = within(screen.getByRole('navigation', { name: 'Painel' }))
    expect(menu.getByRole('link', { name: 'Configurações' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(menu.getByRole('link', { name: 'Início' })).not.toHaveAttribute('aria-current')
  })

  it('trocar de aba abre a outra, sem sair das configurações', async () => {
    abrirAba('/horarios')
    await screen.findByRole('group', { name: 'Segunda-feira, 1º horário' })

    fireEvent.click(screen.getByRole('link', { name: 'Entrega' }))

    expect(await screen.findByLabelText('Retirada no local')).toBeVisible()
    expect(screen.getByRole('heading', { level: 1, name: 'Configurações' })).toBeVisible()
    expect(screen.queryByRole('group', { name: 'Segunda-feira, 1º horário' })).toBeNull()
  })

  it('falha ao carregar uma aba avisa, sem mostrar um formulário vazio', async () => {
    mockarRotas((url) =>
      url.endsWith('/admin/business-hours')
        ? { status: 500, corpo: {} }
        : { status: 200, corpo: {} },
    )
    useSessaoStore.getState().guardar(DONO)
    abrir('/lanchonete-do-ze/admin/configuracoes/horarios')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os horários.',
    )
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull()
  })
})

describe('horários: do banco para os campos, e as regras', () => {
  it('a hora chega sem os segundos, que o campo de hora mostraria', () => {
    expect(horariosParaFormulario(HORARIOS).intervalos[0]).toEqual({
      dayOfWeek: 1,
      opensAt: '11:00',
      closesAt: '14:00',
    })
  })

  it('o erro vai para o intervalo que tem o problema', () => {
    const resultado = horariosSchema.safeParse({
      intervalos: [
        { dayOfWeek: 1, opensAt: '11:00', closesAt: '15:00' },
        { dayOfWeek: 1, opensAt: '14:00', closesAt: '18:00' },
        { dayOfWeek: 2, opensAt: '', closesAt: '18:00' },
      ],
    })

    expect(resultado.error?.issues.map((issue) => [issue.path, issue.message])).toEqual([
      [['intervalos', 1, 'opensAt'], 'Este horário se sobrepõe a outro do mesmo dia.'],
      [['intervalos', 2, 'opensAt'], 'Informe a hora de abrir e a de fechar.'],
    ])
  })

  it('repetir um dia nos outros troca a semana inteira pelos horários dele', () => {
    const { intervalos } = horariosParaFormulario(HORARIOS)

    const repetidos = repetirNosOutrosDias(intervalos, 1)

    expect(repetidos).toHaveLength(14)
    for (const dia of [0, 1, 2, 3, 4, 5, 6]) {
      expect(repetidos.filter((i) => i.dayOfWeek === dia).map((i) => i.opensAt)).toEqual([
        '11:00',
        '18:00',
      ])
    }
  })

  it('fechar antes de abrir é fechar no dia seguinte', () => {
    expect(fechaNoDiaSeguinte({ dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00' })).toBe(true)
    expect(fechaNoDiaSeguinte({ dayOfWeek: 5, opensAt: '11:00', closesAt: '14:00' })).toBe(false)
    expect(fechaNoDiaSeguinte({ dayOfWeek: 5, opensAt: '18:00', closesAt: '' })).toBe(false)
  })
})

describe('aba de horários', () => {
  it('mostra a semana a partir de segunda, com os horários de cada dia', async () => {
    abrirAba('/horarios')
    const almoco = await screen.findByRole('group', { name: 'Segunda-feira, 1º horário' })

    expect(screen.getAllByRole('heading', { level: 3 }).map((dia) => dia.textContent)).toEqual([
      'Segunda-feira',
      'Terça-feira',
      'Quarta-feira',
      'Quinta-feira',
      'Sexta-feira',
      'Sábado',
      'Domingo',
    ])
    expect(within(almoco).getByLabelText(/abre às/)).toHaveValue('11:00')
    expect(within(almoco).getByLabelText(/fecha às/)).toHaveValue('14:00')
    expect(within(horario('Segunda-feira, 2º horário')).getByLabelText(/abre às/)).toHaveValue(
      '18:00',
    )
    // Cinco dias sem horário.
    expect(screen.getAllByText('Fechado')).toHaveLength(5)
    // Sexta fecha às 02:00 de sábado.
    expect(screen.getByText('Fecha no dia seguinte.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled()
  })

  it('acrescenta um horário e grava a semana inteira, no formato da API', async () => {
    const enviados = abrirAba('/horarios')
    await screen.findByRole('group', { name: 'Segunda-feira, 1º horário' })

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar horário: Domingo' }))
    const domingo = within(horario('Domingo, 1º horário'))
    escrever(domingo.getByLabelText(/abre às/), '12:00')
    escrever(domingo.getByLabelText(/fecha às/), '16:00')
    salvar()

    expect(await screen.findByText('Horários salvos.')).toBeVisible()
    expect(enviados).toEqual([
      {
        url: expect.stringMatching(/\/api\/v1\/admin\/business-hours$/) as string,
        corpo: {
          intervalos: [
            { dayOfWeek: 1, opensAt: '11:00', closesAt: '14:00' },
            { dayOfWeek: 1, opensAt: '18:00', closesAt: '23:00' },
            { dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00' },
            { dayOfWeek: 0, opensAt: '12:00', closesAt: '16:00' },
          ],
        },
      },
    ])
    // Gravado, o formulário deixa de estar "alterado".
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled()
  })

  it('remove um horário', async () => {
    const enviados = abrirAba('/horarios')
    await screen.findByRole('group', { name: 'Segunda-feira, 1º horário' })

    fireEvent.click(screen.getByRole('button', { name: 'Remover: Segunda-feira, 1º horário' }))

    // O que era o segundo passa a ser o primeiro do dia.
    expect(within(horario('Segunda-feira, 1º horário')).getByLabelText(/abre às/)).toHaveValue(
      '18:00',
    )
    expect(screen.queryByRole('group', { name: 'Segunda-feira, 2º horário' })).toBeNull()

    salvar()
    await screen.findByText('Horários salvos.')
    expect(enviados[0]?.corpo).toEqual({
      intervalos: [
        { dayOfWeek: 1, opensAt: '18:00', closesAt: '23:00' },
        { dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00' },
      ],
    })
  })

  it('repete os horários de um dia nos outros', async () => {
    const enviados = abrirAba('/horarios')
    await screen.findByRole('group', { name: 'Segunda-feira, 1º horário' })

    fireEvent.click(screen.getByRole('button', { name: 'Repetir nos outros dias: Sexta-feira' }))

    expect(screen.queryByText('Fechado')).toBeNull()
    expect(within(horario('Domingo, 1º horário')).getByLabelText(/abre às/)).toHaveValue('18:00')
    // O almoço de segunda saiu: a semana inteira ficou como a sexta.
    expect(screen.queryByRole('group', { name: 'Segunda-feira, 2º horário' })).toBeNull()

    salvar()
    await screen.findByText('Horários salvos.')
    const { intervalos } = enviados[0]?.corpo as { intervalos: { dayOfWeek: number }[] }
    expect(intervalos.map((i) => i.dayOfWeek).sort()).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('não envia com horário em branco ou sobreposto, e diz qual é o problema', async () => {
    const enviados = abrirAba('/horarios')
    await screen.findByRole('group', { name: 'Segunda-feira, 1º horário' })

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar horário: Terça-feira' }))
    escrever(within(horario('Segunda-feira, 2º horário')).getByLabelText(/abre às/), '13:00')
    salvar()

    expect(await screen.findByText('Informe a hora de abrir e a de fechar.')).toBeVisible()
    expect(screen.getByText('Este horário se sobrepõe a outro do mesmo dia.')).toBeVisible()
    const emBranco = within(horario('Terça-feira, 1º horário')).getByLabelText(/abre às/)
    expect(emBranco).toHaveAttribute('aria-invalid', 'true')
    expect(emBranco).toHaveAccessibleDescription('Informe a hora de abrir e a de fechar.')
    expect(enviados).toEqual([])
  })

  it('corrigir a hora de fechar, ou o outro horário, tira o erro na hora', async () => {
    abrirAba('/horarios')
    await screen.findByRole('group', { name: 'Segunda-feira, 1º horário' })
    const SOBREPOSTO = 'Este horário se sobrepõe a outro do mesmo dia.'
    const IGUAIS = /Abrir e fechar não podem ser na mesma hora/
    const jantar = () => within(horario('Segunda-feira, 2º horário'))

    // Abre e fecha iguais: o erro fica na linha, e some ao corrigir a hora de fechar.
    escrever(jantar().getByLabelText(/fecha às/), '18:00')
    salvar()
    await screen.findByText(IGUAIS)
    escrever(jantar().getByLabelText(/fecha às/), '23:00')
    await sumiuDeVez(IGUAIS)

    // Sobreposto: o erro fica no jantar, e some ao encurtar o almoço.
    escrever(jantar().getByLabelText(/abre às/), '13:00')
    salvar()
    await screen.findByText(SOBREPOSTO)
    escrever(within(horario('Segunda-feira, 1º horário')).getByLabelText(/fecha às/), '12:30')
    await sumiuDeVez(SOBREPOSTO)
  })

  it('remover o horário que causava a sobreposição tira o erro do outro', async () => {
    abrirAba('/horarios')
    await screen.findByRole('group', { name: 'Segunda-feira, 1º horário' })
    const SOBREPOSTO = 'Este horário se sobrepõe a outro do mesmo dia.'

    escrever(within(horario('Segunda-feira, 2º horário')).getByLabelText(/abre às/), '13:00')
    salvar()
    await screen.findByText(SOBREPOSTO)
    fireEvent.click(screen.getByRole('button', { name: 'Remover: Segunda-feira, 1º horário' }))

    await sumiuDeVez(SOBREPOSTO)
  })

  it('sem nenhum horário, avisa que o cardápio fica sempre fechado', async () => {
    abrirAba('/horarios', { horarios: [] })

    expect(await screen.findByRole('note')).toHaveTextContent(
      'Sem nenhum horário, o cardápio aparece sempre fechado.',
    )
    expect(screen.getAllByText('Fechado')).toHaveLength(7)
  })

  it('servidor fora do ar: avisa e mantém o que a pessoa digitou', async () => {
    abrirAba('/horarios', { salvar: 'falha-de-rede' })
    const almoco = await screen.findByRole('group', { name: 'Segunda-feira, 1º horário' })

    escrever(within(almoco).getByLabelText(/abre às/), '10:30')
    salvar()

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar agora.')
    expect(within(almoco).getByLabelText(/abre às/)).toHaveValue('10:30')
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeEnabled()
  })

  it('quem só pode ver não altera: campos desligados, sem adicionar, remover nem salvar', async () => {
    abrirAba('/horarios', {}, SO_LEITURA)
    const almoco = await screen.findByRole('group', { name: 'Segunda-feira, 1º horário' })

    expect(within(almoco).getByLabelText(/abre às/)).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Adicionar horário/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Remover/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull()
    expect(screen.getByText(/o seu perfil não permite alterá-las/)).toBeVisible()
  })
})

describe('entrega: do banco para os campos, e de volta', () => {
  it('mostra as taxas em reais, como a pessoa as digita', () => {
    expect(entregaParaFormulario(ENTREGA_POR_REGIAO)).toMatchObject({
      fixedFeeInCents: '0,00',
      estimatedMinMinutes: '30',
      regioes: [
        { name: 'Centro', feeInCents: '5,00', isActive: true },
        { name: 'Vila Nova', feeInCents: '8,50', isActive: false },
      ],
    })
  })

  it('entrega à API centavos, nulo no tempo em branco e as regiões na ordem da lista', () => {
    const dados = entregaSchema.parse({
      ...entregaParaFormulario(ENTREGA_POR_REGIAO),
      estimatedMinMinutes: '',
      regioes: [
        { name: '  Vila Nova ', feeInCents: '8,5', isActive: true },
        { name: 'Centro', feeInCents: '', isActive: true },
      ],
    })

    expect(dados).toEqual({
      configuracao: {
        deliveryEnabled: true,
        pickupEnabled: true,
        feeMode: 'BY_REGION',
        fixedFeeInCents: 0,
        estimatedMinMinutes: null,
        estimatedMaxMinutes: 50,
      },
      regioes: [
        { name: 'Vila Nova', feeInCents: 850, isActive: true, sortOrder: 0 },
        { name: 'Centro', feeInCents: 0, isActive: true, sortOrder: 1 },
      ],
    })
  })

  const erros = (valores: object) =>
    entregaSchema
      .safeParse({ ...entregaParaFormulario(ENTREGA_POR_REGIAO), ...valores })
      .error?.issues.map((issue) => issue.path.join('.'))

  it('as regras são as da API: uma por uma', () => {
    expect(erros({})).toBeUndefined()
    expect(erros({ deliveryEnabled: false, pickupEnabled: false })).toEqual(['pickupEnabled'])
    expect(erros({ regioes: [] })).toEqual(['regioes'])
    expect(erros({ regioes: [{ name: 'Centro', feeInCents: '5', isActive: false }] })).toEqual([
      'regioes',
    ])
    expect(
      erros({
        regioes: [
          { name: 'Centro', feeInCents: '5', isActive: true },
          { name: 'centro', feeInCents: '9', isActive: true },
        ],
      }),
    ).toEqual(['regioes.1.name'])
    expect(erros({ estimatedMinMinutes: '60', estimatedMaxMinutes: '30' })).toEqual([
      'estimatedMaxMinutes',
    ])
  })

  it('uma linha de região em branco não é região: não é cobrada, nem enviada, nem conta', () => {
    const EM_BRANCO = { name: '  ', feeInCents: '', isActive: true }
    const dados = entregaSchema.parse({
      ...entregaParaFormulario(ENTREGA_POR_REGIAO),
      regioes: [EM_BRANCO, { name: 'Centro', feeInCents: '5', isActive: true }, EM_BRANCO],
    })

    expect(dados.regioes).toEqual([
      { name: 'Centro', feeInCents: 500, isActive: true, sortOrder: 0 },
    ])
    // Duas linhas em branco não são "nome repetido"; e só elas não fazem uma região ativa.
    expect(erros({ regioes: [EM_BRANCO, EM_BRANCO] })).toEqual(['regioes'])
    // Com a taxa preenchida, a pessoa começou uma região: aí o nome é cobrado.
    expect(erros({ regioes: [{ name: '', feeInCents: '5', isActive: true }] })).toEqual([
      'regioes.0.name',
      'regioes',
    ])
    // E o nome é cobrado mesmo com a taxa mal digitada.
    expect(
      erros({ feeMode: 'FIXED', regioes: [{ name: '', feeInCents: 'cinco', isActive: true }] }),
    ).toEqual(['regioes.0.feeInCents', 'regioes.0.name'])
  })

  it('sem entrega, ou com taxa fixa, as regiões não são exigidas', () => {
    expect(erros({ deliveryEnabled: false, regioes: [] })).toBeUndefined()
    expect(erros({ feeMode: 'FIXED', regioes: [] })).toBeUndefined()
  })

  it('uma região com a taxa inválida não esconde a falta de uma região ativa', () => {
    expect(erros({ regioes: [{ name: 'Centro', feeInCents: 'cinco', isActive: false }] })).toEqual([
      'regioes.0.feeInCents',
      'regioes',
    ])
  })

  it('nem o tempo invertido, nem a falta de entrega e retirada', () => {
    expect(
      erros({
        fixedFeeInCents: 'cinco',
        deliveryEnabled: false,
        pickupEnabled: false,
        estimatedMinMinutes: '60',
        estimatedMaxMinutes: '30',
      }),
    ).toEqual(['fixedFeeInCents', 'pickupEnabled', 'estimatedMaxMinutes'])
  })
})

describe('aba de entrega', () => {
  it('no estabelecimento novo, tudo desligado: avisa, e não mostra taxa nenhuma', async () => {
    abrirAba('/entrega')

    expect(await screen.findByLabelText('Entrega')).not.toBeChecked()
    expect(screen.getByLabelText('Retirada no local')).not.toBeChecked()
    expect(screen.getByRole('note')).toHaveTextContent('o cardápio não recebe pedidos')
    expect(screen.queryByRole('heading', { name: 'Taxa de entrega' })).toBeNull()
    expect(screen.queryByLabelText('Tempo mínimo (min)')).toBeNull()
  })

  it('só retirada: liga, salva e o aviso some', async () => {
    const enviados = abrirAba('/entrega')

    fireEvent.click(await screen.findByLabelText('Retirada no local'))
    expect(screen.queryByRole('note')).toBeNull()
    salvar()

    expect(await screen.findByText('Entrega salva.')).toBeVisible()
    expect(enviados).toEqual([
      {
        url: expect.stringMatching(/\/api\/v1\/admin\/delivery$/) as string,
        corpo: {
          configuracao: {
            deliveryEnabled: false,
            pickupEnabled: true,
            feeMode: 'FIXED',
            fixedFeeInCents: 0,
            estimatedMinMinutes: null,
            estimatedMaxMinutes: null,
          },
          regioes: [],
        },
      },
    ])
  })

  it('entrega com taxa fixa: os campos aparecem ao ligar, e a taxa vai em centavos', async () => {
    const enviados = abrirAba('/entrega')

    fireEvent.click(await screen.findByLabelText('Entrega'))
    expect(screen.getByRole('radio', { name: 'Taxa fixa' })).toBeChecked()
    escrever(screen.getByLabelText('Taxa fixa (R$)'), '7,5')
    escrever(screen.getByLabelText('Tempo mínimo (min)'), '30')
    escrever(screen.getByLabelText('Tempo máximo (min)'), '50')
    salvar()

    await screen.findByText('Entrega salva.')
    expect(enviados[0]?.corpo).toMatchObject({
      configuracao: {
        deliveryEnabled: true,
        feeMode: 'FIXED',
        fixedFeeInCents: 750,
        estimatedMinMinutes: 30,
        estimatedMaxMinutes: 50,
      },
    })
    expect(screen.getByLabelText('Taxa fixa (R$)')).toHaveValue('7,50')
  })

  it('taxa por região: mostra as cadastradas, acrescenta, remove e grava na ordem', async () => {
    const enviados = abrirAba('/entrega', { entrega: ENTREGA_POR_REGIAO })

    const centro = within(await screen.findByRole('group', { name: 'Região 1' }))
    expect(centro.getByLabelText('Nome')).toHaveValue('Centro')
    expect(centro.getByLabelText('Taxa (R$)')).toHaveValue('5,00')
    expect(within(regiao(2)).getByLabelText('Ativa')).not.toBeChecked()
    // No modo por região, a taxa fixa não aparece.
    expect(screen.queryByLabelText('Taxa fixa (R$)')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Remover a região 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar região' }))
    escrever(within(regiao(2)).getByLabelText('Nome'), 'Jardim')
    escrever(within(regiao(2)).getByLabelText('Taxa (R$)'), '12')
    salvar()

    await screen.findByText('Entrega salva.')
    expect(enviados[0]?.corpo).toMatchObject({
      configuracao: { feeMode: 'BY_REGION' },
      regioes: [
        { name: 'Vila Nova', feeInCents: 850, isActive: false, sortOrder: 0 },
        { name: 'Jardim', feeInCents: 1200, isActive: true, sortOrder: 1 },
      ],
    })
  })

  it('por região sem nenhuma região ativa não é enviado', async () => {
    const enviados = abrirAba('/entrega')

    fireEvent.click(await screen.findByLabelText('Entrega'))
    fireEvent.click(screen.getByRole('radio', { name: 'Taxa por região' }))
    expect(screen.getByText('Nenhuma região cadastrada.')).toBeVisible()
    salvar()

    expect(
      await screen.findByText('Com a taxa por região, cadastre ao menos uma região ativa.'),
    ).toBeVisible()
    expect(enviados).toEqual([])
  })

  // Uma regra entre campos deixa o erro num deles só. Corrigir pelo outro tem
  // de tirar a mensagem da tela na hora, e não só no próximo "Salvar".
  it('trocar para taxa fixa tira o erro das regiões, e elas somem da tela', async () => {
    const enviados = abrirAba('/entrega')
    const ERRO = 'Com a taxa por região, cadastre ao menos uma região ativa.'

    fireEvent.click(await screen.findByLabelText('Entrega'))
    fireEvent.click(screen.getByRole('radio', { name: 'Taxa por região' }))
    salvar()
    await screen.findByText(ERRO)
    fireEvent.click(screen.getByRole('radio', { name: 'Taxa fixa' }))

    await sumiuDeVez(ERRO)
    expect(screen.queryByRole('button', { name: 'Adicionar região' })).toBeNull()
    expect(screen.getByLabelText('Taxa fixa (R$)')).toBeVisible()

    salvar()
    await screen.findByText('Entrega salva.')
    expect(enviados[0]?.corpo).toMatchObject({ configuracao: { feeMode: 'FIXED' }, regioes: [] })
  })

  it('escolher taxa por região pela primeira vez não cobra a região antes da hora', async () => {
    abrirAba('/entrega')

    fireEvent.click(await screen.findByLabelText('Entrega'))
    fireEvent.click(screen.getByRole('radio', { name: 'Taxa por região' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Taxa fixa' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Taxa por região' }))

    // Só conferir de novo o que já estava com erro: aqui ainda não houve "Salvar".
    await screen.findByText('Nenhuma região cadastrada.')
    await assentar()
    expect(screen.queryByText(/cadastre ao menos uma região ativa/)).toBeNull()
  })

  it('quem acrescenta uma região, desiste e marca taxa fixa consegue salvar', async () => {
    const enviados = abrirAba('/entrega')

    fireEvent.click(await screen.findByLabelText('Entrega'))
    fireEvent.click(screen.getByRole('radio', { name: 'Taxa por região' }))
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar região' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Taxa fixa' }))
    escrever(screen.getByLabelText('Taxa fixa (R$)'), '6')
    salvar()

    await screen.findByText('Entrega salva.')
    expect(enviados[0]?.corpo).toMatchObject({
      configuracao: { feeMode: 'FIXED', fixedFeeInCents: 600 },
      regioes: [],
    })
  })

  it('desligar a entrega também tira o erro das regiões', async () => {
    abrirAba('/entrega')
    const ERRO = 'Com a taxa por região, cadastre ao menos uma região ativa.'

    fireEvent.click(await screen.findByLabelText('Entrega'))
    fireEvent.click(screen.getByLabelText('Retirada no local'))
    fireEvent.click(screen.getByRole('radio', { name: 'Taxa por região' }))
    salvar()
    await screen.findByText(ERRO)
    fireEvent.click(screen.getByLabelText('Entrega'))

    await sumiuDeVez(ERRO)
    expect(screen.queryByRole('heading', { name: 'Taxa de entrega' })).toBeNull()
  })

  it('a região acrescentada resolve o erro quando ganha nome, e não antes', async () => {
    abrirAba('/entrega')
    const ERRO = 'Com a taxa por região, cadastre ao menos uma região ativa.'

    fireEvent.click(await screen.findByLabelText('Entrega'))
    fireEvent.click(screen.getByRole('radio', { name: 'Taxa por região' }))
    salvar()
    await screen.findByText(ERRO)
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar região' }))

    // Em branco, a linha ainda não é uma região: a mensagem fica, e o nome não é cobrado.
    await assentar()
    expect(screen.getByText(ERRO)).toBeVisible()
    expect(screen.queryByText('Informe o nome da região.')).toBeNull()

    escrever(within(regiao(1)).getByLabelText('Nome'), 'Centro')
    await sumiuDeVez(ERRO)
  })

  it('renomear a primeira região tira o erro de nome repetido da segunda', async () => {
    abrirAba('/entrega', { entrega: ENTREGA_POR_REGIAO })
    const ERRO = 'Já existe uma região com este nome.'
    await screen.findByRole('group', { name: 'Região 1' })

    escrever(within(regiao(2)).getByLabelText('Nome'), 'centro')
    salvar()
    await screen.findByText(ERRO)
    escrever(within(regiao(1)).getByLabelText('Nome'), 'Centro Velho')

    await sumiuDeVez(ERRO)
  })

  it('marcar uma região como ativa tira o erro de não haver nenhuma', async () => {
    abrirAba('/entrega', { entrega: ENTREGA_POR_REGIAO })
    const ERRO = 'Com a taxa por região, cadastre ao menos uma região ativa.'

    fireEvent.click(
      within(await screen.findByRole('group', { name: 'Região 1' })).getByLabelText('Ativa'),
    )
    salvar()
    await screen.findByText(ERRO)
    fireEvent.click(within(regiao(2)).getByLabelText('Ativa'))

    await sumiuDeVez(ERRO)
  })

  it('ligar a entrega tira o erro de não ter entrega nem retirada', async () => {
    abrirAba('/entrega', { entrega: ENTREGA_POR_REGIAO })

    fireEvent.click(await screen.findByLabelText('Entrega'))
    fireEvent.click(screen.getByLabelText('Retirada no local'))
    salvar()
    await screen.findByText(/Ligue a entrega ou a retirada/)
    fireEvent.click(screen.getByLabelText('Entrega'))

    await sumiuDeVez(/Ligue a entrega ou a retirada/)
  })

  it('corrigir o tempo mínimo tira o erro que estava no máximo', async () => {
    abrirAba('/entrega', { entrega: ENTREGA_POR_REGIAO })
    const ERRO = 'O tempo máximo não pode ser menor que o mínimo.'

    escrever(await screen.findByLabelText('Tempo mínimo (min)'), '90')
    salvar()
    await screen.findByText(ERRO)
    escrever(screen.getByLabelText('Tempo mínimo (min)'), '20')

    await sumiuDeVez(ERRO)
  })

  it('região sem nome, nome repetido e taxa que não é valor aparecem no campo', async () => {
    const enviados = abrirAba('/entrega', { entrega: ENTREGA_POR_REGIAO })
    await screen.findByRole('group', { name: 'Região 1' })

    escrever(within(regiao(2)).getByLabelText('Nome'), 'CENTRO')
    salvar()
    expect(await screen.findByText('Já existe uma região com este nome.')).toBeVisible()

    escrever(within(regiao(2)).getByLabelText('Nome'), '')
    escrever(within(regiao(1)).getByLabelText('Taxa (R$)'), 'cinco')
    salvar()
    expect(await screen.findByText('Informe o nome da região.')).toBeVisible()
    expect(screen.getByText('Informe um valor em reais, como 20,00.')).toBeVisible()
    expect(enviados).toEqual([])
  })

  it('desligar entrega e retirada não é enviado, e o erro diz o que fazer', async () => {
    const enviados = abrirAba('/entrega', { entrega: ENTREGA_POR_REGIAO })

    fireEvent.click(await screen.findByLabelText('Entrega'))
    fireEvent.click(screen.getByLabelText('Retirada no local'))
    salvar()

    expect(await screen.findByRole('alert')).toHaveTextContent('Ligue a entrega ou a retirada')
    expect(enviados).toEqual([])
  })

  it('uma parte com erro não some da tela ao desligar a entrega', async () => {
    const enviados = abrirAba('/entrega', { entrega: ENTREGA_POR_REGIAO })
    await screen.findByRole('group', { name: 'Região 1' })

    escrever(within(regiao(1)).getByLabelText('Nome'), '')
    salvar()
    await screen.findByText('Informe o nome da região.')
    fireEvent.click(screen.getByLabelText('Entrega'))

    // Escondida, a região inválida seria um "Salvar" que não faz nada, sem explicação.
    expect(screen.getByText('Informe o nome da região.')).toBeVisible()
    expect(enviados).toEqual([])
  })

  it('quem só pode ver não altera', async () => {
    abrirAba('/entrega', { entrega: ENTREGA_POR_REGIAO }, SO_LEITURA)

    expect(await screen.findByLabelText('Entrega')).toBeDisabled()
    expect(within(regiao(1)).getByLabelText('Nome')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Adicionar região' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Remover a região/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull()
  })
})

describe('aba de pagamento', () => {
  it('lista o catálogo, e avisa enquanto nenhuma forma está marcada', async () => {
    abrirAba('/pagamento')

    expect(await screen.findByLabelText('Pix')).not.toBeChecked()
    expect(
      screen.getAllByRole('checkbox').map((caixa) => caixa.getAttribute('aria-label')),
    ).toEqual(['Pix', 'Dinheiro', 'Cartão'])
    expect(screen.getByRole('note')).toHaveTextContent('o cardápio não recebe pedidos')
  })

  it('marca as formas e grava todas, com a ordem que tinham', async () => {
    const enviados = abrirAba('/pagamento')

    fireEvent.click(await screen.findByLabelText('Pix'))
    fireEvent.click(screen.getByLabelText('Cartão'))
    expect(screen.queryByRole('note')).toBeNull()
    salvar()

    expect(await screen.findByText('Formas de pagamento salvas.')).toBeVisible()
    expect(enviados).toEqual([
      {
        url: expect.stringMatching(/\/api\/v1\/admin\/payment-methods$/) as string,
        corpo: {
          formas: [
            { paymentMethodId: 'p-pix', isEnabled: true, sortOrder: 0 },
            { paymentMethodId: 'p-din', isEnabled: false, sortOrder: 10 },
            { paymentMethodId: 'p-car', isEnabled: true, sortOrder: 20 },
          ],
        },
      },
    ])
    expect(screen.getByLabelText('Pix')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled()
  })

  it('quem só pode ver não altera', async () => {
    abrirAba('/pagamento', {}, SO_LEITURA)

    expect(await screen.findByLabelText('Pix')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull()
  })
})

/** O que os três "salvar" têm em comum, para os testes os tratarem igual. */
interface Gravacao {
  mutateAsync: (dados: never) => Promise<unknown>
}

describe('a lista do Início e as abas', () => {
  it('cada passo que se resolve nas configurações leva à aba certa', async () => {
    mockarRotas((url) =>
      url.endsWith('/admin/setup-checklist')
        ? {
            status: 200,
            corpo: {
              ready: false,
              steps: ['whatsapp', 'businessHours', 'fulfillment', 'paymentMethods'].map((key) => ({
                key,
                done: false,
              })),
            },
          }
        : { status: 200, corpo: url.endsWith('/admin/delivery') ? ENTREGA_NOVA : {} },
    )
    useSessaoStore.getState().guardar(DONO)
    abrir('/lanchonete-do-ze/admin')

    const lista = within(
      await screen.findByRole('region', { name: 'O que falta para receber pedidos' }),
    )
    expect(
      lista.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Abrir as configurações', '/lanchonete-do-ze/admin/configuracoes'],
      ['Cadastrar os horários', '/lanchonete-do-ze/admin/configuracoes/horarios'],
      ['Configurar a entrega', '/lanchonete-do-ze/admin/configuracoes/entrega'],
      ['Escolher as formas de pagamento', '/lanchonete-do-ze/admin/configuracoes/pagamento'],
    ])

    fireEvent.click(lista.getByRole('link', { name: 'Configurar a entrega' }))
    expect(await screen.findByLabelText('Retirada no local')).toBeVisible()
  })

  // Voltando ao Início a lista seria relida de qualquer jeito, por estar fora
  // da tela; o que estes testes conferem é a marca, que vale também no dia em
  // que a lista ganhar um tempo de validade.
  const GRAVACOES: [string, () => Gravacao, unknown][] = [
    ['os horários', () => useSalvarHorarios(SLUG), { intervalos: [] }],
    [
      'a entrega',
      () => useSalvarEntrega(SLUG),
      entregaSchema.parse(entregaParaFormulario(ENTREGA_POR_REGIAO)),
    ],
    ['as formas de pagamento', () => useSalvarFormasDePagamento(SLUG), { formas: [] }],
  ]

  it.each(GRAVACOES)(
    'gravar %s marca a lista do que falta para ser relida',
    async (_, usar, dados) => {
      mockarRotas(() => ({ status: 200, corpo: [] }))
      useSessaoStore.getState().guardar(DONO)
      const client = new QueryClient()
      client.setQueryData(chaveDoChecklist(SLUG), { ready: false, steps: [] })
      const { result } = renderHook(usar, {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      })

      await act(() => result.current.mutateAsync(dados as never))

      expect(client.getQueryState(chaveDoChecklist(SLUG))?.isInvalidated).toBe(true)
    },
  )
})
