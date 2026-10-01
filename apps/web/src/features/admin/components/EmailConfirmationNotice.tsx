import {
  mensagemDoReenvio,
  useConfirmacaoDoCadastro,
  useReenviarConfirmacao,
} from '../confirmation'

interface EmailConfirmationNoticeProps {
  slug: string
  /** Reenviar exige `settings:update`. */
  podeReenviar: boolean
  /** O cadastro acabou de acontecer e o e-mail não saiu. */
  emailNaoEnviado: boolean
}

/**
 * "Seu cardápio ainda não está no ar": o aviso do painel enquanto o e-mail de
 * quem cadastrou o estabelecimento não é confirmado. Some sozinho depois.
 */
export function EmailConfirmationNotice({
  slug,
  podeReenviar,
  emailNaoEnviado,
}: EmailConfirmationNoticeProps) {
  const confirmacao = useConfirmacaoDoCadastro(slug, true)
  const reenvio = useReenviarConfirmacao(slug)

  if (confirmacao.data?.status !== 'PENDING') return null

  const email = confirmacao.data.email

  return (
    <section
      aria-labelledby="aviso-de-confirmacao"
      className="flex flex-col gap-2 rounded-card border border-accent-200 bg-accent-50 p-card"
    >
      <h2 id="aviso-de-confirmacao" className="text-body font-semibold text-accent-900">
        Seu cardápio ainda não está no ar
      </h2>
      <p className="text-caption text-accent-800">
        Para publicá-lo, clique no link que enviamos para{' '}
        <strong className="font-semibold">{email ?? 'o e-mail do cadastro'}</strong>. O link vale
        por 48 horas.
      </p>

      {emailNaoEnviado && !reenvio.isSuccess && (
        <p className="text-caption font-semibold text-accent-800">
          Não conseguimos enviar o e-mail no cadastro. Peça um novo no botão abaixo.
        </p>
      )}

      {podeReenviar && (
        <div className="flex flex-wrap items-center gap-stack">
          <button
            type="button"
            onClick={() => {
              reenvio.mutate()
            }}
            disabled={reenvio.isPending}
            className="text-caption rounded-control border border-accent-300 bg-surface px-3 py-1.5 font-semibold text-accent-900 disabled:opacity-50"
          >
            {reenvio.isPending ? 'Enviando…' : 'Reenviar e-mail'}
          </button>
          {reenvio.isSuccess && (
            <p role="status" className="text-caption text-accent-800">
              Enviamos um novo link para {reenvio.data.email}.
            </p>
          )}
          {reenvio.isError && (
            <p role="alert" className="text-caption text-danger">
              {mensagemDoReenvio(reenvio.error)}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
