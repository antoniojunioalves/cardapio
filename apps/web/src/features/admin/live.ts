import { useEffect, useRef, useState } from 'react'

import { API_URL } from '@/services/api'

import { renovarSessao, tokenDeAcesso } from './session'

/**
 * A conexão ao vivo com os pedidos do estabelecimento.
 *
 * Protocolo (`apps/api/src/realtime/plugin.ts`): abre, manda o token na
 * primeira mensagem, recebe `ready` e depois só avisos com ids. Os dados do
 * pedido vêm da API REST — o aviso diz só "o pedido X mudou".
 *
 * - Ao ficar pronta (e a cada reconexão), pede uma nova leitura da lista:
 *   avisos emitidos enquanto estava fora não voltam.
 * - Fechada com `4001` (sessão expirada), renova a sessão e reconecta na hora.
 * - Fechada com `4003` (sem permissão), desiste — tentar de novo não muda nada.
 * - Qualquer outra queda: reconecta com espera crescente, 1 s até 30 s.
 */

export type EstadoDaConexao = 'conectando' | 'ao-vivo' | 'reconectando' | 'sem-permissao'

export type AvisoDePedido =
  | { type: 'order.created'; orderId: string; number: number }
  | { type: 'order.status_changed'; orderId: string; number: number; status: string }
  /** A conexão (re)abriu: a lista pode estar desatualizada. */
  | { type: 'resync' }

const URL_DO_CANAL = `${API_URL.replace(/^http/, 'ws')}/api/v1/admin/orders/stream`

export function usePedidosAoVivo(
  ativo: boolean,
  aoAvisar: (aviso: AvisoDePedido) => void,
): EstadoDaConexao {
  const [estado, setEstado] = useState<EstadoDaConexao>('conectando')

  // A função muda a cada render de quem usa; a conexão não deve reabrir por isso.
  const avisar = useRef(aoAvisar)
  useEffect(() => {
    avisar.current = aoAvisar
  })

  useEffect(() => {
    if (!ativo) return

    let socket: WebSocket | null = null
    let encerrado = false
    let espera = 1000
    let agendado: ReturnType<typeof setTimeout> | null = null

    const agendar = (ms: number) => {
      if (encerrado) return
      agendado = setTimeout(() => void abrir(), ms)
    }

    const abrir = async () => {
      let token: string
      try {
        token = await tokenDeAcesso()
      } catch {
        // Sem sessão: a página volta para o login sozinha.
        return
      }
      if (encerrado) return

      const atual = new WebSocket(URL_DO_CANAL)
      socket = atual

      atual.addEventListener('open', () => {
        atual.send(JSON.stringify({ type: 'auth', token }))
      })

      atual.addEventListener('message', (evento: MessageEvent<string>) => {
        let mensagem: { type?: string }
        try {
          mensagem = JSON.parse(evento.data) as { type?: string }
        } catch {
          return
        }
        if (mensagem.type === 'ready') {
          espera = 1000
          setEstado('ao-vivo')
          avisar.current({ type: 'resync' })
        } else if (mensagem.type === 'order.created' || mensagem.type === 'order.status_changed') {
          avisar.current(mensagem as AvisoDePedido)
        }
      })

      atual.addEventListener('close', (evento: CloseEvent) => {
        if (encerrado || socket !== atual) return
        socket = null
        if (evento.code === 4003) {
          setEstado('sem-permissao')
          return
        }
        setEstado('reconectando')
        if (evento.code === 4001) {
          void renovarSessao().then(
            () => {
              agendar(0)
            },
            () => undefined,
          )
          return
        }
        agendar(espera)
        espera = Math.min(espera * 2, 30_000)
      })
    }

    void abrir()

    return () => {
      encerrado = true
      if (agendado) clearTimeout(agendado)
      socket?.close()
    }
  }, [ativo])

  return estado
}
