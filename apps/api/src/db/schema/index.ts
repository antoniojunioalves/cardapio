/**
 * Schema do banco.
 *
 * Ainda vazio. As primeiras tabelas — `tenants`, `plans`, `subscriptions` —
 * entram na Fase 3, junto com o `TenantContext` e as policies de Row-Level
 * Security. Criar tabela de domínio antes disso significaria criá-la sem RLS
 * e voltar depois para adicionar, que é exatamente o descuido que o
 * teste-guarda da Fase 3 existe para impedir.
 *
 * Convenções que valem quando as tabelas chegarem:
 *
 * - Chave primária `uuid` com `DEFAULT uuidv7()` — nativo no PostgreSQL 18.
 *   Gerar no banco em vez de na aplicação garante id válido também em seed e
 *   em INSERT manual, sem custar dependência nenhuma. A aplicação continua
 *   livre para informar um id explícito quando precisar conhecê-lo antes.
 * - Valores monetários em `integer` de centavos, com a unidade no nome
 *   (`price_in_cents`).
 * - Instantes em `timestamptz`, sempre em UTC.
 * - Nomes em camelCase no TypeScript; o Drizzle converte para snake_case no
 *   banco através da opção `casing`.
 */
export {}
