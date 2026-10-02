/**
 * Catálogos da plataforma — apenas dados, sem nenhuma dependência de conexão.
 *
 * Separado da lógica de inserção de propósito: o `globalSetup` dos testes
 * precisa semear estes mesmos catálogos e não pode importar o módulo de banco
 * da aplicação, que valida variáveis de ambiente na importação. Com os dados
 * aqui, as duas pontas usam a mesma fonte em vez de listas paralelas que
 * divergem na primeira alteração.
 */

export const FORMAS_DE_PAGAMENTO = [
  { code: 'CASH', name: 'Dinheiro', kind: 'CASH', sortOrder: 0 },
  { code: 'PIX', name: 'Pix', kind: 'PIX', sortOrder: 10 },
  { code: 'CREDIT_CARD', name: 'Cartão de crédito', kind: 'CREDIT_CARD', sortOrder: 20 },
  { code: 'DEBIT_CARD', name: 'Cartão de débito', kind: 'DEBIT_CARD', sortOrder: 30 },
  { code: 'VISA', name: 'Visa', kind: 'CREDIT_CARD', sortOrder: 40 },
  { code: 'MASTERCARD', name: 'Mastercard', kind: 'CREDIT_CARD', sortOrder: 50 },
  { code: 'ELO', name: 'Elo', kind: 'CREDIT_CARD', sortOrder: 60 },
  { code: 'MEAL_VOUCHER_VR', name: 'VR', kind: 'MEAL_VOUCHER', sortOrder: 70 },
  { code: 'MEAL_VOUCHER_VA', name: 'VA', kind: 'MEAL_VOUCHER', sortOrder: 80 },
  { code: 'OTHER', name: 'Outra forma', kind: 'OTHER', sortOrder: 999 },
] as const

/**
 * Planos da plataforma e o que cada um libera (Fase 14).
 *
 * O cadastro pela página inicial assina sempre o `FREE` — sem ele no banco, o
 * cadastro responde "indisponível" em vez de criar estabelecimento sem plano.
 */
export const PLANOS = [
  {
    code: 'FREE',
    name: 'Gratuito',
    description: 'Para começar: cardápio digital e pedidos pelo WhatsApp.',
    sortOrder: 0,
    features: [
      { key: 'maxOrdersPerMonth', isEnabled: true, limitValue: 100 },
      { key: 'maxUsers', isEnabled: true, limitValue: 2 },
      // Contra o abuso do cadastro aberto: cada produto e cada categoria guarda uma imagem.
      { key: 'maxProducts', isEnabled: true, limitValue: 20 },
      { key: 'maxCategories', isEnabled: true, limitValue: 10 },
      { key: 'reports', isEnabled: false, limitValue: null },
    ],
  },
  {
    code: 'PREMIUM',
    name: 'Premium',
    description: 'Sem teto de pedidos, com relatórios e usuários ilimitados.',
    sortOrder: 100,
    features: [
      // limitValue nulo significa ilimitado — zero seria um limite de verdade.
      { key: 'maxOrdersPerMonth', isEnabled: true, limitValue: null },
      { key: 'maxUsers', isEnabled: true, limitValue: null },
      { key: 'maxProducts', isEnabled: true, limitValue: null },
      { key: 'maxCategories', isEnabled: true, limitValue: null },
      { key: 'reports', isEnabled: true, limitValue: null },
    ],
  },
] as const
