/**
 * O contrato de `GET /api/v1/public/{tenantSlug}/menu`.
 *
 * Espelha `CardapioPublico` em `apps/api/src/public-menu/service.ts`. A cópia
 * é consciente: ainda não existe `packages/shared` para os contratos, e ele
 * entra quando houver um segundo consumidor que justifique — a pendência está
 * registrada no PROJECT_PLAN.
 */

export type StatusDoEstabelecimento =
  | { aberto: true; fechaAs: string }
  | {
      aberto: false
      motivo: 'PAUSADO' | 'FORA_DO_HORARIO' | 'SEM_HORARIO_CADASTRADO'
      proximaAbertura?: { dayOfWeek: number; opensAt: string; emDias: number }
    }

export interface OpcaoPublica {
  id: string
  name: string
  priceDeltaInCents: number
  isAvailable: boolean
}

export interface GrupoPublico {
  id: string
  name: string
  description: string | null
  minSelections: number
  maxSelections: number
  isRequired: boolean
  options: OpcaoPublica[]
}

export interface ProdutoPublico {
  id: string
  type: 'SIMPLE' | 'COMBO'
  name: string
  description: string | null
  priceInCents: number
  imageUrl: string | null
  isAvailable: boolean
  optionGroups: GrupoPublico[]
  combo: {
    items: { name: string; quantity: number }[]
    precoAvulsoEmCentavos: number
  } | null
}

export interface CategoriaPublica {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  products: ProdutoPublico[]
}

export interface EntregaPublica {
  deliveryEnabled: boolean
  pickupEnabled: boolean
  feeMode: 'FIXED' | 'BY_REGION'
  fixedFeeInCents: number | null
  regions: { id: string; name: string; feeInCents: number }[]
  estimatedMinMinutes: number | null
  estimatedMaxMinutes: number | null
}

export interface CardapioPublico {
  establishment: {
    slug: string
    name: string
    description: string | null
    logoUrl: string | null
    coverUrl: string | null
    timezone: string
    whatsappPhone: string | null
    contactPhone: string | null
    address: {
      street: string
      number: string | null
      complement: string | null
      neighborhood: string | null
      city: string | null
      state: string | null
      postalCode: string | null
    } | null
    prepTimeMinMinutes: number | null
    prepTimeMaxMinutes: number | null
    minimumOrderInCents: number
  }
  status: StatusDoEstabelecimento
  hours: { dayOfWeek: number; opensAt: string; closesAt: string }[]
  delivery: EntregaPublica
  paymentMethods: { id: string; code: string; name: string; kind: string }[]
  categories: CategoriaPublica[]
}
