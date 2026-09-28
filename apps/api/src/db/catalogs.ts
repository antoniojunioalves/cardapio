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
