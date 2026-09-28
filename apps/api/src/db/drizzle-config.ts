/**
 * Configuração compartilhada por toda instância do Drizzle.
 *
 * Existe porque errar aqui é silencioso e confuso: uma instância criada sem
 * `casing` emite `"sortOrder"` em vez de `sort_order`, e o erro que aparece é
 * `column "sortOrder" does not exist` — que parece problema de migration, não
 * de configuração do cliente.
 *
 * Sem dependência nenhuma de propósito: o `globalSetup` dos testes precisa
 * importar isto sem arrastar junto a validação de variáveis de ambiente.
 */
export const DRIZZLE_CONFIG = { casing: 'snake_case' } as const
