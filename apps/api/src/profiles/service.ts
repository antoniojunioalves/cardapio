import {
  completarPermissoes,
  nomeDaPermissao,
  permissaoExiste,
  permissoesQueFaltam,
} from '@repo/shared'

import { recordAudit } from '../audit/record.js'
import type { Ator } from '../auth/permissions.js'
import { UNICIDADE, violacaoDoBanco } from '../lib/db-errors.js'
import { AppError, ConflictError, NotFoundError } from '../lib/errors.js'
import { avisarPedido } from '../realtime/notify.js'
import type { TenantContext } from '../tenant/context.js'
import { withTenant, type TenantTransaction } from '../tenant/with-tenant.js'
import {
  alterarPerfil as alterarNoBanco,
  buscarPerfil,
  contarPerfis,
  definirPermissoes,
  excluirPerfil as excluirDoBanco,
  inserirPerfil,
  listarPerfis as listarDoBanco,
  perfilDoUsuario,
  usuariosDoPerfil,
  type Perfil,
} from './repository.js'

/**
 * Os perfis do estabelecimento: quem os cria, altera e exclui.
 *
 * Regras que a permissão `profiles:manage` sozinha não cobre:
 * - ninguém põe num perfil uma permissão que não tem — senão criar um perfil
 *   seria o jeito de dar a si mesmo, ou a um amigo, o que o dono não deu;
 * - ninguém mexe num perfil que tem mais do que ele: tirar permissões de quem
 *   está acima também é passar por cima do dono;
 * - ninguém altera o perfil que tem — tirar de si a permissão de alterar
 *   perfis deixaria a pessoa trancada, e ninguém faz isso de propósito;
 * - perfil com alguém dentro não se exclui.
 *
 * O proprietário tem todas as permissões e não tem perfil: nenhuma dessas
 * regras o segura.
 */

export interface DadosDoPerfil {
  name: string
  description?: string | null | undefined
  permissions: readonly string[]
}

/** Um teto contra abuso, e não regra de negócio: ninguém precisa de mais. */
const MAXIMO_DE_PERFIS = 50

const naoEncontrado = () => new NotFoundError('Perfil não encontrado.')

const nomes = (codigos: readonly string[]) =>
  codigos.map((codigo) => nomeDaPermissao(codigo) ?? codigo).join(', ')

/**
 * O ator alcança estas permissões? Quem não tem todas não as dá, não as tira
 * e não as atribui.
 */
export function exigirAlcance(ator: Ator, permissoes: readonly string[], oQue: string): void {
  const faltam = permissoesQueFaltam(permissoes, ator.permissions)
  if (faltam.length === 0) return
  throw new AppError(
    `${oQue} tem permissões que você não tem: ${nomes(faltam)}.`,
    403,
    'PROFILE_OUT_OF_REACH',
    { missing: faltam },
  )
}

async function exigirPerfil(tx: TenantTransaction, id: string): Promise<Perfil> {
  const perfil = await buscarPerfil(tx, id)
  if (!perfil) throw naoEncontrado()
  return perfil
}

/** As permissões pedidas, conferidas e completas — ou a recusa de um código que não existe. */
function conferirPermissoes(pedidas: readonly string[]): string[] {
  const desconhecidas = pedidas.filter((codigo) => !permissaoExiste(codigo))
  if (desconhecidas.length > 0) {
    throw new AppError(
      `Permissão desconhecida: ${desconhecidas.join(', ')}.`,
      400,
      'UNKNOWN_PERMISSION',
    )
  }
  return completarPermissoes(pedidas)
}

function nomeRepetido(erro: unknown): never {
  const violacao = violacaoDoBanco(erro)
  if (violacao?.code === UNICIDADE && violacao.constraint === 'profiles_nome_unico') {
    throw new ConflictError('Já existe um perfil com esse nome.', 'PROFILE_NAME_TAKEN')
  }
  throw erro
}

export async function listarPerfis(context: TenantContext): Promise<Perfil[]> {
  return withTenant(context, (tx) => listarDoBanco(tx))
}

export async function criarPerfil(
  context: TenantContext,
  ator: Ator,
  dados: DadosDoPerfil,
): Promise<Perfil> {
  const permissoes = conferirPermissoes(dados.permissions)
  exigirAlcance(ator, permissoes, 'O perfil')

  try {
    return await withTenant(context, async (tx) => {
      if ((await contarPerfis(tx)) >= MAXIMO_DE_PERFIS) {
        throw new ConflictError(
          `O estabelecimento já tem ${String(MAXIMO_DE_PERFIS)} perfis. Exclua um para criar outro.`,
          'PROFILE_LIMIT',
        )
      }
      const id = await inserirPerfil(tx, {
        tenantId: context.tenantId,
        name: dados.name,
        description: dados.description ?? null,
      })
      await definirPermissoes(tx, context.tenantId, id, permissoes)

      await recordAudit(tx, context, {
        action: 'profile.created',
        entityType: 'profile',
        entityId: id,
        actorUserId: ator.id,
        metadata: { name: dados.name, permissions: permissoes },
      })
      return exigirPerfil(tx, id)
    })
  } catch (erro) {
    return nomeRepetido(erro)
  }
}

export async function alterarPerfil(
  context: TenantContext,
  ator: Ator,
  id: string,
  dados: DadosDoPerfil,
): Promise<Perfil> {
  const permissoes = conferirPermissoes(dados.permissions)

  try {
    return await withTenant(context, async (tx) => {
      const anterior = await exigirPerfil(tx, id)
      if ((await perfilDoUsuario(tx, ator.id)) === id) {
        throw new ConflictError(
          'Você não pode alterar o perfil que você mesmo tem.',
          'CANNOT_CHANGE_OWN_PROFILE',
        )
      }
      // O que o perfil tem e o que passaria a ter: os dois dentro do alcance de quem altera.
      exigirAlcance(ator, anterior.permissions, 'Este perfil')
      exigirAlcance(ator, permissoes, 'O perfil')

      await alterarNoBanco(tx, id, { name: dados.name, description: dados.description ?? null })
      await definirPermissoes(tx, context.tenantId, id, permissoes)

      // As permissões de quem tem o perfil mudaram: a conexão ao vivo de cada um se autentica de novo.
      if (anterior.permissions.join() !== permissoes.join()) {
        for (const userId of await usuariosDoPerfil(tx, id)) {
          await avisarPedido(tx, { tipo: 'USUARIO_ALTERADO', tenantId: context.tenantId, userId })
        }
      }

      await recordAudit(tx, context, {
        action: 'profile.updated',
        entityType: 'profile',
        entityId: id,
        actorUserId: ator.id,
        metadata: {
          ...(anterior.name !== dados.name && { nome: { de: anterior.name, para: dados.name } }),
          permissoes: {
            dadas: permissoes.filter((codigo) => !anterior.permissions.includes(codigo)),
            tiradas: anterior.permissions.filter((codigo) => !permissoes.includes(codigo)),
          },
        },
      })
      return exigirPerfil(tx, id)
    })
  } catch (erro) {
    return nomeRepetido(erro)
  }
}

export async function excluirPerfil(context: TenantContext, ator: Ator, id: string): Promise<void> {
  await withTenant(context, async (tx) => {
    const perfil = await exigirPerfil(tx, id)
    if (perfil.users > 0) {
      throw new ConflictError(
        perfil.users === 1
          ? 'Uma pessoa tem este perfil. Dê outro perfil a ela antes de excluí-lo.'
          : `${String(perfil.users)} pessoas têm este perfil. Dê outro perfil a elas antes de excluí-lo.`,
        'PROFILE_IN_USE',
      )
    }
    exigirAlcance(ator, perfil.permissions, 'Este perfil')

    await excluirDoBanco(tx, id)
    await recordAudit(tx, context, {
      action: 'profile.deleted',
      entityType: 'profile',
      entityId: id,
      actorUserId: ator.id,
      metadata: { name: perfil.name, permissions: perfil.permissions },
    })
  })
}
