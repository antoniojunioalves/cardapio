import { asc, count, eq, inArray } from 'drizzle-orm'

import { recordAudit } from '../audit/record.js'
import {
  optionGroups,
  options,
  productOptionGroups,
  type Option,
  type OptionGroup,
} from '../db/schema/index.js'
import { diferencas } from '../lib/diff.js'
import { AppError, ConflictError, NotFoundError } from '../lib/errors.js'
import type { TenantContext } from '../tenant/context.js'
import { withTenant, type TenantTransaction } from '../tenant/with-tenant.js'
import { findProduct } from './repository.js'

/**
 * Grupos de opção: criação, edição, exclusão e ligação com produtos.
 *
 * O acesso a dados fica nas funções privadas do topo, que recebem a transação;
 * as exportadas abrem a transação e gravam a auditoria dentro dela.
 */

export interface GrupoComOpcoes extends OptionGroup {
  isRequired: boolean
  options: Option[]
}

export interface DadosDaOpcao {
  /** Presente para alterar uma opção existente; ausente para criar uma nova. */
  id?: string | undefined
  name: string
  priceDeltaInCents: number
  isAvailable?: boolean | undefined
}

export interface DadosDoGrupo {
  name: string
  description?: string | null | undefined
  minSelections: number
  maxSelections: number
  options: readonly DadosDaOpcao[]
}

const grupoNaoEncontrado = () => new NotFoundError('Grupo de opções não encontrado.')

/**
 * Coerência entre os limites de seleção e as opções do grupo.
 *
 * O caso que importa é o mínimo maior que o número de opções: "escolha 2" com
 * uma opção só torna o produto **impossível de pedir**, e ninguém perceberia
 * até o cliente travar no checkout. O máximo acima do número de opções é
 * inofensivo, mas é sempre engano de cadastro.
 *
 * Função pura, sem banco: devolve a lista de problemas, vazia se estiver tudo
 * certo.
 */
export function problemasDoGrupo(
  dados: Pick<DadosDoGrupo, 'minSelections' | 'maxSelections' | 'options'>,
): string[] {
  const problemas: string[] = []
  const total = dados.options.length

  if (total === 0) problemas.push('o grupo precisa de ao menos uma opção')
  if (dados.minSelections > dados.maxSelections) {
    problemas.push('o mínimo de escolhas não pode ser maior que o máximo')
  }
  if (total > 0 && dados.minSelections > total) {
    problemas.push(
      `o grupo exige ${String(dados.minSelections)} escolha(s) mas tem ${String(total)} opção(ões) — o produto ficaria impossível de pedir`,
    )
  }
  if (total > 0 && dados.maxSelections > total) {
    problemas.push(
      `o máximo de escolhas (${String(dados.maxSelections)}) passa do número de opções (${String(total)})`,
    )
  }

  const nomes = dados.options.map((o) => o.name.trim().toLowerCase())
  if (new Set(nomes).size !== nomes.length) problemas.push('há opções com o mesmo nome')

  return problemas
}

function exigirGrupoCoerente(dados: DadosDoGrupo): void {
  const problemas = problemasDoGrupo(dados)
  if (problemas.length > 0) {
    throw new AppError(
      'O grupo de opções tem limites incoerentes.',
      400,
      'INVALID_OPTION_GROUP',
      problemas,
    )
  }
}

// --- Acesso a dados ---------------------------------------------------------

async function carregarOpcoes(
  tx: TenantTransaction,
  groupIds: readonly string[],
): Promise<Map<string, Option[]>> {
  const porGrupo = new Map<string, Option[]>(groupIds.map((id) => [id, []]))
  if (groupIds.length === 0) return porGrupo

  const linhas = await tx
    .select()
    .from(options)
    .where(inArray(options.groupId, [...groupIds]))
    .orderBy(asc(options.sortOrder), asc(options.name))

  for (const opcao of linhas) porGrupo.get(opcao.groupId)?.push(opcao)
  return porGrupo
}

/**
 * "Obrigatório" é derivado, nunca gravado: é `minSelections >= 1`. Gravar os
 * dois permitiria um grupo obrigatório com mínimo zero.
 */
function montar(grupo: OptionGroup, opcoes: Option[]): GrupoComOpcoes {
  return { ...grupo, isRequired: grupo.minSelections >= 1, options: opcoes }
}

async function buscarGrupo(tx: TenantTransaction, id: string): Promise<GrupoComOpcoes | null> {
  const [grupo] = await tx.select().from(optionGroups).where(eq(optionGroups.id, id)).limit(1)
  if (!grupo) return null

  const opcoes = await carregarOpcoes(tx, [grupo.id])
  return montar(grupo, opcoes.get(grupo.id) ?? [])
}

/**
 * Grava as opções do grupo: altera as que vieram com id, cria as que vieram
 * sem, e remove as que não vieram.
 *
 * Um id que não pertence a este grupo é recusado — seja de outro grupo, seja
 * de outro estabelecimento. Sem isso, editar o grupo "Adicionais" poderia
 * sequestrar uma opção do grupo "Tamanho".
 */
async function gravarOpcoes(
  tx: TenantTransaction,
  context: TenantContext,
  groupId: string,
  dados: readonly DadosDaOpcao[],
): Promise<void> {
  const atuais = await tx
    .select({ id: options.id })
    .from(options)
    .where(eq(options.groupId, groupId))
  const idsAtuais = new Set(atuais.map((o) => o.id))

  const estranhos = dados.filter((o) => o.id !== undefined && !idsAtuais.has(o.id))
  if (estranhos.length > 0) {
    throw new AppError(
      'Uma das opções informadas não pertence a este grupo.',
      400,
      'OPTION_NOT_IN_GROUP',
    )
  }

  const mantidos = new Set(dados.flatMap((o) => (o.id ? [o.id] : [])))
  const removidos = [...idsAtuais].filter((id) => !mantidos.has(id))
  if (removidos.length > 0) await tx.delete(options).where(inArray(options.id, removidos))

  for (const [indice, opcao] of dados.entries()) {
    const valores = {
      name: opcao.name,
      priceDeltaInCents: opcao.priceDeltaInCents,
      isAvailable: opcao.isAvailable ?? true,
      sortOrder: indice * 10,
    }

    if (opcao.id) {
      await tx
        .update(options)
        .set({ ...valores, updatedAt: new Date() })
        .where(eq(options.id, opcao.id))
    } else {
      await tx.insert(options).values({ ...valores, tenantId: context.tenantId, groupId })
    }
  }
}

async function contarProdutosQueUsam(tx: TenantTransaction, groupId: string): Promise<number> {
  const [linha] = await tx
    .select({ total: count() })
    .from(productOptionGroups)
    .where(eq(productOptionGroups.groupId, groupId))
  return linha?.total ?? 0
}

// --- Regras -----------------------------------------------------------------

export async function listarGrupos(context: TenantContext): Promise<GrupoComOpcoes[]> {
  return withTenant(context, async (tx) => {
    const grupos = await tx.select().from(optionGroups).orderBy(asc(optionGroups.name))
    const opcoes = await carregarOpcoes(
      tx,
      grupos.map((g) => g.id),
    )
    return grupos.map((g) => montar(g, opcoes.get(g.id) ?? []))
  })
}

export async function obterGrupo(context: TenantContext, id: string): Promise<GrupoComOpcoes> {
  return withTenant(context, async (tx) => {
    const grupo = await buscarGrupo(tx, id)
    if (!grupo) throw grupoNaoEncontrado()
    return grupo
  })
}

export async function criarGrupo(
  context: TenantContext,
  actorUserId: string,
  dados: DadosDoGrupo,
): Promise<GrupoComOpcoes> {
  exigirGrupoCoerente(dados)

  return withTenant(context, async (tx) => {
    const [grupo] = await tx
      .insert(optionGroups)
      .values({
        tenantId: context.tenantId,
        name: dados.name,
        description: dados.description ?? null,
        minSelections: dados.minSelections,
        maxSelections: dados.maxSelections,
      })
      .returning()
    if (!grupo) throw new Error('falha ao criar o grupo de opções')

    await gravarOpcoes(tx, context, grupo.id, dados.options)

    await recordAudit(tx, context, {
      action: 'option_group.created',
      entityType: 'option_group',
      entityId: grupo.id,
      actorUserId,
      metadata: {
        name: grupo.name,
        minSelections: grupo.minSelections,
        maxSelections: grupo.maxSelections,
        options: dados.options.map((o) => ({
          name: o.name,
          priceDeltaInCents: o.priceDeltaInCents,
        })),
      },
    })

    const criado = await buscarGrupo(tx, grupo.id)
    if (!criado) throw grupoNaoEncontrado()
    return criado
  })
}

/**
 * Altera o grupo e as opções dele numa transação só.
 *
 * Juntos porque as duas coisas são validadas uma contra a outra: um grupo com
 * mínimo 2 não pode ficar, nem por um instante, com uma opção só.
 */
export async function atualizarGrupo(
  context: TenantContext,
  actorUserId: string,
  id: string,
  dados: DadosDoGrupo,
): Promise<GrupoComOpcoes> {
  exigirGrupoCoerente(dados)

  return withTenant(context, async (tx) => {
    const anterior = await buscarGrupo(tx, id)
    if (!anterior) throw grupoNaoEncontrado()

    await tx
      .update(optionGroups)
      .set({
        name: dados.name,
        description: dados.description ?? null,
        minSelections: dados.minSelections,
        maxSelections: dados.maxSelections,
        updatedAt: new Date(),
      })
      .where(eq(optionGroups.id, id))

    await gravarOpcoes(tx, context, id, dados.options)

    const atualizado = await buscarGrupo(tx, id)
    if (!atualizado) throw grupoNaoEncontrado()

    // A alteração de preço de uma opção é o evento que o lojista mais vai
    // querer rastrear — como o preço do produto, fica com antes e depois.
    const precosAnteriores = new Map(anterior.options.map((o) => [o.id, o.priceDeltaInCents]))
    const precosAlterados = atualizado.options
      .filter(
        (o) => precosAnteriores.has(o.id) && precosAnteriores.get(o.id) !== o.priceDeltaInCents,
      )
      .map((o) => ({ option: o.name, de: precosAnteriores.get(o.id), para: o.priceDeltaInCents }))

    const { options: _antes, ...grupoAntes } = anterior
    const { options: _depois, ...grupoDepois } = atualizado

    await recordAudit(tx, context, {
      action: 'option_group.updated',
      entityType: 'option_group',
      entityId: id,
      actorUserId,
      metadata: {
        alteracoes: diferencas(grupoAntes, grupoDepois),
        opcoesAntes: anterior.options.map((o) => o.name),
        opcoesDepois: atualizado.options.map((o) => o.name),
        precosAlterados,
      },
    })

    return atualizado
  })
}

/**
 * Exclui um grupo que nenhum produto usa.
 *
 * Em uso, recusa. Se "Tamanho" sumisse em silêncio, o produto passaria a ser
 * vendido sem tamanho, pelo preço base. A FK com RESTRICT é a segunda barreira.
 */
export async function excluirGrupo(
  context: TenantContext,
  actorUserId: string,
  id: string,
): Promise<void> {
  await withTenant(context, async (tx) => {
    const grupo = await buscarGrupo(tx, id)
    if (!grupo) throw grupoNaoEncontrado()

    const emUso = await contarProdutosQueUsam(tx, id)
    if (emUso > 0) {
      throw new ConflictError(
        `O grupo está em uso por ${String(emUso)} produto(s). Desligue-o deles antes.`,
        'OPTION_GROUP_IN_USE',
      )
    }

    await tx.delete(optionGroups).where(eq(optionGroups.id, id))

    await recordAudit(tx, context, {
      action: 'option_group.deleted',
      entityType: 'option_group',
      entityId: id,
      actorUserId,
      metadata: { name: grupo.name, options: grupo.options.map((o) => o.name) },
    })
  })
}

// --- Ligação com produtos ---------------------------------------------------

async function gruposDoProduto(
  tx: TenantTransaction,
  productId: string,
): Promise<GrupoComOpcoes[]> {
  const ligacoes = await tx
    .select({ groupId: productOptionGroups.groupId })
    .from(productOptionGroups)
    .where(eq(productOptionGroups.productId, productId))
    .orderBy(asc(productOptionGroups.sortOrder))

  const ids = ligacoes.map((l) => l.groupId)
  if (ids.length === 0) return []

  const grupos = await tx.select().from(optionGroups).where(inArray(optionGroups.id, ids))
  const opcoes = await carregarOpcoes(tx, ids)
  const porId = new Map(grupos.map((g) => [g.id, g]))

  return ids.flatMap((id) => {
    const grupo = porId.get(id)
    return grupo ? [montar(grupo, opcoes.get(id) ?? [])] : []
  })
}

export async function listarGruposDoProduto(
  context: TenantContext,
  productId: string,
): Promise<GrupoComOpcoes[]> {
  return withTenant(context, async (tx) => {
    if (!(await findProduct(tx, productId))) throw new NotFoundError('Produto não encontrado.')
    return gruposDoProduto(tx, productId)
  })
}

/**
 * Define quais grupos o produto usa, na ordem em que o cliente os verá.
 *
 * Substitui a lista inteira. Um grupo inexistente — ou de outro
 * estabelecimento, que é a mesma coisa para esta conexão — responde 404, e
 * nada é alterado.
 */
export async function definirGruposDoProduto(
  context: TenantContext,
  actorUserId: string,
  productId: string,
  groupIds: readonly string[],
): Promise<GrupoComOpcoes[]> {
  return withTenant(context, async (tx) => {
    if (!(await findProduct(tx, productId))) throw new NotFoundError('Produto não encontrado.')

    if (groupIds.length > 0) {
      const encontrados = await tx
        .select({ id: optionGroups.id })
        .from(optionGroups)
        .where(inArray(optionGroups.id, [...groupIds]))
      if (encontrados.length !== groupIds.length) throw grupoNaoEncontrado()
    }

    const anteriores = (await gruposDoProduto(tx, productId)).map((g) => g.name)

    await tx.delete(productOptionGroups).where(eq(productOptionGroups.productId, productId))
    if (groupIds.length > 0) {
      await tx.insert(productOptionGroups).values(
        groupIds.map((groupId, indice) => ({
          tenantId: context.tenantId,
          productId,
          groupId,
          sortOrder: indice * 10,
        })),
      )
    }

    const atuais = await gruposDoProduto(tx, productId)

    await recordAudit(tx, context, {
      action: 'product.option_groups_changed',
      entityType: 'product',
      entityId: productId,
      actorUserId,
      metadata: { de: anteriores, para: atuais.map((g) => g.name) },
    })

    return atuais
  })
}
