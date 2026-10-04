import type { UseQueryResult } from '@tanstack/react-query'
import { useId, type ComponentProps, type ReactNode } from 'react'

import { ApiError } from '@/services/api'

/**
 * As peças que as abas das configurações têm em comum: o cartão de uma seção,
 * o aviso de quem só pode ver, o rodapé com o "Salvar" e a espera dos dados.
 */

export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-stack rounded-card bg-surface p-card shadow-card">
      <h2 className="text-body font-semibold text-content">{titulo}</h2>
      {children}
    </section>
  )
}

/** Sem `settings:update`, a pessoa vê tudo e não altera nada. */
export function AvisoDeSomenteLeitura() {
  return (
    <p role="note" className="text-caption rounded-control bg-surface p-3 text-content-muted">
      Você pode ver as configurações, mas só quem administra o estabelecimento as altera.
    </p>
  )
}

/** O que a pessoa precisa saber antes de salvar: uma escolha que tira o cardápio do ar. */
export function AvisoDeAtencao({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="text-caption rounded-control bg-accent-50 p-3 text-accent-800">
      {children}
    </p>
  )
}

interface MarcavelProps extends ComponentProps<'input'> {
  type: 'checkbox' | 'radio'
  titulo: string
  descricao?: string
}

/**
 * Uma caixa de marcar ou uma opção de escolha, com título e explicação. A linha
 * inteira é clicável; o nome que o leitor de tela anuncia é só o título, e a
 * explicação vem como descrição.
 */
export function Marcavel({ titulo, descricao, ...props }: MarcavelProps) {
  const idDaDescricao = useId()
  return (
    <label className="flex items-start gap-3">
      <input
        aria-label={titulo}
        aria-describedby={descricao ? idDaDescricao : undefined}
        className="mt-1 size-5 shrink-0"
        {...props}
      />
      <span>
        <span className="text-body block font-semibold text-content">{titulo}</span>
        {descricao && (
          <span id={idDaDescricao} className="text-caption block text-content-muted">
            {descricao}
          </span>
        )}
      </span>
    </label>
  )
}

interface RodapeDeSalvarProps {
  /** O estado do envio: é o que `useMutation` devolve. */
  envio: { isPending: boolean; isError: boolean; isSuccess: boolean; error: unknown }
  /** Há alteração a salvar. Sem ela, o botão fica desligado. */
  alterado: boolean
  /** O que dizer quando grava: "Horários salvos." */
  sucesso: string
}

/** O "Salvar" de uma aba, com o resultado do último envio acima dele. */
export function RodapeDeSalvar({ envio, alterado, sucesso }: RodapeDeSalvarProps) {
  return (
    <div className="flex flex-col gap-2">
      {envio.isError && (
        <p role="alert" className="text-caption text-danger">
          {envio.error instanceof ApiError && envio.error.status === 400
            ? 'Confira os campos marcados e tente de novo.'
            : 'Não foi possível salvar agora. Tente de novo.'}
        </p>
      )}
      {envio.isSuccess && !alterado && (
        <p role="status" className="text-caption font-semibold text-success">
          {sucesso}
        </p>
      )}
      <button
        type="submit"
        disabled={envio.isPending || !alterado}
        className="text-body rounded-control bg-primary px-4 py-3 font-semibold text-primary-content hover:bg-primary-hover disabled:opacity-50"
      >
        {envio.isPending ? 'Salvando…' : 'Salvar alterações'}
      </button>
    </div>
  )
}

interface CarregadoProps<T> {
  consulta: UseQueryResult<T>
  /** O que está sendo carregado, com o artigo: "os horários". */
  oQue: string
  children: (dados: T) => ReactNode
}

/** A espera e a falha da leitura de uma aba; com os dados, mostra o formulário. */
export function Carregado<T>({ consulta, oQue, children }: CarregadoProps<T>) {
  if (consulta.isPending) {
    return <p className="text-body text-content-muted">Carregando {oQue}…</p>
  }
  if (consulta.isError) {
    return (
      <p role="alert" className="text-body text-content-muted">
        Não foi possível carregar {oQue}. Recarregue a página para tentar de novo.
      </p>
    )
  }
  return children(consulta.data)
}

/** Botão discreto, de texto: adicionar, remover, repetir. */
export const botaoDeTexto =
  'text-caption rounded-control px-2 py-1.5 font-semibold text-primary hover:bg-primary/10 disabled:opacity-50'
