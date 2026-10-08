import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { currentUser, requireAnyOf, requireAuth, tenantContextOf } from '../auth/middleware.js'
import { definirComposicao, obterComposicao } from '../catalog/combos.js'
import {
  atualizarGrupo,
  criarGrupo,
  definirGruposDoProduto,
  excluirGrupo,
  listarGrupos,
  listarGruposDoProduto,
  obterGrupo,
} from '../catalog/option-groups.js'

/**
 * Grupos de opção e combos.
 *
 * Usam as permissões de produto: `products:read` para consultar e
 * `products:update` para alterar. Personalizar um produto é alterá-lo.
 *
 * Gravar um grupo segue a mesma divisão do produto: o acréscimo de uma opção é
 * preço (`products:price`), o "disponível" dela é o que esgotou
 * (`products:availability`), e o resto é `products:update` — quem pode mudar o
 * preço do lanche pode mudar o preço do bacon, e quem marca o lanche como
 * esgotado marca o bacon. Quem confere é o serviço, pelo que o pedido muda.
 */

const paramsComId = z.object({ id: z.uuid() })
const seguranca = [{ bearerAuth: [] }]
const tag = ['Personalização']

/** Mesmo teto dos produtos: trava contra um zero a mais, não regra de negócio. */
const acrescimo = z.coerce
  .number()
  .int('informe o acréscimo em centavos, sem casas decimais')
  .min(0, 'o acréscimo não pode ser negativo — o preço base é o da menor opção')
  .max(10_000_000)

const opcaoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  priceDeltaInCents: z.number(),
  isAvailable: z.boolean(),
  sortOrder: z.number(),
})

const grupoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  minSelections: z.number(),
  maxSelections: z.number(),
  isRequired: z.boolean(),
  options: z.array(opcaoSchema),
  /** Quem usa o grupo: mudar o grupo muda todos eles. */
  products: z
    .array(z.object({ id: z.uuid(), name: z.string() }))
    .describe('Os produtos que usam o grupo, em ordem alfabética.'),
})

const dadosDoGrupo = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  minSelections: z.coerce.number().int().min(0).max(50),
  maxSelections: z.coerce.number().int().min(1).max(50),
  options: z
    .array(
      z.object({
        id: z.uuid().optional(),
        name: z.string().trim().min(1).max(80),
        priceDeltaInCents: acrescimo,
        isAvailable: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(100),
})

const itemDoCombo = z.object({
  productId: z.uuid(),
  name: z.string(),
  priceInCents: z.number(),
  isAvailable: z.boolean(),
  quantity: z.number(),
})

const composicaoSchema = z.object({
  items: z.array(itemDoCombo),
  precoAvulsoEmCentavos: z.number(),
  todosDisponiveis: z.boolean(),
})

export function adminCustomizationRoutes(instance: FastifyInstance): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()
  const LER = requireAuth('products:read')
  const ALTERAR = requireAuth('products:update')
  const GRAVAR_O_GRUPO = requireAnyOf('products:update', 'products:price', 'products:availability')
  const PERMISSOES_DO_GRUPO =
    'A permissão é a do que **muda**: `products:price` para o acréscimo de uma opção (e para ' +
    'uma opção nova que já nasce com acréscimo), `products:availability` para o `isAvailable` ' +
    'de uma opção que existe, e `products:update` para o resto.'

  // --- Grupos de opção -------------------------------------------------------

  typed.get(
    '/option-groups',
    {
      schema: {
        tags: tag,
        summary: 'Grupos de opção, com as opções de cada um',
        description: 'Cada grupo traz também os produtos que o usam (`products`).',
        response: { 200: z.array(grupoSchema) },
        security: seguranca,
      },
      onRequest: LER,
    },
    async (request) => listarGrupos(tenantContextOf(request)),
  )

  typed.post(
    '/option-groups',
    {
      schema: {
        tags: tag,
        summary: 'Cria um grupo de opções',
        description:
          'Tamanho, adicionais e remoções são todos grupos — muda o mínimo e o máximo. `isRequired` é derivado de `minSelections >= 1`. O grupo é reutilizável: crie "Adicionais" uma vez e ligue a vários produtos.\n\n' +
          'Exige `products:update`; com alguma opção com acréscimo, também `products:price`.',
        body: dadosDoGrupo,
        response: { 201: grupoSchema },
        security: seguranca,
      },
      onRequest: ALTERAR,
    },
    async (request, reply) => {
      const criado = await criarGrupo(tenantContextOf(request), currentUser(request), request.body)
      return reply.status(201).send(criado)
    },
  )

  typed.get(
    '/option-groups/:id',
    {
      schema: {
        tags: tag,
        summary: 'Um grupo de opções',
        params: paramsComId,
        response: { 200: grupoSchema },
        security: seguranca,
      },
      onRequest: LER,
    },
    async (request) => obterGrupo(tenantContextOf(request), request.params.id),
  )

  typed.put(
    '/option-groups/:id',
    {
      schema: {
        tags: tag,
        summary: 'Altera o grupo e as opções dele',
        description:
          'Opções com `id` são alteradas, sem `id` são criadas, e as ausentes são removidas. A alteração vale para todos os produtos que usam o grupo.\n\n' +
          PERMISSOES_DO_GRUPO,
        params: paramsComId,
        body: dadosDoGrupo,
        response: { 200: grupoSchema },
        security: seguranca,
      },
      onRequest: GRAVAR_O_GRUPO,
    },
    async (request) =>
      atualizarGrupo(
        tenantContextOf(request),
        currentUser(request),
        request.params.id,
        request.body,
      ),
  )

  typed.delete(
    '/option-groups/:id',
    {
      schema: {
        tags: tag,
        summary: 'Exclui um grupo que nenhum produto usa',
        description: 'Em uso, responde 409 em vez de tirá-lo dos produtos em silêncio.',
        params: paramsComId,
        response: { 204: z.null() },
        security: seguranca,
      },
      onRequest: ALTERAR,
    },
    async (request, reply) => {
      await excluirGrupo(tenantContextOf(request), currentUser(request).id, request.params.id)
      return reply.status(204).send(null)
    },
  )

  // --- Grupos de um produto -------------------------------------------------

  typed.get(
    '/products/:id/option-groups',
    {
      schema: {
        tags: tag,
        summary: 'Grupos de opção de um produto, na ordem de exibição',
        params: paramsComId,
        response: { 200: z.array(grupoSchema) },
        security: seguranca,
      },
      onRequest: LER,
    },
    async (request) => listarGruposDoProduto(tenantContextOf(request), request.params.id),
  )

  typed.put(
    '/products/:id/option-groups',
    {
      schema: {
        tags: tag,
        summary: 'Define os grupos de opção do produto',
        description: 'Substitui a lista inteira, na ordem em que o cliente verá os grupos.',
        params: paramsComId,
        body: z.object({
          groupIds: z
            .array(z.uuid())
            .max(30)
            .refine((ids) => new Set(ids).size === ids.length, 'há grupos repetidos'),
        }),
        response: { 200: z.array(grupoSchema) },
        security: seguranca,
      },
      onRequest: ALTERAR,
    },
    async (request) =>
      definirGruposDoProduto(
        tenantContextOf(request),
        currentUser(request).id,
        request.params.id,
        request.body.groupIds,
      ),
  )

  // --- Combos ---------------------------------------------------------------

  typed.get(
    '/products/:id/combo-items',
    {
      schema: {
        tags: tag,
        summary: 'Componentes de um combo',
        description:
          '`precoAvulsoEmCentavos` é quanto custariam os itens separados; `todosDisponiveis` é falso se algum componente estiver esgotado.',
        params: paramsComId,
        response: { 200: composicaoSchema },
        security: seguranca,
      },
      onRequest: LER,
    },
    async (request) => obterComposicao(tenantContextOf(request), request.params.id),
  )

  typed.put(
    '/products/:id/combo-items',
    {
      schema: {
        tags: tag,
        summary: 'Define os componentes de um combo',
        description: 'Só para produtos do tipo COMBO. Um combo não pode conter outro combo.',
        params: paramsComId,
        body: z.object({
          items: z
            .array(
              z.object({
                productId: z.uuid(),
                quantity: z.coerce.number().int().min(1).max(20),
              }),
            )
            .min(1)
            .max(20)
            .refine(
              (itens) => new Set(itens.map((i) => i.productId)).size === itens.length,
              'o mesmo produto aparece duas vezes — use a quantidade',
            ),
        }),
        response: { 200: composicaoSchema },
        security: seguranca,
      },
      onRequest: ALTERAR,
    },
    async (request) =>
      definirComposicao(
        tenantContextOf(request),
        currentUser(request).id,
        request.params.id,
        request.body.items,
      ),
  )
}
