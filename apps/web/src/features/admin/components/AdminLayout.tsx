import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet, useParams } from 'react-router'

import { chaveDosPedidos } from '../api'
import { usePedidosAoVivo, type EstadoDaConexao } from '../live'
import type { ContextoDoPainel } from '../panel'
import { chaveDoPlano } from '../plan'
import { sair, useSessaoStore } from '../session'
import { criarAlerta, type Alerta } from '../sound'
import { chaveDoResumo, useResumoDosPedidos } from '../summary'
import { AdminNav } from './AdminNav'
import { IconeMenu } from './icons'

const INDICADOR: Record<EstadoDaConexao, { texto: string; classe: string }> = {
  conectando: { texto: 'Conectando…', classe: 'bg-neutral-100 text-neutral-700' },
  'ao-vivo': { texto: 'Ao vivo', classe: 'bg-brand-100 text-brand-800' },
  reconectando: { texto: 'Reconectando…', classe: 'bg-accent-100 text-accent-800' },
  'sem-permissao': { texto: 'Sem atualização ao vivo', classe: 'bg-neutral-100 text-neutral-700' },
}

const ID_DO_MENU = 'menu-do-painel'
const SEM_PERMISSOES: readonly string[] = []

/**
 * A moldura do painel, em `/{tenantSlug}/admin`: o menu, a barra do topo e a
 * tela da vez (`Outlet`).
 *
 * O que vale para o painel inteiro mora aqui, e não em cada tela:
 * - a conferência da sessão — sem ela, volta ao login;
 * - a conexão ao vivo, uma só, que manda reler a lista, o resumo e o plano;
 * - o alerta sonoro: pedido novo toca em qualquer tela, não só na de pedidos.
 *
 * Mobile-first: o menu é uma gaveta aberta pelo botão "Menu"; a partir de `lg`
 * fica fixo à esquerda e o botão some.
 */
export function AdminLayout() {
  const { tenantSlug = '' } = useParams()
  const sessao = useSessaoStore()
  const usuario = sessao.slug === tenantSlug ? sessao.usuario : null
  const logado = usuario !== null
  const permissoes = usuario?.permissions ?? SEM_PERMISSOES

  const queryClient = useQueryClient()
  const resumo = useResumoDosPedidos(tenantSlug, logado && permissoes.includes('orders:read'))
  const novos = resumo.data?.new ?? 0

  const alerta = useRef<Alerta | null>(null)
  const [somLigado, setSomLigado] = useState(false)

  const conexao = usePedidosAoVivo(logado, (aviso) => {
    void queryClient.invalidateQueries({ queryKey: chaveDosPedidos(tenantSlug) })
    void queryClient.invalidateQueries({ queryKey: chaveDoResumo(tenantSlug) })
    if (aviso.type === 'order.created') {
      // Cada pedido novo aproxima o limite do plano.
      void queryClient.invalidateQueries({ queryKey: chaveDoPlano(tenantSlug) })
      if (somLigado) alerta.current?.tocar()
    }
  })

  const [menuAberto, setMenuAberto] = useState(false)
  const botaoDoMenu = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuAberto) return
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return
      setMenuAberto(false)
      botaoDoMenu.current?.focus()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [menuAberto])

  // Sessão que não renova mais (refresh revogado ou vencido) volta ao login.
  if (!usuario) return <Navigate to="/entrar" replace />

  const estabelecimento = sessao.estabelecimento ?? tenantSlug
  const indicador = INDICADOR[conexao]
  const contexto: ContextoDoPainel = {
    slug: tenantSlug,
    estabelecimento,
    usuario,
    permissoes,
    conexao,
    novos,
  }

  return (
    <div className="min-h-dvh bg-surface-muted lg:flex">
      {menuAberto && (
        <button
          type="button"
          aria-label="Fechar o menu"
          // O Esc e os próprios itens já fecham pelo teclado.
          tabIndex={-1}
          onClick={() => {
            setMenuAberto(false)
          }}
          className="fixed inset-0 z-30 bg-neutral-950/50 lg:hidden"
        />
      )}

      <AdminNav
        id={ID_DO_MENU}
        slug={tenantSlug}
        estabelecimento={estabelecimento}
        nomeDoUsuario={usuario.name}
        permissoes={permissoes}
        novos={novos}
        aberto={menuAberto}
        aoNavegar={() => {
          setMenuAberto(false)
        }}
        aoSair={() => void sair()}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-surface px-page-x py-2">
          <button
            ref={botaoDoMenu}
            type="button"
            aria-expanded={menuAberto}
            aria-controls={ID_DO_MENU}
            aria-label={
              novos > 0
                ? `Menu, ${String(novos)} ${novos === 1 ? 'pedido novo' : 'pedidos novos'}`
                : undefined
            }
            onClick={() => {
              setMenuAberto((aberto) => !aberto)
            }}
            className="text-body flex items-center gap-2 rounded-control border border-border-strong px-3 py-1.5 font-semibold text-content lg:hidden"
          >
            <IconeMenu />
            Menu
            {novos > 0 && (
              <span
                aria-hidden="true"
                className="text-caption rounded-pill bg-accent-400 px-2 py-0.5 font-semibold text-neutral-950"
              >
                {novos}
              </span>
            )}
          </button>

          {/* O nome do estabelecimento fica no menu: aqui, em tela pequena, ele não cabe inteiro. */}
          <div className="flex-1" />

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
        </header>

        <main className="flex-1 px-page-x py-section-y">
          <Outlet context={contexto} />
        </main>
      </div>
    </div>
  )
}
