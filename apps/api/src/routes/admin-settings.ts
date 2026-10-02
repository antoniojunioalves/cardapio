import {
  fusoValido,
  HORA_DO_DIA,
  MAXIMO_DE_INTERVALOS,
  problemasDosHorarios,
  textoObrigatorio,
} from '@repo/shared'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { currentUser, requireAuth, tenantContextOf } from '../auth/middleware.js'
import {
  atualizarConfiguracoes,
  definirFormasDePagamento,
  obterChecklist,
  obterConfiguracoes,
  obterEntrega,
  obterFormasDePagamento,
  obterHorarios,
  obterStatus,
  substituirEntrega,
  substituirHorarios,
} from '../settings/service.js'
import { PASSOS } from '../settings/checklist.js'
import { apresentarConfiguracoes } from '../settings/presenter.js'
import { storage } from '../storage/index.js'

const centavos = z.coerce.number().int().min(0)
const minutos = z.coerce
  .number()
  .int()
  .min(0)
  .max(24 * 60)
const textoOpcional = (max: number) => z.string().trim().max(max).nullable().optional()

export const configuracoesSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  description: z.string().nullable(),
  logoUrl: z.string().nullable(),
  coverUrl: z.string().nullable(),
  whatsappPhone: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  addressStreet: z.string().nullable(),
  addressNumber: z.string().nullable(),
  addressComplement: z.string().nullable(),
  addressNeighborhood: z.string().nullable(),
  addressCity: z.string().nullable(),
  addressState: z.string().nullable(),
  addressPostalCode: z.string().nullable(),
  prepTimeMinMinutes: z.number().nullable(),
  prepTimeMaxMinutes: z.number().nullable(),
  minimumOrderInCents: z.number(),
  isAcceptingOrders: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

/**
 * As configurações como `GET` e `PATCH /settings` devolvem: com o nome, o
 * endereço e o fuso, que moram no registro de estabelecimentos. As rotas de
 * imagem devolvem só a parte de `tenant_settings`.
 */
const configuracoesDoEstabelecimentoSchema = configuracoesSchema.extend({
  name: z.string(),
  /** O endereço do cardápio. Só leitura: não muda por esta rota. */
  slug: z.string(),
  timezone: z.string(),
})

const patchDeConfiguracoes = z
  .object({
    name: textoObrigatorio(120, 'Informe o nome do estabelecimento.').optional(),
    /** Um fuso que o `Intl` conhece: é com ele que "aberto agora" e "hoje" são calculados. */
    timezone: z.string().refine(fusoValido, 'Fuso horário desconhecido.').optional(),
    description: textoOpcional(2000),
    /** Só dígitos: o link do WhatsApp não aceita máscara. */
    whatsappPhone: z
      .string()
      .regex(/^\d{10,15}$/, 'informe apenas dígitos, com DDI e DDD')
      .nullable()
      .optional(),
    contactPhone: textoOpcional(20),
    contactEmail: z.email().max(254).nullable().optional(),
    addressStreet: textoOpcional(160),
    addressNumber: textoOpcional(20),
    addressComplement: textoOpcional(80),
    addressNeighborhood: textoOpcional(80),
    addressCity: textoOpcional(80),
    addressState: z.string().trim().length(2).toUpperCase().nullable().optional(),
    addressPostalCode: textoOpcional(9),
    prepTimeMinMinutes: minutos.nullable().optional(),
    prepTimeMaxMinutes: minutos.nullable().optional(),
    minimumOrderInCents: centavos.optional(),
    isAcceptingOrders: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.prepTimeMinMinutes == null ||
      v.prepTimeMaxMinutes == null ||
      v.prepTimeMinMinutes <= v.prepTimeMaxMinutes,
    { message: 'o tempo mínimo de preparo não pode ser maior que o máximo' },
  )

const intervaloSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  opensAt: z.string().regex(HORA_DO_DIA, 'use o formato HH:MM'),
  closesAt: z.string().regex(HORA_DO_DIA, 'use o formato HH:MM'),
})

/**
 * A grade da semana. As regras são as de `@repo/shared`, as mesmas que a tela
 * dos horários aplica enquanto a pessoa edita: abrir e fechar na mesma hora e
 * intervalos sobrepostos no mesmo dia são recusados.
 */
const horariosSchema = z
  .object({ intervalos: z.array(intervaloSchema).max(MAXIMO_DE_INTERVALOS) })
  .refine((v) => !problemasDosHorarios(v.intervalos).includes('ABRE_E_FECHA_IGUAIS'), {
    message:
      'abertura e fechamento não podem ser iguais — para funcionamento ininterrupto use 00:00 às 23:59',
    path: ['intervalos'],
  })
  .refine((v) => !problemasDosHorarios(v.intervalos).includes('SOBREPOSTO'), {
    message: 'há intervalos sobrepostos no mesmo dia',
    path: ['intervalos'],
  })

const horarioDeSaida = z.object({
  id: z.uuid(),
  dayOfWeek: z.number(),
  opensAt: z.string(),
  closesAt: z.string(),
})

const entregaSchema = z.object({
  configuracao: z.object({
    id: z.uuid(),
    deliveryEnabled: z.boolean(),
    pickupEnabled: z.boolean(),
    feeMode: z.enum(['FIXED', 'BY_REGION']),
    fixedFeeInCents: z.number(),
    estimatedMinMinutes: z.number().nullable(),
    estimatedMaxMinutes: z.number().nullable(),
  }),
  regioes: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      feeInCents: z.number(),
      isActive: z.boolean(),
      sortOrder: z.number(),
    }),
  ),
})

const patchDeEntrega = z
  .object({
    configuracao: z.object({
      deliveryEnabled: z.boolean(),
      pickupEnabled: z.boolean(),
      feeMode: z.enum(['FIXED', 'BY_REGION']),
      fixedFeeInCents: centavos,
      estimatedMinMinutes: minutos.nullable().optional(),
      estimatedMaxMinutes: minutos.nullable().optional(),
    }),
    regioes: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          feeInCents: centavos,
          isActive: z.boolean().default(true),
          sortOrder: z.coerce.number().int().min(0).default(0),
        }),
      )
      .max(200),
  })
  .refine((v) => v.configuracao.deliveryEnabled || v.configuracao.pickupEnabled, {
    message: 'o estabelecimento precisa aceitar ao menos entrega ou retirada',
  })
  .refine(
    (v) =>
      v.configuracao.feeMode !== 'BY_REGION' ||
      !v.configuracao.deliveryEnabled ||
      v.regioes.some((r) => r.isActive),
    {
      // Sem esta regra, salvar "por região" com a lista vazia deixaria o
      // checkout sem nenhuma opção de entrega selecionável.
      message: 'no modo por região é preciso ao menos uma região ativa',
    },
  )
  .refine((v) => new Set(v.regioes.map((r) => r.name.toLowerCase())).size === v.regioes.length, {
    message: 'há regiões com o mesmo nome',
  })
  .refine(
    (v) =>
      v.configuracao.estimatedMinMinutes == null ||
      v.configuracao.estimatedMaxMinutes == null ||
      v.configuracao.estimatedMinMinutes <= v.configuracao.estimatedMaxMinutes,
    { message: 'o tempo mínimo de entrega não pode ser maior que o máximo' },
  )

const formaDePagamentoSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  kind: z.string(),
  isEnabled: z.boolean(),
  sortOrder: z.number(),
})

const patchDeFormasDePagamento = z.object({
  formas: z
    .array(
      z.object({
        paymentMethodId: z.uuid(),
        isEnabled: z.boolean(),
        sortOrder: z.coerce.number().int().min(0).default(0),
      }),
    )
    .max(50),
})

const statusSchema = z.union([
  z.object({ aberto: z.literal(true), fechaAs: z.string() }),
  z.object({
    aberto: z.literal(false),
    motivo: z.enum(['PAUSADO', 'FORA_DO_HORARIO', 'SEM_HORARIO_CADASTRADO']),
    proximaAbertura: z
      .object({ dayOfWeek: z.number(), opensAt: z.string(), emDias: z.number() })
      .optional(),
  }),
])

const LER = 'settings:read'
const ESCREVER = 'settings:update'

export function adminSettingsRoutes(instance: FastifyInstance): void {
  const typed = instance.withTypeProvider<ZodTypeProvider>()
  const seguranca = [{ bearerAuth: [] }]

  typed.get(
    '/settings',
    {
      schema: {
        tags: ['Configurações'],
        summary: 'Configurações do estabelecimento',
        description: 'Inclui o nome, o endereço do cardápio (`slug`, só leitura) e o fuso horário.',
        response: { 200: configuracoesDoEstabelecimentoSchema },
        security: seguranca,
      },
      onRequest: requireAuth(LER),
    },
    async (request) =>
      apresentarConfiguracoes(await obterConfiguracoes(tenantContextOf(request)), storage),
  )

  typed.patch(
    '/settings',
    {
      schema: {
        tags: ['Configurações'],
        summary: 'Altera as configurações do estabelecimento',
        description:
          'Só os campos enviados mudam. O nome e o fuso são gravados na mesma transação dos ' +
          'demais. O endereço do cardápio (`slug`) não muda por aqui.',
        body: patchDeConfiguracoes,
        response: { 200: configuracoesDoEstabelecimentoSchema },
        security: seguranca,
      },
      onRequest: requireAuth(ESCREVER),
    },
    async (request) =>
      apresentarConfiguracoes(
        await atualizarConfiguracoes(
          tenantContextOf(request),
          currentUser(request).id,
          request.body,
        ),
        storage,
      ),
  )

  typed.get(
    '/setup-checklist',
    {
      schema: {
        tags: ['Configurações'],
        summary: 'O que falta para o estabelecimento receber pedidos',
        description:
          'A lista do Início do painel. `emailConfirmed`: o cardápio está no ar; `whatsapp`: há ' +
          'número para onde o pedido é enviado; `businessHours`: há horário cadastrado; ' +
          '`fulfillment`: entrega ou retirada funcionando; `paymentMethods`: ao menos uma forma ' +
          'de pagamento; `products`: ao menos um produto à venda. `ready` é verdadeiro com todos ' +
          'feitos.',
        response: {
          200: z.object({
            ready: z.boolean(),
            steps: z.array(z.object({ key: z.enum(PASSOS), done: z.boolean() })),
          }),
        },
        security: seguranca,
      },
      onRequest: requireAuth(LER),
    },
    async (request) => obterChecklist(tenantContextOf(request)),
  )

  typed.get(
    '/business-hours',
    {
      schema: {
        tags: ['Configurações'],
        summary: 'Horário de funcionamento',
        response: { 200: z.array(horarioDeSaida) },
        security: seguranca,
      },
      onRequest: requireAuth(LER),
    },
    async (request) => obterHorarios(tenantContextOf(request)),
  )

  typed.put(
    '/business-hours',
    {
      schema: {
        tags: ['Configurações'],
        summary: 'Substitui o horário da semana inteira',
        description:
          'Substituição, e não edição por intervalo: é assim que uma grade semanal é editada de verdade. Um intervalo cujo fechamento é menor que a abertura atravessa a meia-noite.',
        body: horariosSchema,
        response: { 200: z.array(horarioDeSaida) },
        security: seguranca,
      },
      onRequest: requireAuth(ESCREVER),
    },
    async (request) =>
      substituirHorarios(
        tenantContextOf(request),
        currentUser(request).id,
        request.body.intervalos,
      ),
  )

  typed.get(
    '/delivery',
    {
      schema: {
        tags: ['Configurações'],
        summary: 'Configuração de entrega e regiões',
        description:
          'Um estabelecimento nasce com a entrega e a retirada desligadas: é o dono quem liga. ' +
          'Enquanto as duas estiverem desligadas, o cardápio não recebe pedidos.',
        response: { 200: entregaSchema },
        security: seguranca,
      },
      onRequest: requireAuth(LER),
    },
    async (request) => obterEntrega(tenantContextOf(request)),
  )

  typed.put(
    '/delivery',
    {
      schema: {
        tags: ['Configurações'],
        summary: 'Salva entrega e regiões numa transação só',
        description:
          'A lista de regiões enviada substitui a anterior. Regras: ao menos entrega ou retirada ' +
          'ligada; com a entrega ligada no modo `BY_REGION`, ao menos uma região ativa; nomes de ' +
          'região sem repetição; o tempo mínimo não passa do máximo.',
        body: patchDeEntrega,
        response: { 200: entregaSchema },
        security: seguranca,
      },
      onRequest: requireAuth(ESCREVER),
    },
    async (request) =>
      substituirEntrega(tenantContextOf(request), currentUser(request).id, request.body),
  )

  typed.get(
    '/payment-methods',
    {
      schema: {
        tags: ['Configurações'],
        summary: 'Formas de pagamento disponíveis e quais estão habilitadas',
        response: { 200: z.array(formaDePagamentoSchema) },
        security: seguranca,
      },
      onRequest: requireAuth(LER),
    },
    async (request) => obterFormasDePagamento(tenantContextOf(request)),
  )

  typed.put(
    '/payment-methods',
    {
      schema: {
        tags: ['Configurações'],
        summary: 'Habilita, desabilita e ordena as formas de pagamento',
        description:
          'Só as formas enviadas mudam. Sem nenhuma forma habilitada, o cardápio não recebe pedidos.',
        body: patchDeFormasDePagamento,
        response: { 200: z.array(formaDePagamentoSchema) },
        security: seguranca,
      },
      onRequest: requireAuth(ESCREVER),
    },
    async (request) =>
      definirFormasDePagamento(
        tenantContextOf(request),
        currentUser(request).id,
        request.body.formas,
      ),
  )

  typed.get(
    '/status',
    {
      schema: {
        tags: ['Configurações'],
        summary: 'Se o estabelecimento está aberto agora',
        description:
          'Calculado no fuso do estabelecimento. É esta a resposta que vale — o relógio do navegador do cliente não é confiável.',
        response: { 200: statusSchema },
        security: seguranca,
      },
      onRequest: requireAuth(LER),
    },
    async (request) => obterStatus(tenantContextOf(request)),
  )
}
