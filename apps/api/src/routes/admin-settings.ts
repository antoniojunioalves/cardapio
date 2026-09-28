import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { currentUser, requireAuth, tenantContextOf } from '../auth/middleware.js'
import {
  atualizarConfiguracoes,
  definirFormasDePagamento,
  obterConfiguracoes,
  obterEntrega,
  obterFormasDePagamento,
  obterHorarios,
  obterStatus,
  substituirEntrega,
  substituirHorarios,
} from '../settings/service.js'
import { paraMinutos } from '../settings/opening-hours.js'
import { apresentarConfiguracoes } from '../settings/presenter.js'
import { storage } from '../storage/index.js'

/** `HH:MM` ou `HH:MM:SS`. */
const HORA = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

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

const patchDeConfiguracoes = z
  .object({
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

const intervaloSchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    opensAt: z.string().regex(HORA, 'use o formato HH:MM'),
    closesAt: z.string().regex(HORA, 'use o formato HH:MM'),
  })
  .refine((i) => i.opensAt !== i.closesAt, {
    message:
      'abertura e fechamento não podem ser iguais — para funcionamento ininterrupto use 00:00 às 23:59',
  })

const horariosSchema = z
  .object({ intervalos: z.array(intervaloSchema).max(50) })
  .refine((v) => !temSobreposicao(v.intervalos), {
    message: 'há intervalos sobrepostos no mesmo dia',
    path: ['intervalos'],
  })

/**
 * Detecta intervalos sobrepostos no mesmo dia — o erro comum de cadastrar
 * 11:00–14:00 e 13:00–18:00 e depois não entender por que o horário exibido
 * está estranho.
 *
 * Intervalos que atravessam a meia-noite ficam de fora: comparar um
 * 18:00–02:00 com os do dia seguinte exigiria normalizar a semana inteira numa
 * linha do tempo, e o ganho não paga a complexidade num formulário que o
 * lojista revisa na tela.
 */
function temSobreposicao(intervalos: readonly z.infer<typeof intervaloSchema>[]): boolean {
  for (let dia = 0; dia <= 6; dia += 1) {
    const doDia = intervalos
      .filter((i) => i.dayOfWeek === dia)
      .filter((i) => paraMinutos(i.closesAt) > paraMinutos(i.opensAt))
      .map((i) => ({ abre: paraMinutos(i.opensAt), fecha: paraMinutos(i.closesAt) }))
      .sort((a, b) => a.abre - b.abre)

    for (let i = 1; i < doDia.length; i += 1) {
      const anterior = doDia[i - 1]
      const atual = doDia[i]
      if (anterior && atual && atual.abre < anterior.fecha) return true
    }
  }

  return false
}

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
        response: { 200: configuracoesSchema },
        security: seguranca,
      },
      preHandler: requireAuth(LER),
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
        body: patchDeConfiguracoes,
        response: { 200: configuracoesSchema },
        security: seguranca,
      },
      preHandler: requireAuth(ESCREVER),
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
    '/business-hours',
    {
      schema: {
        tags: ['Configurações'],
        summary: 'Horário de funcionamento',
        response: { 200: z.array(horarioDeSaida) },
        security: seguranca,
      },
      preHandler: requireAuth(LER),
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
      preHandler: requireAuth(ESCREVER),
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
        response: { 200: entregaSchema },
        security: seguranca,
      },
      preHandler: requireAuth(LER),
    },
    async (request) => obterEntrega(tenantContextOf(request)),
  )

  typed.put(
    '/delivery',
    {
      schema: {
        tags: ['Configurações'],
        summary: 'Salva entrega e regiões numa transação só',
        body: patchDeEntrega,
        response: { 200: entregaSchema },
        security: seguranca,
      },
      preHandler: requireAuth(ESCREVER),
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
      preHandler: requireAuth(LER),
    },
    async (request) => obterFormasDePagamento(tenantContextOf(request)),
  )

  typed.put(
    '/payment-methods',
    {
      schema: {
        tags: ['Configurações'],
        summary: 'Habilita, desabilita e ordena as formas de pagamento',
        body: patchDeFormasDePagamento,
        response: { 200: z.array(formaDePagamentoSchema) },
        security: seguranca,
      },
      preHandler: requireAuth(ESCREVER),
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
      preHandler: requireAuth(LER),
    },
    async (request) => obterStatus(tenantContextOf(request)),
  )
}
