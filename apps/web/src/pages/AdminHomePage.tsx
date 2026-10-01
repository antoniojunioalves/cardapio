import { Link, useLocation } from 'react-router'

import { EmailConfirmationNotice } from '@/features/admin/components/EmailConfirmationNotice'
import { PlanNotice } from '@/features/admin/components/PlanNotice'
import { caminhoDoPainel } from '@/features/admin/menu'
import { usePainel, useTituloDoPainel } from '@/features/admin/panel'
import { avisoDoPlano, usePlano } from '@/features/admin/plan'
import { useResumoDosPedidos } from '@/features/admin/summary'
import type { ChegadaDoCadastro } from '@/features/signup/api'

interface NumeroDoResumo {
  rotulo: string
  valor: number | undefined
  /** Pedido esperando ser aceito pede atenção: o cartão ganha destaque. */
  destaque?: boolean
}

/**
 * O Início do painel, em `/{tenantSlug}/admin`: a primeira tela depois do
 * login. Os avisos do estabelecimento e o resumo dos pedidos de hoje.
 */
export function AdminHomePage() {
  const { slug, estabelecimento, usuario, permissoes } = usePainel()
  const chegada = useLocation().state as ChegadaDoCadastro | null
  const podeVerPedidos = permissoes.includes('orders:read')

  const resumo = useResumoDosPedidos(slug, podeVerPedidos)
  const plano = usePlano(slug, true).data

  useTituloDoPainel('Início')

  const numeros: NumeroDoResumo[] = [
    { rotulo: 'Novos', valor: resumo.data?.new, destaque: (resumo.data?.new ?? 0) > 0 },
    { rotulo: 'Em andamento', valor: resumo.data?.inProgress },
    { rotulo: 'Concluídos hoje', valor: resumo.data?.completedToday },
  ]

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-section-y">
      <div>
        <h1 className="text-heading text-content">Olá, {usuario.name.split(' ')[0]}</h1>
        <p className="text-body text-content-muted">{estabelecimento}</p>
      </div>

      {/* A confirmação do cadastro é assunto de quem configura o estabelecimento. */}
      {permissoes.includes('settings:read') && (
        <EmailConfirmationNotice
          slug={slug}
          podeReenviar={permissoes.includes('settings:update')}
          emailNaoEnviado={chegada?.emailNaoEnviado === true}
        />
      )}

      <PlanNotice aviso={avisoDoPlano(plano)} />

      {podeVerPedidos && (
        <section aria-labelledby="resumo-dos-pedidos" className="flex flex-col gap-stack">
          <div className="flex items-center justify-between gap-stack">
            <h2 id="resumo-dos-pedidos" className="text-body font-semibold text-content">
              Pedidos
            </h2>
            <Link
              to={caminhoDoPainel(slug, 'pedidos')}
              className="text-body font-semibold text-primary hover:underline"
            >
              Ver pedidos
            </Link>
          </div>

          {resumo.isError ? (
            <p role="alert" className="text-body text-content-muted">
              Não foi possível carregar o resumo. Ele aparece assim que a conexão voltar.
            </p>
          ) : (
            <dl className="grid grid-cols-1 gap-stack sm:grid-cols-3">
              {numeros.map((numero) => (
                <div
                  key={numero.rotulo}
                  className={`rounded-card bg-surface p-card shadow-card ${
                    numero.destaque ? 'ring-2 ring-accent-500' : ''
                  }`}
                >
                  <dt className="text-caption text-content-muted">{numero.rotulo}</dt>
                  <dd className="text-display text-content">{numero.valor ?? '–'}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}

      {plano?.plan && plano.orders.limit !== null && (
        <p className="text-caption text-content-muted">
          Pedidos neste mês: {plano.orders.used} de {plano.orders.limit}, no plano {plano.plan.name}
          .
        </p>
      )}
    </div>
  )
}
