import { app as product } from '@repo/config'
import type { FastifyInstance } from 'fastify'

import { env } from '../config/env.js'

/**
 * Sondas de saúde. Ficam fora do prefixo versionado (`/api/v1`) de propósito:
 * orquestradores e balanceadores esperam encontrá-las na raiz, e elas não
 * fazem parte do contrato público da API.
 *
 * - `/health`  → o processo está de pé e respondendo (liveness).
 * - `/ready`   → o processo consegue atender tráfego (readiness).
 */
export function healthRoutes(instance: FastifyInstance): void {
  instance.get('/health', () => ({
    status: 'ok' as const,
    name: product.name,
    environment: env.NODE_ENV,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  }))

  instance.get('/ready', () => ({
    status: 'ready' as const,
    // Ainda vazio: não há dependência externa nesta fase. A verificação do
    // PostgreSQL entra aqui na Fase 2, junto com o Drizzle.
    checks: {},
    timestamp: new Date().toISOString(),
  }))
}
