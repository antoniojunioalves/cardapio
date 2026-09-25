/**
 * Identidade do produto — FONTE ÚNICA DA VERDADE.
 *
 * O nome "Cardápio Online" é provisório. Para renomear o produto inteiro,
 * altere os valores AQUI. Nenhum componente, página ou rota deve conter o
 * nome do produto em texto literal — todos importam daqui.
 *
 * Os únicos outros lugares onde o nome aparece, e que também precisam de
 * edição manual numa renomeação, estão listados em DEVELOPMENT.md
 * (seção "Renomear o produto"). São poucos e todos fora do código de aplicação.
 */
export const app = {
  /** Nome exibido ao usuário final e ao lojista. */
  name: 'Cardápio Online',
  /** Versão curta, para espaços estreitos (header mobile, títulos de aba). */
  shortName: 'Cardápio',
  /** Identificador técnico em kebab-case. Usado em chaves de storage e afins. */
  slug: 'cardapio-online',
  /** Frase de uma linha usada em metadados e na landing. */
  description: 'Cardápio digital e pedidos online para estabelecimentos de alimentação.',
} as const

export type AppIdentity = typeof app
