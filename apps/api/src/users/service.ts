import { recordAudit } from '../audit/record.js'
import { hashPassword } from '../auth/password.js'
import { UNICIDADE, violacaoDoBanco } from '../lib/db-errors.js'
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../lib/errors.js'
import { cabeMaisUmUsuario } from '../plans/limits.js'
import { usoDeUsuarios } from '../plans/service.js'
import { avisarPedido } from '../realtime/notify.js'
import type { TenantContext } from '../tenant/context.js'
import { withTenant, type TenantTransaction } from '../tenant/with-tenant.js'
import {
  alterarNome,
  buscarPapel,
  buscarUsuario,
  definirAtivo,
  definirPapel,
  inserirUsuario,
  listarUsuarios as listarDoBanco,
  encerrarSessoes,
  type UsuarioComPapel,
} from './repository.js'

/**
 * Gestão dos usuários do painel.
 *
 * Regras que não dependem de permissão, porque permissão não as cobre:
 * - o papel `OWNER` não é dado nem tirado pela API — o dono é quem criou o
 *   estabelecimento; transferir a posse está no ROADMAP;
 * - ninguém muda o próprio papel nem se desativa — perderia o acesso sem
 *   ninguém para devolver;
 * - só o dono mexe na conta do dono;
 * - criar e reativar respeitam o limite de usuários ativos do plano.
 */

export type PapelAtribuivel = 'ADMIN' | 'STAFF'

const naoEncontrado = () => new NotFoundError('Usuário não encontrado.')

async function exigirUsuario(tx: TenantTransaction, id: string): Promise<UsuarioComPapel> {
  const usuario = await buscarUsuario(tx, id)
  if (!usuario) throw naoEncontrado()
  return usuario
}

async function exigirVaga(tx: TenantTransaction): Promise<void> {
  const uso = await usoDeUsuarios(tx)
  if (!cabeMaisUmUsuario(uso.ativos, uso.limite)) {
    throw new ConflictError(
      `O plano ${uso.plano?.nome ?? ''} permite ${String(uso.limite)} usuários ativos. ` +
        'Desative um usuário para abrir vaga, ou mude de plano.',
      'PLAN_USER_LIMIT',
    )
  }
}

/** Quem não é dono não mexe na conta do dono. */
async function protegerDono(
  tx: TenantTransaction,
  ator: string,
  alvo: UsuarioComPapel,
): Promise<void> {
  if (alvo.papel?.codigo !== 'OWNER') return
  const quemFaz = await buscarUsuario(tx, ator)
  if (quemFaz?.papel?.codigo !== 'OWNER') {
    throw new ForbiddenError('Só o proprietário altera a conta do proprietário.')
  }
}

export async function listarUsuarios(context: TenantContext): Promise<UsuarioComPapel[]> {
  return withTenant(context, (tx) => listarDoBanco(tx))
}

export async function criarUsuario(
  context: TenantContext,
  ator: string,
  dados: { name: string; email: string; password: string; role: PapelAtribuivel },
): Promise<UsuarioComPapel> {
  // Fora da transação: o argon2 é lento de propósito, e a transação não
  // precisa ficar aberta esperando por ele.
  const passwordHash = await hashPassword(dados.password)

  try {
    return await withTenant(context, async (tx) => {
      await exigirVaga(tx)
      const papel = await buscarPapel(tx, dados.role)
      if (!papel) throw new AppError('Papel desconhecido.', 400, 'UNKNOWN_ROLE')

      const id = await inserirUsuario(tx, {
        tenantId: context.tenantId,
        name: dados.name,
        // O login compara em minúsculas.
        email: dados.email.toLowerCase(),
        passwordHash,
      })
      await definirPapel(tx, context.tenantId, id, papel.id)

      await recordAudit(tx, context, {
        action: 'user.created',
        entityType: 'user',
        entityId: id,
        actorUserId: ator,
        metadata: { role: dados.role },
      })
      return exigirUsuario(tx, id)
    })
  } catch (erro) {
    const violacao = violacaoDoBanco(erro)
    // O e-mail é o login, único na plataforma: pode estar em uso neste
    // estabelecimento ou em outro, e a mensagem não diz em qual.
    if (violacao?.code === UNICIDADE && violacao.constraint === 'users_email') {
      throw new ConflictError('Este e-mail já está em uso.', 'USER_EMAIL_TAKEN')
    }
    throw erro
  }
}

export async function alterarUsuario(
  context: TenantContext,
  ator: string,
  id: string,
  dados: { name?: string | undefined; role?: PapelAtribuivel | undefined },
): Promise<UsuarioComPapel> {
  return withTenant(context, async (tx) => {
    const alvo = await exigirUsuario(tx, id)
    await protegerDono(tx, ator, alvo)

    if (dados.role !== undefined && dados.role !== alvo.papel?.codigo) {
      if (id === ator) {
        throw new ConflictError(
          'Você não pode mudar o seu próprio papel.',
          'CANNOT_CHANGE_OWN_ROLE',
        )
      }
      if (alvo.papel?.codigo === 'OWNER') {
        throw new ConflictError('O papel do proprietário não muda.', 'OWNER_ROLE_FIXED')
      }
      const papel = await buscarPapel(tx, dados.role)
      if (!papel) throw new AppError('Papel desconhecido.', 400, 'UNKNOWN_ROLE')
      await definirPapel(tx, context.tenantId, id, papel.id)
      // As permissões mudaram: a conexão ao vivo se autentica de novo.
      await avisarPedido(tx, { tipo: 'USUARIO_ALTERADO', tenantId: context.tenantId, userId: id })
    }
    if (dados.name !== undefined) await alterarNome(tx, id, dados.name)

    await recordAudit(tx, context, {
      action: 'user.updated',
      entityType: 'user',
      entityId: id,
      actorUserId: ator,
      metadata: {
        ...(dados.name !== undefined && { nome: { de: alvo.name, para: dados.name } }),
        ...(dados.role !== undefined && { papel: { de: alvo.papel?.codigo, para: dados.role } }),
      },
    })
    return exigirUsuario(tx, id)
  })
}

export async function desativarUsuario(
  context: TenantContext,
  ator: string,
  id: string,
): Promise<UsuarioComPapel> {
  return withTenant(context, async (tx) => {
    const alvo = await exigirUsuario(tx, id)
    if (id === ator) {
      throw new ConflictError(
        'Você não pode desativar a sua própria conta.',
        'CANNOT_DEACTIVATE_SELF',
      )
    }
    if (alvo.papel?.codigo === 'OWNER') {
      throw new ConflictError(
        'O proprietário não pode ser desativado.',
        'OWNER_CANNOT_BE_DEACTIVATED',
      )
    }
    if (!alvo.isActive) return alvo

    await definirAtivo(tx, id, false)
    await encerrarSessoes(tx, id)
    // Fecha a conexão ao vivo dele já, e não quando o token expirar.
    await avisarPedido(tx, { tipo: 'USUARIO_ALTERADO', tenantId: context.tenantId, userId: id })
    await recordAudit(tx, context, {
      action: 'user.deactivated',
      entityType: 'user',
      entityId: id,
      actorUserId: ator,
    })
    return exigirUsuario(tx, id)
  })
}

export async function reativarUsuario(
  context: TenantContext,
  ator: string,
  id: string,
): Promise<UsuarioComPapel> {
  return withTenant(context, async (tx) => {
    const alvo = await exigirUsuario(tx, id)
    if (alvo.isActive) return alvo

    await exigirVaga(tx)
    await definirAtivo(tx, id, true)
    await recordAudit(tx, context, {
      action: 'user.reactivated',
      entityType: 'user',
      entityId: id,
      actorUserId: ator,
    })
    return exigirUsuario(tx, id)
  })
}
