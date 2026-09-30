import websocket from '@fastify/websocket'
import type { FastifyInstance } from 'fastify'

import { env } from '../config/env.js'
import { infraLogger } from '../lib/logger.js'
import { CanalDePedidos } from './channel.js'
import { autenticarConexao, SESSAO_INVALIDA } from './connection-auth.js'
import { ouvirPedidos, type Ouvinte } from './notify.js'

declare module 'fastify' {
  interface FastifyInstance {
    canalDePedidos: CanalDePedidos
  }
}

/** Tempo para a primeira mensagem, com o token, chegar. */
const PRAZO_DE_AUTENTICACAO_MS = 5000
/** Intervalo do ping que descobre conexão morta (celular que perdeu o sinal). */
const INTERVALO_DO_PING_MS = 30_000

/**
 * Pedidos em tempo real no painel: `GET /api/v1/admin/orders/stream`.
 *
 * O protocolo:
 * 1. o painel abre a conexão e envia `{ "type": "auth", "token": "…" }`;
 * 2. o servidor confere o token e a permissão `orders:read`, responde
 *    `{ "type": "ready" }` e passa a entregar os eventos **do tenant do
 *    token** — `order.created` e `order.status_changed`, só com ids;
 * 3. quando o token expira, fecha com `4001`; o painel renova a sessão e
 *    reconecta.
 */
export async function registerRealtime(instance: FastifyInstance): Promise<void> {
  await instance.register(websocket, { options: { maxPayload: 4096 } })

  const canal = new CanalDePedidos()
  instance.decorate('canalDePedidos', canal)

  let ouvinte: Ouvinte | null = null
  instance.addHook('onReady', async () => {
    ouvinte = ouvirPedidos(
      env.DATABASE_URL,
      (evento) => {
        canal.publicar(evento)
      },
      infraLogger,
    )
    await ouvinte.pronto
  })
  instance.addHook('onClose', async () => {
    await ouvinte?.parar()
  })

  instance.get(
    '/api/v1/admin/orders/stream',
    {
      websocket: true,
      schema: { hide: true },
      // O navegador não aplica CORS a WebSocket: qualquer página poderia abrir
      // a conexão. O token na primeira mensagem já impede que ela receba algo;
      // conferir a origem é a segunda barreira.
      preValidation: async (request, reply) => {
        const origem = request.headers.origin
        if (origem && origem !== env.WEB_ORIGIN) {
          await reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'Origem recusada.' } })
        }
      },
    },
    (socket) => {
      let cancelar: (() => void) | null = null
      let autenticando = false
      let viva = true
      let expira: NodeJS.Timeout | null = null

      const prazo = setTimeout(() => {
        socket.close(SESSAO_INVALIDA, 'autenticação não recebida')
      }, PRAZO_DE_AUTENTICACAO_MS)

      const ping = setInterval(() => {
        if (!viva) {
          socket.terminate()
          return
        }
        viva = false
        socket.ping()
      }, INTERVALO_DO_PING_MS)
      socket.on('pong', () => {
        viva = true
      })

      socket.on('message', (dado: Buffer) => {
        // Depois de autenticada, a conexão só recebe; o que o painel mandar é ignorado.
        if (cancelar || autenticando) return
        autenticando = true
        clearTimeout(prazo)

        let token: unknown = null
        try {
          const mensagem = JSON.parse(dado.toString()) as { type?: unknown; token?: unknown }
          if (mensagem.type === 'auth') token = mensagem.token
        } catch {
          /* mensagem que não é JSON: tratada como sem token */
        }

        void autenticarConexao(token, 'orders:read').then((resultado) => {
          if (socket.readyState !== socket.OPEN) return
          if (!resultado.ok) {
            socket.close(resultado.codigo, resultado.motivo)
            return
          }
          cancelar = canal.assinar(
            resultado.tenantId,
            resultado.userId,
            (evento) => {
              socket.send(JSON.stringify(evento))
            },
            // Desativado ou com o papel alterado: fecha já, e o painel se
            // autentica de novo com o que valer agora.
            () => {
              socket.close(SESSAO_INVALIDA, 'sessão alterada')
            },
          )
          expira = setTimeout(
            () => {
              socket.close(SESSAO_INVALIDA, 'sessão expirada')
            },
            Math.max(0, resultado.expiraEm - Date.now()),
          )
          socket.send(JSON.stringify({ type: 'ready' }))
        })
      })

      socket.on('close', () => {
        clearTimeout(prazo)
        clearInterval(ping)
        if (expira) clearTimeout(expira)
        cancelar?.()
      })
    },
  )
}
