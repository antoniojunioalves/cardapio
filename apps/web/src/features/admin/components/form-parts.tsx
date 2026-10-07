import type { UseQueryResult } from '@tanstack/react-query'
import { useId, type ComponentProps, type ReactNode } from 'react'

import { ApiError } from '@/services/api'

/**
 * As peças que os formulários do painel têm em comum: o cartão de uma seção,
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

/** Sem a permissão de alterar, a pessoa vê tudo e não altera nada. */
export function AvisoDeSomenteLeitura({
  texto = 'Você pode ver as configurações, mas só quem administra o estabelecimento as altera.',
}: {
  texto?: string
}) {
  return (
    <p role="note" className="text-caption rounded-control bg-surface p-3 text-content-muted">
      {texto}
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
  /** O texto do botão. Sem ele, "Salvar alterações". */
  rotulo?: string
  /** Para uma recusa que a tela explica do seu jeito; sem resposta, vale a mensagem padrão. */
  explicarFalha?: (erro: unknown) => string | null
}

/** A mensagem padrão de um envio recusado. */
function falhaAoSalvar(erro: unknown): string {
  if (erro instanceof ApiError) {
    if (erro.status === 400) return 'Confira os campos marcados e tente de novo.'
    // 409: um conflito que só a API vê — nome repetido, limite do plano. A
    // mensagem dela já é escrita para quem usa o painel.
    if (erro.status === 409) return erro.message
  }
  return 'Não foi possível salvar agora. Tente de novo.'
}

/** O "Salvar" de uma aba, com o resultado do último envio acima dele. */
export function RodapeDeSalvar({
  envio,
  alterado,
  sucesso,
  rotulo = 'Salvar alterações',
  explicarFalha,
}: RodapeDeSalvarProps) {
  return (
    <div className="flex flex-col gap-2">
      {envio.isError && (
        <p role="alert" className="text-caption text-danger">
          {explicarFalha?.(envio.error) ?? falhaAoSalvar(envio.error)}
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
        {envio.isPending ? 'Salvando…' : rotulo}
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
const baseDoBotaoDeTexto =
  'text-caption rounded-control px-2 py-1.5 font-semibold disabled:opacity-50'

export const botaoDeTexto = `${baseDoBotaoDeTexto} text-primary hover:bg-primary/10`

/**
 * O mesmo, em vermelho: remover, tirar. Uma variante própria, e não
 * `botaoDeTexto` com `text-danger` por cima — quando duas classes de cor se
 * chocam, quem ganha é a ordem do CSS gerado, e não a do `className`.
 */
export const botaoDeTextoPerigo = `${baseDoBotaoDeTexto} text-danger hover:bg-danger/10`
