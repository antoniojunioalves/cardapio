import { recordAudit } from '../audit/record.js'
import { hashPassword, verifyPassword } from '../auth/password.js'
import {
  emitirSessao,
  type AuthenticatedUser,
  type Session,
  type UsuarioDaSessao,
} from '../auth/service.js'
import { AppError, UnauthorizedError } from '../lib/errors.js'
import { avisarPedido } from '../realtime/notify.js'
import { tenantContextFromAccount, type TenantContext } from '../tenant/context.js'
import { withTenant } from '../tenant/with-tenant.js'
import { encerrarSessoes } from '../users/repository.js'
import { withAccount } from './context.js'
import { renomearConta, senhaDaConta, trocarSenhaDaConta, vinculosDaConta } from './repository.js'

/**
 * "Minha conta": o que a pessoa muda nela mesma — o nome e a senha.
 *
 * A conta é uma só em todos os estabelecimentos em que a pessoa trabalha
 * (Fase 25d), e por isso a mudança vale em todos. Só a própria pessoa a faz:
 * ninguém do estabelecimento muda o nome nem a senha de outra pessoa, e o dono
 * não conhece a senha de ninguém.
 *
 * O registro fica na auditoria do estabelecimento em que a pessoa estava ao
 * mudar — e só nele: os outros não ficam sabendo que ela trabalha ali.
 */

/** O nome novo da conta. Devolve o usuário da sessão, já com ele. */
export async function renomearMinhaConta(
  context: TenantContext,
  usuario: AuthenticatedUser,
  nome: string,
): Promise<UsuarioDaSessao> {
  await withAccount(usuario.accountId, (tx) => renomearConta(tx, usuario.accountId, nome))

  await withTenant(context, async (tx) => {
    await recordAudit(tx, context, {
      action: 'account.renamed',
      entityType: 'account',
      entityId: usuario.accountId,
      actorUserId: usuario.id,
      metadata: { nome: { de: usuario.name, para: nome } },
    })
  })

  const { accountId: _conta, ...daSessao } = usuario
  return { ...daSessao, name: nome }
}

/**
 * Troca a senha da conta, conferindo a atual.
 *
 * Trocar a senha é o que se faz quando se desconfia de que alguém a sabe — e
 * por isso ela **encerra todas as sessões da conta**, em todos os
 * estabelecimentos e aparelhos, inclusive esta: o token de acesso emitido antes
 * deixa de valer na hora (`passwordChangedAt`), as sessões são apagadas e as
 * conexões ao vivo fecham. Este aparelho recebe uma sessão nova, no mesmo
 * estabelecimento, e a pessoa continua onde estava.
 *
 * Apagar, e não revogar, como ao desativar alguém (`encerrarSessoes`): um token
 * de antes que reapareça é uma sessão que nós encerramos, não um roubo.
 *
 * A senha nova já chega nas regras do cadastro (a rota confere). Igual à atual
 * é recusada: quem troca quer que a de antes pare de servir.
 */
export async function trocarMinhaSenha(
  context: TenantContext,
  usuario: AuthenticatedUser,
  dados: { senhaAtual: string; senhaNova: string },
): Promise<Session> {
  const hashAtual = await withAccount(usuario.accountId, (tx) =>
    senhaDaConta(tx, usuario.accountId),
  )
  if (!hashAtual) throw new UnauthorizedError('Sessão inválida.')

  // Fora de transação: o argon2 é lento de propósito.
  if (!(await verifyPassword(hashAtual, dados.senhaAtual))) {
    throw new AppError('A senha atual não confere.', 400, 'CURRENT_PASSWORD_INVALID')
  }
  if (await verifyPassword(hashAtual, dados.senhaNova)) {
    throw new AppError('A senha nova precisa ser diferente da atual.', 400, 'SAME_PASSWORD')
  }
  const hashNovo = await hashPassword(dados.senhaNova)

  const vinculos = await withAccount(usuario.accountId, async (tx) => {
    await trocarSenhaDaConta(tx, usuario.accountId, hashNovo)
    return vinculosDaConta(tx, usuario.accountId)
  })

  // Cada estabelecimento da conta, no contexto dele: as sessões são apagadas e
  // a conexão ao vivo da pessoa fecha — e, ao reabrir, o token de antes não
  // passa mais.
  for (const vinculo of vinculos) {
    await withTenant(tenantContextFromAccount(vinculo.tenantId), async (tx) => {
      await encerrarSessoes(tx, vinculo.userId)
      await avisarPedido(tx, {
        tipo: 'USUARIO_ALTERADO',
        tenantId: vinculo.tenantId,
        userId: vinculo.userId,
      })
    })
  }

  return withTenant(context, async (tx) => {
    await recordAudit(tx, context, {
      action: 'account.password_changed',
      entityType: 'account',
      entityId: usuario.accountId,
      actorUserId: usuario.id,
    })
    return emitirSessao(tx, context, usuario)
  })
}
