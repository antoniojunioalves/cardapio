import { loadAuthenticatedUser } from '../auth/service.js'
import { verifyAccessToken } from '../auth/tokens.js'
import { tenantContextFromUser } from '../tenant/context.js'

/**
 * Autentica uma conexão do painel pelo token de acesso.
 *
 * Não usa o `requireAuth`, e é a única exceção: o WebSocket do navegador não
 * envia o cabeçalho `Authorization`. O token chega na **primeira mensagem**
 * da conexão — nunca na URL, que vai parar em log de acesso. A verificação é
 * a mesma do `requireAuth`: assinatura e validade do token, o usuário
 * recarregado do banco (desativado não entra) e a permissão.
 *
 * Códigos de fechamento, para o painel decidir o que fazer:
 * - `4001` — sessão inválida ou expirada: renove a sessão e reconecte;
 * - `4003` — sem permissão: não adianta tentar de novo.
 */

export const SESSAO_INVALIDA = 4001
export const SEM_PERMISSAO = 4003

export type ResultadoDaAutenticacao =
  | { ok: true; tenantId: string; userId: string; expiraEm: number }
  | { ok: false; codigo: typeof SESSAO_INVALIDA | typeof SEM_PERMISSAO; motivo: string }

export async function autenticarConexao(
  token: unknown,
  permissao: string,
): Promise<ResultadoDaAutenticacao> {
  const invalida = { ok: false, codigo: SESSAO_INVALIDA, motivo: 'sessão inválida' } as const
  if (typeof token !== 'string' || token.length === 0) return invalida

  const payload = verifyAccessToken(token)
  if (!payload) return invalida

  const usuario = await loadAuthenticatedUser(tenantContextFromUser(payload.tenantId), payload.sub)
  if (!usuario) return invalida
  if (!usuario.permissions.includes(permissao)) {
    return { ok: false, codigo: SEM_PERMISSAO, motivo: 'sem permissão' }
  }

  // `exp` vem em segundos, no padrão do JWT.
  const exp = (payload as { exp?: unknown }).exp
  const expiraEm = typeof exp === 'number' ? exp * 1000 : Date.now()
  return { ok: true, tenantId: payload.tenantId, userId: usuario.id, expiraEm }
}
