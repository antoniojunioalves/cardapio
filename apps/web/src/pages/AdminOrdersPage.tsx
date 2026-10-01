import type { StatusDoPedido } from '@repo/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useParams } from 'react-router'

import { chaveDosPedidos, useMudarStatus, usePedidosDoPainel } from '@/features/admin/api'
import { CancelOrderDialog } from '@/features/admin/components/CancelOrderDialog'
import { EmailConfirmationNotice } from '@/features/admin/components/EmailConfirmationNotice'
import { OrderCard } from '@/features/admin/components/OrderCard'
import { usePedidosAoVivo, type EstadoDaConexao } from '@/features/admin/live'
import { emAndamento } from '@/features/admin/orders'
import { avisoDoPlano, chaveDoPlano, usePlano } from '@/features/admin/plan'
import { sair, useSessaoStore } from '@/features/admin/session'
import { criarAlerta, type Alerta } from '@/features/admin/sound'
import type { PedidoDoPainel } from '@/features/admin/types'
import type { ChegadaDoCadastro } from '@/features/signup/api'
import { ApiError } from '@/services/api'

const INDICADOR: Record<EstadoDaConexao, { texto: string; classe: string }> = {
  conectando: { texto: 'Conectando…', classe: 'bg-neutral-100 text-neutral-700' },
  'ao-vivo': { texto: 'Ao vivo', classe: 'bg-brand-100 text-brand-800' },
  reconectando: { texto: 'Reconectando…', classe: 'bg-accent-100 text-accent-800' },
  'sem-permissao': { texto: 'Sem atualização ao vivo', classe: 'bg-neutral-100 text-neutral-700' },
}

/**
 * O painel de pedidos em `/{tenantSlug}/admin/pedidos`.
 *
 * Pedido novo aparece sem recarregar: a conexão ao vivo avisa, e a lista é
 * relida pela API. O título da aba mostra quantos pedidos esperam ser aceitos,
 * para quem está com outra aba aberta.
 */
export function AdminOrdersPage() {
  const { tenantSlug = '' } = useParams()
  const chegada = useLocation().state as ChegadaDoCadastro | null
  const sessao = useSessaoStore()
  const logado = sessao.slug === tenantSlug && sessao.usuario !== null

  const queryClient = useQueryClient()
  const consulta = usePedidosDoPainel(tenantSlug, logado)
  const aviso = avisoDoPlano(usePlano(tenantSlug, logado).data)
  const mudarStatus = useMudarStatus(tenantSlug)
  const [aba, setAba] = useState<'andamento' | 'encerrados'>('andamento')
  const [cancelando, setCancelando] = useState<PedidoDoPainel | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const alerta = useRef<Alerta | null>(null)
  const [somLigado, setSomLigado] = useState(false)

  const conexao = usePedidosAoVivo(logado, (aviso) => {
    void queryClient.invalidateQueries({ queryKey: chaveDosPedidos(tenantSlug) })
    if (aviso.type === 'order.created') {
      // Cada pedido novo aproxima o limite do plano.
      void queryClient.invalidateQueries({ queryKey: chaveDoPlano(tenantSlug) })
      if (somLigado) alerta.current?.tocar()
    }
  })

  const pedidos = consulta.data ?? []
  const novos = pedidos.filter((p) => p.status === 'RECEIVED').length

  useEffect(() => {
    document.title = novos > 0 ? `(${String(novos)}) Pedidos novos` : 'Pedidos'
  }, [novos])

  // Sessão que não renova mais (refresh revogado ou vencido) volta ao login.
  if (!logado) return <Navigate to="/entrar" replace />

  const permissoes = sessao.usuario?.permissions ?? []
  const podeAtualizar = permissoes.includes('orders:update')
  const visiveis = pedidos.filter((p) => (aba === 'andamento' ? emAndamento(p) : !emAndamento(p)))

  function mudar(pedido: PedidoDoPainel, status: StatusDoPedido, motivo?: string) {
    setErro(null)
    mudarStatus.mutate(
      { id: pedido.id, status, ...(motivo && { reason: motivo }) },
      {
        onSuccess: () => {
          setCancelando(null)
        },
        onError: (e) => {
          setErro(
            e instanceof ApiError
              ? e.message
              : 'Não foi possível atualizar o pedido. Tente de novo.',
          )
        },
      },
    )
  }

  const indicador = INDICADOR[conexao]

  return (
    <div className="min-h-dvh bg-surface-muted pb-section-y">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-stack px-page-x py-stack">
          <h1 className="text-heading flex-1 text-content">Pedidos</h1>
          <span
            role="status"
            className={`text-caption rounded-pill px-2 py-0.5 font-semibold ${indicador.classe}`}
          >
            {indicador.texto}
          </span>
          <button
            type="button"
            aria-pressed={somLigado}
            onClick={() => {
              // O toque é o gesto que o navegador exige para liberar o som.
              alerta.current ??= criarAlerta()
              const ligar = !somLigado
              if (ligar) alerta.current?.tocar()
              setSomLigado(ligar)
            }}
            className="text-caption rounded-control border border-border-strong px-3 py-1 font-semibold text-content"
          >
            {somLigado ? 'Som ligado' : 'Ligar som'}
          </button>
          <button
            type="button"
            onClick={() => void sair()}
            className="text-caption font-semibold text-content-muted hover:underline"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="mx-auto mt-section-y flex max-w-3xl flex-col gap-stack px-page-x">
        {/* A confirmação do cadastro é assunto de quem configura o estabelecimento. */}
        {permissoes.includes('settings:read') && (
          <EmailConfirmationNotice
            slug={tenantSlug}
            podeReenviar={permissoes.includes('settings:update')}
            emailNaoEnviado={chegada?.emailNaoEnviado === true}
          />
        )}

        <div role="tablist" aria-label="Pedidos" className="flex gap-2">
          {(
            [
              ['andamento', `Em andamento (${String(pedidos.filter(emAndamento).length)})`],
              ['encerrados', 'Encerrados'],
            ] as const
          ).map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={aba === valor}
              onClick={() => {
                setAba(valor)
              }}
              className={`text-body rounded-pill px-4 py-1.5 font-semibold ${
                aba === valor ? 'bg-primary text-primary-content' : 'bg-surface text-content'
              }`}
            >
              {texto}
            </button>
          ))}
        </div>

        {aviso && (
          <p
            role="note"
            className={`text-caption rounded-control p-3 ${
              aviso.nivel === 'alerta'
                ? 'bg-accent-100 font-semibold text-accent-800'
                : 'bg-brand-50 text-brand-800'
            }`}
          >
            {aviso.texto}
          </p>
        )}
        {conexao === 'sem-permissao' && (
          <p className="text-caption text-content-muted">
            Sua conta não recebe pedidos ao vivo; a lista é atualizada a cada minuto.
          </p>
        )}
        {erro && (
          <p role="alert" className="text-caption rounded-control bg-accent-50 p-3 text-accent-800">
            {erro}
          </p>
        )}

        {consulta.isPending ? (
          <p role="status" className="text-body text-content-muted">
            Carregando os pedidos…
          </p>
        ) : consulta.isError ? (
          <p role="alert" className="text-body text-content-muted">
            Não foi possível carregar os pedidos. Eles aparecem assim que a conexão voltar.
          </p>
        ) : visiveis.length === 0 ? (
          <p className="text-body py-section-y text-center text-content-muted">
            {aba === 'andamento' ? 'Nenhum pedido em andamento.' : 'Nenhum pedido encerrado ainda.'}
          </p>
        ) : (
          visiveis.map((pedido) => (
            <OrderCard
              key={pedido.id}
              pedido={pedido}
              podeAtualizar={podeAtualizar}
              atualizando={mudarStatus.isPending}
              aoMudarStatus={(status) => {
                mudar(pedido, status)
              }}
              aoCancelar={() => {
                setCancelando(pedido)
              }}
            />
          ))
        )}
      </main>

      {cancelando && (
        <CancelOrderDialog
          numero={cancelando.number}
          enviando={mudarStatus.isPending}
          aoConfirmar={(motivo) => {
            mudar(cancelando, 'CANCELLED', motivo)
          }}
          aoFechar={() => {
            setCancelando(null)
          }}
        />
      )}
    </div>
  )
}
