import type { ClienteIdentificado } from '@repo/shared'

import { recordAudit } from '../audit/record.js'
import { resolverEstabelecimentoPublico } from '../tenant/public.js'
import { withTenant } from '../tenant/with-tenant.js'
import { primeiroNome, resumoMascarado } from './masking.js'
import { buscarClientePorTelefone, listarEnderecosRecentes } from './repository.js'

/**
 * Identifica o cliente pelo telefone, no checkout.
 *
 * É uma dívida de privacidade assumida (SECURITY.md, seção 5): o telefone não
 * prova quem está digitando. As mitigações moram aqui e na rota:
 *
 * - a resposta traz o primeiro nome e o endereço **mascarado** — nunca o
 *   endereço completo, que o servidor só usa ao montar o pedido;
 * - toda identificação que encontra alguém vai para a auditoria, com o IP;
 * - a rota tem limite de requisições próprio, bem abaixo do global.
 *
 * Telefone desconhecido não é auditado: guardaria o número de quem nunca foi
 * cliente, e a varredura é contida pelo limite de requisições.
 */
export async function identificarCliente(
  slug: string,
  phone: string,
  origem: { ip: string },
): Promise<ClienteIdentificado> {
  const { context } = await resolverEstabelecimentoPublico(slug)

  return withTenant(context, async (tx) => {
    const cliente = await buscarClientePorTelefone(tx, phone)
    if (!cliente) return { cliente: null }

    const enderecos = await listarEnderecosRecentes(tx, cliente.id)

    await recordAudit(tx, context, {
      action: 'customer.identified',
      entityType: 'customer',
      entityId: cliente.id,
      metadata: { ip: origem.ip, enderecosExibidos: enderecos.length },
    })

    return {
      cliente: {
        primeiroNome: primeiroNome(cliente.name),
        enderecos: enderecos.map((e) => ({
          id: e.id,
          resumo: resumoMascarado(e),
          bairro: e.neighborhood,
        })),
      },
    }
  })
}
