import { recordAudit } from '../audit/record.js'
import { hashPassword } from '../auth/password.js'
import type { Ator } from '../auth/permissions.js'
import { UNICIDADE, violacaoDoBanco } from '../lib/db-errors.js'
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors.js'
import { cabeMaisUmUsuario, RECURSO_USUARIOS } from '../plans/limits.js'
import { travarLimiteDoPlano, usoDeUsuarios } from '../plans/service.js'
import { buscarPerfil, type Perfil } from '../profiles/repository.js'
import { exigirAlcance } from '../profiles/service.js'
import { avisarPedido } from '../realtime/notify.js'
import type { TenantContext } from '../tenant/context.js'
import { withTenant, type TenantTransaction } from '../tenant/with-tenant.js'
import {
  alterarNome,
  buscarUsuario,
  definirAtivo,
  definirPerfil,
  inserirUsuario,
  listarUsuarios as listarDoBanco,
  encerrarSessoes,
  type UsuarioDoPainel,
} from './repository.js'

/**
 * Gestão das pessoas do painel.
 *
 * Regras que não dependem de permissão, porque permissão não as cobre:
 * - o proprietário não é dado nem tirado pela API — é quem criou o
 *   estabelecimento; transferir a posse está no ROADMAP;
 * - só o proprietário mexe na conta do proprietário;
 * - ninguém muda o próprio perfil nem se desativa — perderia o acesso sem
 *   ninguém para devolver;
 * - ninguém dá a outra pessoa um perfil com permissões que ele mesmo não tem,
 *   nem mexe em quem tem um perfil assim: seria passar por cima do dono;
 * - criar e reativar respeitam o limite de usuários ativos do plano.
 */

const naoEncontrado = () => new NotFoundError('Usuário não encontrado.')

async function exigirUsuario(tx: TenantTransaction, id: string): Promise<UsuarioDoPainel> {
  const usuario = await buscarUsuario(tx, id)
  if (!usuario) throw naoEncontrado()
  return usuario
}

async function exigirPerfil(tx: TenantTransaction, id: string): Promise<Perfil> {
  const perfil = await buscarPerfil(tx, id)
  // Um perfil de outro estabelecimento é invisível aqui: para quem pede, não existe.
  if (!perfil) throw new NotFoundError('Perfil não encontrado.')
  return perfil
}

/**
 * Confere se o plano ainda tem vaga para mais um usuário ativo. Trava antes de
 * contar: sem isso, duas criações ao mesmo tempo contariam a mesma vaga e
 * passariam as duas (`travarLimiteDoPlano`).
 */
async function exigirVaga(tx: TenantTransaction, context: TenantContext): Promise<void> {
  await travarLimiteDoPlano(tx, context, RECURSO_USUARIOS)
  const uso = await usoDeUsuarios(tx)
  if (!cabeMaisUmUsuario(uso.ativos, uso.limite)) {
    throw new ConflictError(
      `O plano ${uso.plano?.nome ?? ''} permite ${String(uso.limite)} usuários ativos. ` +
        'Desative um usuário para abrir vaga, ou mude de plano.',
      'PLAN_USER_LIMIT',
    )
  }
}

/**
 * O ator pode mexer nesta pessoa? Na conta do proprietário, só ele mesmo; em
 * quem tem um perfil, só quem tem todas as permissões desse perfil.
 */
async function exigirAlcanceSobre(
  tx: TenantTransaction,
  ator: Ator,
  alvo: UsuarioDoPainel,
): Promise<void> {
  if (alvo.isOwner) {
    if (alvo.id !== ator.id) {
      throw new ForbiddenError('Só o proprietário altera a conta do proprietário.')
    }
    return
  }
  if (!alvo.perfil) return
  const perfil = await exigirPerfil(tx, alvo.perfil.id)
  exigirAlcance(ator, perfil.permissions, `O perfil de ${alvo.name}`)
}

export async function listarUsuarios(context: TenantContext): Promise<UsuarioDoPainel[]> {
  return withTenant(context, (tx) => listarDoBanco(tx))
}

export async function criarUsuario(
  context: TenantContext,
  ator: Ator,
  dados: { name: string; email: string; password: string; profileId: string },
): Promise<UsuarioDoPainel> {
  // Fora da transação: o argon2 é lento de propósito, e a transação não
  // precisa ficar aberta esperando por ele.
  const passwordHash = await hashPassword(dados.password)

  try {
    return await withTenant(context, async (tx) => {
      const perfil = await exigirPerfil(tx, dados.profileId)
      exigirAlcance(ator, perfil.permissions, 'Este perfil')
      await exigirVaga(tx, context)

      const id = await inserirUsuario(tx, {
        tenantId: context.tenantId,
        name: dados.name,
        // O login compara em minúsculas.
        email: dados.email.toLowerCase(),
        passwordHash,
        profileId: perfil.id,
      })

      await recordAudit(tx, context, {
        action: 'user.created',
        entityType: 'user',
        entityId: id,
        actorUserId: ator.id,
        metadata: { perfil: perfil.name },
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
  ator: Ator,
  id: string,
  dados: { name?: string | undefined; profileId?: string | undefined },
): Promise<UsuarioDoPainel> {
  return withTenant(context, async (tx) => {
    const alvo = await exigirUsuario(tx, id)
    await exigirAlcanceSobre(tx, ator, alvo)

    let perfilNovo: Perfil | undefined
    if (dados.profileId !== undefined && dados.profileId !== alvo.perfil?.id) {
      if (id === ator.id) {
        throw new ConflictError(
          'Você não pode mudar o seu próprio perfil.',
          'CANNOT_CHANGE_OWN_PROFILE',
        )
      }
      if (alvo.isOwner) {
        throw new ConflictError('O proprietário não tem perfil.', 'OWNER_HAS_NO_PROFILE')
      }
      perfilNovo = await exigirPerfil(tx, dados.profileId)
      exigirAlcance(ator, perfilNovo.permissions, 'Este perfil')
      await definirPerfil(tx, id, perfilNovo.id)
      // As permissões mudaram: a conexão ao vivo se autentica de novo.
      await avisarPedido(tx, { tipo: 'USUARIO_ALTERADO', tenantId: context.tenantId, userId: id })
    }
    if (dados.name !== undefined) await alterarNome(tx, id, dados.name)

    await recordAudit(tx, context, {
      action: 'user.updated',
      entityType: 'user',
      entityId: id,
      actorUserId: ator.id,
      metadata: {
        ...(dados.name !== undefined && { nome: { de: alvo.name, para: dados.name } }),
        ...(perfilNovo && { perfil: { de: alvo.perfil?.nome ?? null, para: perfilNovo.name } }),
      },
    })
    return exigirUsuario(tx, id)
  })
}

export async function desativarUsuario(
  context: TenantContext,
  ator: Ator,
  id: string,
): Promise<UsuarioDoPainel> {
  return withTenant(context, async (tx) => {
    const alvo = await exigirUsuario(tx, id)
    if (id === ator.id) {
      throw new ConflictError(
        'Você não pode desativar a sua própria conta.',
        'CANNOT_DEACTIVATE_SELF',
      )
    }
    if (alvo.isOwner) {
      throw new ConflictError(
        'O proprietário não pode ser desativado.',
        'OWNER_CANNOT_BE_DEACTIVATED',
      )
    }
    await exigirAlcanceSobre(tx, ator, alvo)
    if (!alvo.isActive) return alvo

    await definirAtivo(tx, id, false)
    await encerrarSessoes(tx, id)
    // Fecha a conexão ao vivo dele já, e não quando o token expirar.
    await avisarPedido(tx, { tipo: 'USUARIO_ALTERADO', tenantId: context.tenantId, userId: id })
    await recordAudit(tx, context, {
      action: 'user.deactivated',
      entityType: 'user',
      entityId: id,
      actorUserId: ator.id,
    })
    return exigirUsuario(tx, id)
  })
}

export async function reativarUsuario(
  context: TenantContext,
  ator: Ator,
  id: string,
): Promise<UsuarioDoPainel> {
  return withTenant(context, async (tx) => {
    const alvo = await exigirUsuario(tx, id)
    await exigirAlcanceSobre(tx, ator, alvo)
    if (alvo.isActive) return alvo

    await exigirVaga(tx, context)
    await definirAtivo(tx, id, true)
    await recordAudit(tx, context, {
      action: 'user.reactivated',
      entityType: 'user',
      entityId: id,
      actorUserId: ator.id,
    })
    return exigirUsuario(tx, id)
  })
}
