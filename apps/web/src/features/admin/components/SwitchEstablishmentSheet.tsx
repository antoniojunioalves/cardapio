import { useMutation, useQueryClient } from '@tanstack/react-query'

import { Sheet } from '@/components/Sheet'
import { ApiError } from '@/services/api'

import { chaveDosEstabelecimentos, type EstabelecimentoDaConta } from '../establishments'
import { trocarDeEstabelecimento } from '../session'

interface SwitchEstablishmentSheetProps {
  estabelecimentos: readonly EstabelecimentoDaConta[]
  aoFechar: () => void
}

/**
 * A troca de estabelecimento, aberta pelo menu do painel: os estabelecimentos
 * em que a conta entra, com o atual marcado. Trocar não pede a senha — a
 * sessão de agora prova quem é.
 *
 * A janela só troca a sessão: o painel a segue até o endereço do outro
 * estabelecimento (`AdminLayout`), e a conexão ao vivo reabre com o token dele.
 * O que as telas guardam vai pelo endereço de cada estabelecimento, e não se
 * mistura; só a lista desta janela, que é da conta, é lida de novo.
 */
export function SwitchEstablishmentSheet({
  estabelecimentos,
  aoFechar,
}: SwitchEstablishmentSheetProps) {
  const queryClient = useQueryClient()
  const trocar = useMutation({
    mutationFn: trocarDeEstabelecimento,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chaveDosEstabelecimentos })
      aoFechar()
    },
  })

  return (
    <Sheet titulo="Trocar de estabelecimento" aoFechar={aoFechar}>
      <p className="text-body text-content-muted">
        Você faz parte da equipe destes estabelecimentos. A troca vale para este navegador.
      </p>
      <ul className="mt-stack flex flex-col gap-2">
        {estabelecimentos.map((estabelecimento) => (
          <li key={estabelecimento.slug}>
            {estabelecimento.current ? (
              <div
                aria-current="true"
                className="rounded-control border-2 border-primary px-4 py-3"
              >
                <p className="text-body font-semibold break-words text-content">
                  {estabelecimento.name}
                </p>
                <p className="text-caption text-content-muted">Você está aqui</p>
              </div>
            ) : (
              <button
                type="button"
                disabled={trocar.isPending}
                onClick={() => {
                  trocar.mutate(estabelecimento.slug)
                }}
                className="w-full rounded-control border border-border-strong px-4 py-3 text-left hover:bg-neutral-50 disabled:opacity-50"
              >
                <span className="text-body block font-semibold break-words text-content">
                  {estabelecimento.name}
                </span>
                <span className="text-caption block break-all text-content-muted">
                  /{estabelecimento.slug}
                  {estabelecimento.status === 'PENDING' && ' · aguardando a confirmação do e-mail'}
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>
      {trocar.isPending && (
        <p role="status" className="text-caption mt-stack text-content-muted">
          Trocando…
        </p>
      )}
      {trocar.isError && (
        <p role="alert" className="text-caption mt-stack text-danger">
          {trocar.error instanceof ApiError && trocar.error.status === 403
            ? trocar.error.message
            : 'Não foi possível trocar agora. Tente de novo.'}
        </p>
      )}
    </Sheet>
  )
}
