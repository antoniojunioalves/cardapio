import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { currentUser, requireAuth, tenantContextOf } from '../auth/middleware.js'
import { apresentarCategoria, apresentarProduto } from '../catalog/presenter.js'
import {
  atualizarCategoria,
  atualizarProduto,
  criarCategoria,
  criarProduto,
  excluirCategoria,
  excluirProduto,
  listarCategorias,
  listarProdutos,
  obterProduto,
  removerImagemDaCategoria,
  removerImagemDoProduto,
  reordenarCategorias,
  trocarImagemDaCategoria,
  trocarImagemDoProduto,
} from '../catalog/service.js'
import { storage } from '../storage/index.js'
import { DESCRICAO_DO_UPLOAD, lerArquivo } from './helpers/multipart.js'

/**
 * Teto de preço: R$ 100.000,00. Não é regra de negócio — é a trava contra um
 * zero a mais digitado sem querer, que colocaria um lanche a R$ 2.590,00 no
 * cardápio público.
 */
const PRECO_MAXIMO_EM_CENTAVOS = 10_000_000

const texto = (max: number) => z.string().trim().min(1).max(max)
const textoOpcional = (max: number) => z.string().trim().max(max).nullable().optional()
const ordem = z.coerce.number().int().min(0).max(1_000_000)
const preco = z.coerce
  .number()
  .int('informe o preço em centavos, sem casas decimais')
  .min(0)
  .max(PRECO_MAXIMO_EM_CENTAVOS, 'preço acima do limite — confira se não sobrou um zero')

/** Um id malformado é recusado aqui, antes de virar erro de conversão no banco. */
const paramsComId = z.object({ id: z.uuid() })

const pelomenosUmCampo = (v: Record<string, unknown>) =>
  Object.values(v).some((valor) => valor !== undefined)

const categoriaSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const novaCategoria = z.object({
  name: texto(80),
  description: textoOpcional(1000),
  isActive: z.boolean().optional(),
  sortOrder: ordem.optional(),
})

const patchDeCategoria = novaCategoria
  .partial()
  .refine(pelomenosUmCampo, { message: 'informe ao menos um campo para alterar' })

const produtoSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  categoryId: z.uuid(),
  type: z.enum(['SIMPLE', 'COMBO']),
  name: z.string(),
  description: z.string().nullable(),
  priceInCents: z.number(),
  imageUrl: z.string().nullable(),
  isAvailable: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

const novoProduto = z.object({
  categoryId: z.uuid(),
  /** Definido na criação e imutável depois. */
  type: z.enum(['SIMPLE', 'COMBO']).optional(),
  name: texto(120),
  description: textoOpcional(2000),
  priceInCents: preco,
  isAvailable: z.boolean().optional(),
  sortOrder: ordem.optional(),
})

// Sem `type`: ele é imutável, e um PATCH que o trouxesse seria recusado.
const patchDeProduto = novoProduto
  .omit({ type: true })
  .strict()
  .partial()
  .refine(pelomenosUmCampo, { message: 'informe ao menos um campo para alterar' })

const semConteudo = { 204: z.null() }
const seguranca = [{ bearerAuth: [] }]

export function adminCatalogRoutes(instance: FastifyInstance): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()
  const tag = ['Catálogo']

  // --- Categorias -----------------------------------------------------------

  typed.get(
    '/categories',
    {
      schema: {
        tags: tag,
        summary: 'Categorias, na ordem de exibição',
        response: { 200: z.array(categoriaSchema) },
        security: seguranca,
      },
      onRequest: requireAuth('categories:read'),
    },
    async (request) =>
      (await listarCategorias(tenantContextOf(request))).map((c) =>
        apresentarCategoria(c, storage),
      ),
  )

  typed.post(
    '/categories',
    {
      schema: {
        tags: tag,
        summary: 'Cria uma categoria',
        description:
          'Sem `sortOrder`, entra no fim da lista. O nome é único sem diferenciar maiúsculas.',
        body: novaCategoria,
        response: { 201: categoriaSchema },
        security: seguranca,
      },
      onRequest: requireAuth('categories:create'),
    },
    async (request, reply) => {
      const criada = await criarCategoria(
        tenantContextOf(request),
        currentUser(request).id,
        request.body,
      )
      return reply.status(201).send(apresentarCategoria(criada, storage))
    },
  )

  typed.put(
    '/categories/order',
    {
      schema: {
        tags: tag,
        summary: 'Reordena as categorias',
        description:
          'Recebe a lista **completa** de ids, na ordem desejada. Uma lista parcial é recusada: deixaria as ausentes intercaladas com a ordem antiga.',
        body: z.object({ ids: z.array(z.uuid()).min(1).max(500) }),
        response: { 200: z.array(categoriaSchema) },
        security: seguranca,
      },
      onRequest: requireAuth('categories:update'),
    },
    async (request) =>
      (
        await reordenarCategorias(
          tenantContextOf(request),
          currentUser(request).id,
          request.body.ids,
        )
      ).map((c) => apresentarCategoria(c, storage)),
  )

  typed.patch(
    '/categories/:id',
    {
      schema: {
        tags: tag,
        summary: 'Altera uma categoria',
        params: paramsComId,
        body: patchDeCategoria,
        response: { 200: categoriaSchema },
        security: seguranca,
      },
      onRequest: requireAuth('categories:update'),
    },
    async (request) =>
      apresentarCategoria(
        await atualizarCategoria(
          tenantContextOf(request),
          currentUser(request).id,
          request.params.id,
          request.body,
        ),
        storage,
      ),
  )

  typed.delete(
    '/categories/:id',
    {
      schema: {
        tags: tag,
        summary: 'Exclui uma categoria vazia',
        description: 'Com produtos dentro, responde 409 em vez de levá-los junto.',
        params: paramsComId,
        response: semConteudo,
        security: seguranca,
      },
      onRequest: requireAuth('categories:delete'),
    },
    async (request, reply) => {
      await excluirCategoria(
        storage,
        tenantContextOf(request),
        currentUser(request).id,
        request.params.id,
      )
      return reply.status(204).send(null)
    },
  )

  typed.put(
    '/categories/:id/image',
    {
      schema: {
        tags: tag,
        summary: 'Envia a imagem da categoria',
        description: DESCRICAO_DO_UPLOAD,
        consumes: ['multipart/form-data'],
        params: paramsComId,
        response: { 200: categoriaSchema },
        security: seguranca,
      },
      onRequest: requireAuth('categories:update'),
    },
    async (request) =>
      apresentarCategoria(
        await trocarImagemDaCategoria(
          storage,
          tenantContextOf(request),
          currentUser(request).id,
          request.params.id,
          await lerArquivo(request),
        ),
        storage,
      ),
  )

  typed.delete(
    '/categories/:id/image',
    {
      schema: {
        tags: tag,
        summary: 'Remove a imagem da categoria',
        params: paramsComId,
        response: { 200: categoriaSchema },
        security: seguranca,
      },
      onRequest: requireAuth('categories:update'),
    },
    async (request) =>
      apresentarCategoria(
        await removerImagemDaCategoria(
          storage,
          tenantContextOf(request),
          currentUser(request).id,
          request.params.id,
        ),
        storage,
      ),
  )

  // --- Produtos -------------------------------------------------------------

  typed.get(
    '/products',
    {
      schema: {
        tags: tag,
        summary: 'Produtos, opcionalmente de uma categoria',
        querystring: z.object({ categoryId: z.uuid().optional() }),
        response: { 200: z.array(produtoSchema) },
        security: seguranca,
      },
      onRequest: requireAuth('products:read'),
    },
    async (request) =>
      (await listarProdutos(tenantContextOf(request), request.query)).map((p) =>
        apresentarProduto(p, storage),
      ),
  )

  typed.get(
    '/products/:id',
    {
      schema: {
        tags: tag,
        summary: 'Um produto',
        params: paramsComId,
        response: { 200: produtoSchema },
        security: seguranca,
      },
      onRequest: requireAuth('products:read'),
    },
    async (request) =>
      apresentarProduto(await obterProduto(tenantContextOf(request), request.params.id), storage),
  )

  typed.post(
    '/products',
    {
      schema: {
        tags: tag,
        summary: 'Cria um produto',
        description:
          'O preço é em **centavos inteiros**: R$ 25,90 é `2590`. Sem `sortOrder`, entra no fim da categoria.',
        body: novoProduto,
        response: { 201: produtoSchema },
        security: seguranca,
      },
      onRequest: requireAuth('products:create'),
    },
    async (request, reply) => {
      const criado = await criarProduto(
        tenantContextOf(request),
        currentUser(request).id,
        request.body,
      )
      return reply.status(201).send(apresentarProduto(criado, storage))
    },
  )

  typed.patch(
    '/products/:id',
    {
      schema: {
        tags: tag,
        summary: 'Altera um produto — inclusive preço e disponibilidade',
        params: paramsComId,
        body: patchDeProduto,
        response: { 200: produtoSchema },
        security: seguranca,
      },
      onRequest: requireAuth('products:update'),
    },
    async (request) =>
      apresentarProduto(
        await atualizarProduto(
          tenantContextOf(request),
          currentUser(request).id,
          request.params.id,
          request.body,
        ),
        storage,
      ),
  )

  typed.delete(
    '/products/:id',
    {
      schema: {
        tags: tag,
        summary: 'Exclui um produto',
        params: paramsComId,
        response: semConteudo,
        security: seguranca,
      },
      onRequest: requireAuth('products:delete'),
    },
    async (request, reply) => {
      await excluirProduto(
        storage,
        tenantContextOf(request),
        currentUser(request).id,
        request.params.id,
      )
      return reply.status(204).send(null)
    },
  )

  typed.put(
    '/products/:id/image',
    {
      schema: {
        tags: tag,
        summary: 'Envia a imagem do produto',
        description: DESCRICAO_DO_UPLOAD,
        consumes: ['multipart/form-data'],
        params: paramsComId,
        response: { 200: produtoSchema },
        security: seguranca,
      },
      onRequest: requireAuth('products:update'),
    },
    async (request) =>
      apresentarProduto(
        await trocarImagemDoProduto(
          storage,
          tenantContextOf(request),
          currentUser(request).id,
          request.params.id,
          await lerArquivo(request),
        ),
        storage,
      ),
  )

  typed.delete(
    '/products/:id/image',
    {
      schema: {
        tags: tag,
        summary: 'Remove a imagem do produto',
        params: paramsComId,
        response: { 200: produtoSchema },
        security: seguranca,
      },
      onRequest: requireAuth('products:update'),
    },
    async (request) =>
      apresentarProduto(
        await removerImagemDoProduto(
          storage,
          tenantContextOf(request),
          currentUser(request).id,
          request.params.id,
        ),
        storage,
      ),
  )
}
