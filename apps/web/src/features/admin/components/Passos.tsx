import { falhaAoSalvar } from '../form-fields'
import { NOME_DO_PASSO, type Passo } from '../product-steps'
import { botaoPrincipal, botaoSecundario } from './form-parts'

interface PassosProps {
  passos: readonly Passo[]
  atual: Passo
  /** Os passos que podem ser abertos agora; os outros ficam desligados. */
  alcancaveis: readonly Passo[]
  /** Os que o cadastro já concluiu: ganham o "✓" no lugar do número. */
  feitos: readonly Passo[]
  aoIr: (passo: Passo) => void
}

/**
 * O cabeçalho do cadastro em passos: onde a pessoa está e aonde pode ir. No
 * celular os nomes não cabem lado a lado — ficam os números, e uma linha diz
 * "Passo 2 de 3 · Produto"; em tela maior, cada número vem com o nome.
 */
export function Passos({ passos, atual, alcancaveis, feitos, aoIr }: PassosProps) {
  const posicao = passos.indexOf(atual) + 1

  return (
    <nav aria-label="Passos" className="flex flex-col gap-2">
      <p className="text-caption text-content-muted sm:hidden">
        Passo {posicao} de {passos.length} ·{' '}
        <strong className="text-content">{NOME_DO_PASSO[atual]}</strong>
      </p>
      <ol className="flex items-center gap-2">
        {passos.map((passo, indice) => {
          const feito = feitos.includes(passo)
          const eOAtual = passo === atual
          return (
            <li key={passo} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none">
              <button
                type="button"
                aria-current={eOAtual ? 'step' : undefined}
                aria-label={`Passo ${String(indice + 1)}: ${NOME_DO_PASSO[passo]}${feito ? ', feito' : ''}`}
                disabled={!alcancaveis.includes(passo)}
                onClick={() => {
                  aoIr(passo)
                }}
                className="text-body flex shrink-0 items-center gap-2 rounded-control p-1 font-semibold text-content-muted hover:bg-surface-muted disabled:opacity-50 disabled:hover:bg-transparent aria-[current=step]:text-content"
              >
                <span
                  aria-hidden="true"
                  className={`text-caption flex size-7 items-center justify-center rounded-pill border font-semibold ${
                    eOAtual
                      ? 'border-primary bg-primary text-primary-content'
                      : feito
                        ? 'border-primary text-primary'
                        : 'border-border-strong'
                  }`}
                >
                  {feito && !eOAtual ? '✓' : indice + 1}
                </span>
                <span className="hidden sm:inline">{NOME_DO_PASSO[passo]}</span>
              </button>
              {indice < passos.length - 1 && (
                <span aria-hidden="true" className="h-px min-w-3 flex-1 bg-border-strong" />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

interface RodapeDoPassoProps {
  /** O estado do envio: é o que `useMutation` devolve. */
  envio: { isPending: boolean; isError: boolean; error: unknown }
  /** O último passo não tem para onde continuar: o botão é só "Salvar". */
  ultimo?: boolean
  /** Leva ao passo anterior. Sem ele — no primeiro passo —, não há "Voltar". */
  aoVoltar?: (() => void) | undefined
  /** Para uma recusa que o passo explica do seu jeito; sem resposta, vale a mensagem padrão. */
  explicarFalha?: ((erro: unknown) => string | null) | undefined
}

/**
 * Os botões de um passo, com a recusa do último envio acima deles. O
 * principal grava e leva adiante — "Salvar e continuar" —, e no último passo
 * é só "Salvar": grava e encerra. Fica sempre ligado: sem nada a gravar, só
 * segue. No celular ele vem primeiro e ocupa a largura; em tela maior os
 * botões ficam lado a lado, com o principal à direita.
 */
export function RodapeDoPasso({
  envio,
  ultimo = false,
  aoVoltar,
  explicarFalha,
}: RodapeDoPassoProps) {
  return (
    <div className="flex flex-col gap-2">
      {envio.isError && (
        <p role="alert" className="text-caption text-danger">
          {explicarFalha?.(envio.error) ?? falhaAoSalvar(envio.error)}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <button type="submit" disabled={envio.isPending} className={botaoPrincipal}>
          {envio.isPending ? 'Salvando…' : ultimo ? 'Salvar' : 'Salvar e continuar'}
        </button>
        {aoVoltar && (
          <button
            type="button"
            disabled={envio.isPending}
            onClick={aoVoltar}
            className={botaoSecundario}
          >
            Voltar
          </button>
        )}
      </div>
    </div>
  )
}
