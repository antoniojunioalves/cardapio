import { useState } from 'react'
import { Link } from 'react-router'

import { IconeDescer, IconeEditar, IconeLixeira, IconeSubir, IconeVoltar } from '@/components/icons'
import { Sheet } from '@/components/Sheet'
import { ApiError } from '@/services/api'

import { caminhoDoPainel } from '../menu'

/** As peças que a lista do cardápio e as páginas de categoria e produto têm em comum. */

/** Um link de volta, no topo das páginas de criar e editar. */
export function Voltar({ para, rotulo, state }: { para: string; rotulo: string; state?: unknown }) {
  return (
    <Link
      to={para}
      state={state}
      className="text-caption -ml-2 inline-flex w-fit items-center gap-1 rounded-control px-2 py-1.5 font-semibold text-primary hover:bg-primary/10"
    >
      <IconeVoltar className="size-4" />
      {rotulo}
    </Link>
  )
}

/**
 * O link de volta à lista, no topo das páginas de categoria e de produto. Com
 * `abrir`, a lista chega com essa categoria aberta.
 */
export function VoltarAoCardapio({ slug, abrir }: { slug: string; abrir?: string | undefined }) {
  return (
    <Voltar
      para={caminhoDoPainel(slug, 'cardapio')}
      rotulo="Cardápio"
      state={abrir ? { abrir } : undefined}
    />
  )
}

/** A foto do produto na lista, ou um quadrado vazio do mesmo tamanho. */
export function Miniatura({ url }: { url: string | null }) {
  return url ? (
    <img src={url} alt="" className="size-14 shrink-0 rounded-control object-cover" />
  ) : (
    <span aria-hidden="true" className="size-14 shrink-0 rounded-control bg-surface-muted" />
  )
}

interface BotoesDeOrdemProps {
  /** Quem se move, como o leitor de tela diz: "o X-Burger", "a categoria Lanches". */
  quem: string
  primeiro: boolean
  ultimo: boolean
  ocupado: boolean
  aoMover: (direcao: 'subir' | 'descer') => void
  /** Lado a lado, num cabeçalho de uma linha só; um sobre o outro, numa linha de produto. */
  lado?: 'a-lado' | 'empilhados'
}

/**
 * Subir e descer um item na lista. Botões, e não arrastar: funcionam no
 * celular, no teclado e no leitor de tela do mesmo jeito.
 */
export function BotoesDeOrdem({
  quem,
  primeiro,
  ultimo,
  ocupado,
  aoMover,
  lado = 'empilhados',
}: BotoesDeOrdemProps) {
  const classe =
    'rounded-control p-1.5 text-content-muted hover:bg-surface-muted hover:text-content disabled:opacity-30 disabled:hover:bg-transparent'
  return (
    <div className={`flex shrink-0 ${lado === 'a-lado' ? 'flex-row' : 'flex-col'}`}>
      <button
        type="button"
        aria-label={`Subir ${quem}`}
        disabled={primeiro || ocupado}
        onClick={() => {
          aoMover('subir')
        }}
        className={classe}
      >
        <IconeSubir />
      </button>
      <button
        type="button"
        aria-label={`Descer ${quem}`}
        disabled={ultimo || ocupado}
        onClick={() => {
          aoMover('descer')
        }}
        className={classe}
      >
        <IconeDescer />
      </button>
    </div>
  )
}

interface ConfirmarExclusaoProps {
  /** "o produto", "a categoria". */
  oQue: string
  nome: string
  /** O que acontece ao excluir, dito antes de a pessoa confirmar. */
  consequencia: string
  /**
   * Por que não dá para excluir agora. Com ele, a janela explica o que fazer
   * e não oferece o botão.
   */
  impedimento?: string | null
  excluir: { isPending: boolean; error: unknown }
  aoConfirmar: () => void
  aoFechar: () => void
}

/** A janela que pergunta antes de excluir, e mostra a recusa da API. */
export function ConfirmarExclusao({
  oQue,
  nome,
  consequencia,
  impedimento,
  excluir,
  aoConfirmar,
  aoFechar,
}: ConfirmarExclusaoProps) {
  const rotulo = rotuloDeExcluir(oQue)
  return (
    <Sheet
      titulo={impedimento ? `Não dá para excluir ${oQue} “${nome}”` : `Excluir ${oQue} “${nome}”?`}
      aoFechar={aoFechar}
      rodape={
        impedimento ? undefined : (
          <button
            type="button"
            disabled={excluir.isPending}
            onClick={aoConfirmar}
            className="text-body w-full rounded-control bg-danger px-4 py-3 font-semibold text-content-inverted disabled:opacity-50"
          >
            {excluir.isPending ? 'Excluindo…' : rotulo}
          </button>
        )
      }
    >
      <p className="text-body text-content">{impedimento ?? consequencia}</p>
      {!impedimento && Boolean(excluir.error) && (
        <p role="alert" className="text-caption mt-stack text-danger">
          {excluir.error instanceof ApiError && excluir.error.status === 409
            ? // "Faz parte do combo X", "a categoria tem 3 produtos": a API explica.
              excluir.error.message
            : 'Não foi possível excluir agora. Tente de novo.'}
        </p>
      )}
    </Sheet>
  )
}

/** "o produto" → "Excluir produto". */
const rotuloDeExcluir = (oQue: string) => `Excluir ${oQue.replace(/^(o|a) /, '')}`

interface ExcluirProps extends Omit<ConfirmarExclusaoProps, 'aoFechar' | 'excluir'> {
  excluir: { isPending: boolean; error: unknown; reset: () => void }
}

/**
 * "Excluir", no fim da página de edição, com a confirmação numa janela antes de
 * apagar. Com um impedimento, o botão fica desligado e a frase aparece embaixo.
 */
export function Excluir({ excluir, impedimento, ...janela }: ExcluirProps) {
  const [confirmando, setConfirmando] = useState(false)

  return (
    <div className="flex flex-col gap-1 border-t border-border pt-stack">
      <button
        type="button"
        disabled={Boolean(impedimento)}
        onClick={() => {
          excluir.reset()
          setConfirmando(true)
        }}
        className="text-body w-fit rounded-control px-2 py-1.5 font-semibold text-danger hover:bg-danger/10 disabled:opacity-50 disabled:hover:bg-transparent"
      >
        {rotuloDeExcluir(janela.oQue)}
      </button>
      {impedimento && <p className="text-caption text-content-muted">{impedimento}</p>}

      {confirmando && (
        <ConfirmarExclusao
          {...janela}
          excluir={excluir}
          aoFechar={() => {
            setConfirmando(false)
          }}
        />
      )}
    </div>
  )
}

interface EditarEExcluirProps {
  /** Quem, como o leitor de tela diz: "X-Burger", "a categoria Lanches". */
  quem: string
  /** O endereço da página de edição. Sem ele, não há lápis. */
  editar?: string | undefined
  /** Abre a confirmação. Sem ele, não há lixeira. */
  aoExcluir?: (() => void) | undefined
}

/**
 * O lápis e a lixeira, ao lado do nome de uma categoria ou de um produto na
 * lista. Lápis azul, lixeira vermelha (pedido do Junio): a cor diz o que cada
 * um faz antes de a pessoa ler.
 */
export function EditarEExcluir({ quem, editar, aoExcluir }: EditarEExcluirProps) {
  if (!editar && !aoExcluir) return null
  const classe = 'rounded-control p-1.5'
  return (
    <span className="flex shrink-0">
      {editar && (
        <Link
          to={editar}
          aria-label={`Editar ${quem}`}
          className={`${classe} text-info hover:bg-info/10`}
        >
          <IconeEditar className="size-4" />
        </Link>
      )}
      {aoExcluir && (
        <button
          type="button"
          aria-label={`Excluir ${quem}`}
          onClick={aoExcluir}
          className={`${classe} text-danger hover:bg-danger/10`}
        >
          <IconeLixeira className="size-4" />
        </button>
      )}
    </span>
  )
}
