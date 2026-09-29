import { NotFoundError } from '../lib/errors.js'
import { tenantContextFromPublicSlug, type TenantContext } from './context.js'
import { findTenantBySlug, type TenantRecord } from './repository.js'

/**
 * O mesmo formato que o banco exige. Um slug fora dele não pode existir, então
 * responde 404 sem ir ao banco.
 */
const FORMATO_DO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * Resolve o estabelecimento de uma rota pública pelo slug da URL.
 *
 * Estabelecimento inexistente e suspenso recebem **a mesma resposta**. Dizer
 * "suspenso" publicamente revelaria a situação comercial de um cliente da
 * plataforma para qualquer um que digitasse o endereço.
 *
 * É o único caminho de uma rota pública até um `TenantContext`: nenhum
 * parâmetro, cabeçalho ou corpo escolhe o estabelecimento de outra forma.
 */
export async function resolverEstabelecimentoPublico(
  slug: string,
): Promise<{ tenant: TenantRecord; context: TenantContext }> {
  const naoEncontrado = () => new NotFoundError('Estabelecimento não encontrado.')

  if (slug.length > 63 || !FORMATO_DO_SLUG.test(slug)) throw naoEncontrado()

  const tenant = await findTenantBySlug(slug)
  if (!tenant || tenant.status !== 'ACTIVE') throw naoEncontrado()

  return { tenant, context: tenantContextFromPublicSlug(tenant.id) }
}
