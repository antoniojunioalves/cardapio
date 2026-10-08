import type { StatusDoPedido } from '@repo/shared'
import { useState } from 'react'

import { useMudarStatus, usePedidosDoPainel } from '@/features/admin/api'
import { CancelOrderDialog } from '@/features/admin/components/CancelOrderDialog'
import { OrderCard } from '@/features/admin/components/OrderCard'
import { PlanNotice } from '@/features/admin/components/PlanNotice'
import { emAndamento } from '@/features/admin/orders'
import { usePainel, useTituloDoPainel } from '@/features/admin/panel'
import { avisoDoPlano, usePlano } from '@/features/admin/plan'
import type { PedidoDoPainel } from '@/features/admin/types'
import { ApiError } from '@/services/api'

/**
 * A tela de pedidos, em `/{tenantSlug}/admin/pedidos`.
 *
 * Pedido novo aparece sem recarregar: a conexão ao vivo — que é da moldura do
 * painel — avisa, e a lista é relida pela API.
 */
export function AdminOrdersPage() {
  const { slug, permissoes, conexao } = usePainel()

  const consulta = usePedidosDoPainel(slug, true)
  const aviso = avisoDoPlano(usePlano(slug, true).data)
  const mudarStatus = useMudarStatus(slug)
  const [aba, setAba] = useState<'andamento' | 'encerrados'>('andamento')
  const [cancelando, setCancelando] = useState<PedidoDoPainel | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useTituloDoPainel('Pedidos')

  const pedidos = consulta.data ?? []
  // Mudar o status e cancelar são permissões separadas: uma não inclui a outra.
  const podeAtualizar = permissoes.includes('orders:update')
  const permiteCancelar = permissoes.includes('orders:cancel')
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-stack">
      <h1 className="text-heading text-content">Pedidos</h1>

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

      <PlanNotice aviso={aviso} />
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
            permiteCancelar={permiteCancelar}
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
