import { z } from 'zod'

import { textoObrigatorio } from './customer.js'

/**
 * Cadastro de um estabelecimento, validado igual no formulário e na API.
 *
 * As mensagens são para a pessoa que se cadastra, como no resto do pacote.
 */

/** O endereço do cardápio — `/lanchonete-do-ze`. O mesmo formato que o banco exige. */
export const SLUG_FORMATO = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const SLUG_MINIMO = 3
export const SLUG_MAXIMO = 63

/**
 * Endereços que não podem virar cardápio.
 *
 * O web atende `/:tenantSlug` no mesmo nível das páginas do produto —
 * `/cadastro`, `/termos`. Um estabelecimento num desses endereços ficaria
 * inacessível, porque a página do produto ganha a disputa pela rota. A lista
 * cobre as páginas de hoje e as previstas, e também nomes que alguém usaria
 * para se passar pela própria plataforma.
 */
export const SLUGS_RESERVADOS: ReadonlySet<string> = new Set([
  // Páginas do produto
  'admin',
  'ajuda',
  'api',
  'app',
  'cadastro',
  'cardapio',
  'carrinho',
  'checkout',
  'confirmar-email',
  'conta',
  'contato',
  'docs',
  'entrar',
  'esqueci-a-senha',
  'health',
  'login',
  'minha-conta',
  'painel',
  'pedido',
  'pedidos',
  'planos',
  'plataforma',
  'precos',
  'privacidade',
  'ready',
  'recuperar-senha',
  'redefinir-senha',
  // Segmento da API pública, no mesmo nível de `/api/v1/public/:tenantSlug`
  'signup',
  'sobre',
  'status',
  'suporte',
  'termos',
  'uploads',
  'www',
  // Nomes que se passariam pela plataforma
  'cobranca',
  'financeiro',
  'oficial',
  'pagamento',
  'pagamentos',
  'seguranca',
])

export function slugReservado(slug: string): boolean {
  return SLUGS_RESERVADOS.has(slug)
}

/** Aceita maiúsculas e espaços em volta; entrega o endereço como vai para a URL. */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(SLUG_MINIMO, `Use ao menos ${String(SLUG_MINIMO)} caracteres.`)
  .max(SLUG_MAXIMO, `Use no máximo ${String(SLUG_MAXIMO)} caracteres.`)
  .regex(
    SLUG_FORMATO,
    'Use só letras minúsculas sem acento, números e hífen entre as palavras, como lanchonete-do-ze.',
  )
  .refine((slug) => !slugReservado(slug), 'Este endereço é reservado. Escolha outro.')

/** A mesma regra da criação de usuários do painel. */
export const SENHA_MINIMA = 8

export const senhaSchema = z
  .string()
  .min(SENHA_MINIMA, `A senha precisa de ao menos ${String(SENHA_MINIMA)} caracteres.`)
  .max(256, 'Use no máximo 256 caracteres.')

/**
 * A versão em vigor dos termos de uso e da política de privacidade.
 *
 * O cadastro envia a versão que a pessoa leu e aceitou, e a API recusa
 * qualquer outra. Mudou o texto? Mude a data: quem se cadastrar depois aceita
 * a versão nova, e a auditoria de cada cadastro registra qual foi aceita.
 */
export const VERSAO_DOS_TERMOS = '2026-09-30'

export const FUSO_PADRAO = 'America/Sao_Paulo'

/** Um fuso que o `Intl` conhece — é com ele que o horário de funcionamento é calculado. */
export function fusoValido(fuso: string): boolean {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: fuso })
    return true
  } catch {
    return false
  }
}

export const cadastroSchema = z.object({
  establishmentName: textoObrigatorio(120, 'Informe o nome do estabelecimento.'),
  slug: slugSchema,
  ownerName: textoObrigatorio(120, 'Informe o seu nome.'),
  email: z.email('Informe um e-mail válido, como voce@exemplo.com.').max(254),
  password: senhaSchema,
  termsVersion: z
    .string()
    .refine(
      (versao) => versao === VERSAO_DOS_TERMOS,
      'Os termos mudaram desde que a página abriu. Leia a versão atual e aceite de novo.',
    ),
  /** O fuso do estabelecimento. Sem ele, vale o de Brasília. */
  timezone: z.string().refine(fusoValido, 'Fuso horário desconhecido.').optional(),
  /**
   * Campo-armadilha. O formulário o esconde de quem usa o site; robôs que
   * preenchem todo campo que encontram o preenchem, e o cadastro é recusado.
   */
  website: z.string().max(200).optional(),
})

export type Cadastro = z.infer<typeof cadastroSchema>
