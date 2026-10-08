/**
 * O que cada pessoa pode fazer no painel.
 *
 * O catálogo é do produto, e não de cada estabelecimento: a lista de
 * permissões é a mesma para todos. O que muda de um estabelecimento para o
 * outro são os **perfis** — conjuntos de permissões, com nome, que o dono
 * monta e dá a cada pessoa. Um perfil vale para todos que o têm.
 *
 * Fica aqui, e não só na API, porque a tela de perfis mostra o mesmo catálogo
 * que a API confere: os códigos, os nomes e o que cada permissão exige.
 */

export const GRUPOS_DE_PERMISSAO = [
  { codigo: 'pedidos', nome: 'Pedidos' },
  { codigo: 'cardapio', nome: 'Cardápio' },
  { codigo: 'configuracoes', nome: 'Configurações' },
  { codigo: 'equipe', nome: 'Equipe' },
] as const

export type GrupoDePermissao = (typeof GRUPOS_DE_PERMISSAO)[number]['codigo']

interface Permissao {
  /** `recurso:acao`. É o que a API confere em cada rota. */
  codigo: string
  grupo: GrupoDePermissao
  /** Como o dono a lê, na tela de perfis. */
  nome: string
  /** O que ela cobre, quando o nome não basta. */
  descricao?: string
  /** A permissão sem a qual esta não serve: quem altera precisa ver. */
  requer?: string
  /** Ainda não há tela que a use: vale num perfil, mas a tela de perfis não a oferece. */
  semTela?: true
}

/**
 * O catálogo, na ordem em que a tela de perfis o mostra.
 *
 * O cardápio separa o que muda todo dia do que não muda: marcar o que esgotou,
 * mexer em preço e alterar o resto são três permissões — vale para o produto
 * e para as opções dos opcionais. Do mesmo jeito, cancelar um pedido não é o
 * mesmo que mudar o status dele, e pausar o recebimento de pedidos não é
 * alterar as configurações.
 */
export const PERMISSOES = [
  { codigo: 'orders:read', grupo: 'pedidos', nome: 'Ver os pedidos' },
  {
    codigo: 'orders:update',
    grupo: 'pedidos',
    nome: 'Mudar o status dos pedidos',
    descricao: 'Aceitar, pôr em preparo, marcar como pronto e concluir.',
    requer: 'orders:read',
  },
  { codigo: 'orders:cancel', grupo: 'pedidos', nome: 'Cancelar pedidos', requer: 'orders:read' },
  {
    codigo: 'orders:pause',
    grupo: 'pedidos',
    nome: 'Pausar e retomar o recebimento de pedidos',
    descricao: 'Liga e desliga o “Recebendo pedidos”, nas Configurações.',
    requer: 'settings:read',
  },
  { codigo: 'customers:read', grupo: 'pedidos', nome: 'Ver os clientes', semTela: true },

  { codigo: 'products:read', grupo: 'cardapio', nome: 'Ver o cardápio' },
  {
    codigo: 'products:availability',
    grupo: 'cardapio',
    nome: 'Marcar o que esgotou',
    descricao: 'Produtos e opções dos opcionais.',
    requer: 'products:read',
  },
  {
    codigo: 'products:price',
    grupo: 'cardapio',
    nome: 'Alterar preços',
    descricao: 'O preço dos produtos e o acréscimo das opções.',
    requer: 'products:read',
  },
  {
    codigo: 'products:update',
    grupo: 'cardapio',
    nome: 'Alterar produtos, opcionais e combos',
    descricao:
      'Nome, descrição, foto, categoria, ordem, opcionais e itens do combo — menos o preço e o que esgotou.',
    requer: 'products:read',
  },
  {
    codigo: 'products:create',
    grupo: 'cardapio',
    nome: 'Criar produtos',
    descricao: 'Com o preço inicial.',
    requer: 'products:read',
  },
  {
    codigo: 'products:delete',
    grupo: 'cardapio',
    nome: 'Excluir produtos',
    requer: 'products:read',
  },
  {
    codigo: 'categories:create',
    grupo: 'cardapio',
    nome: 'Criar categorias',
    requer: 'products:read',
  },
  {
    codigo: 'categories:update',
    grupo: 'cardapio',
    nome: 'Alterar categorias',
    descricao: 'O nome, a descrição, a ordem e se ela aparece no cardápio.',
    requer: 'products:read',
  },
  {
    codigo: 'categories:delete',
    grupo: 'cardapio',
    nome: 'Excluir categorias',
    requer: 'products:read',
  },

  { codigo: 'settings:read', grupo: 'configuracoes', nome: 'Ver as configurações' },
  {
    codigo: 'settings:update',
    grupo: 'configuracoes',
    nome: 'Alterar as configurações',
    descricao: 'Dados do estabelecimento, horários, entrega e formas de pagamento.',
    requer: 'settings:read',
  },

  { codigo: 'users:read', grupo: 'equipe', nome: 'Ver a equipe e os perfis' },
  { codigo: 'users:create', grupo: 'equipe', nome: 'Cadastrar pessoas', requer: 'users:read' },
  {
    codigo: 'users:update',
    grupo: 'equipe',
    nome: 'Alterar pessoas',
    descricao: 'O nome e o perfil de cada uma.',
    requer: 'users:read',
  },
  {
    codigo: 'users:delete',
    grupo: 'equipe',
    nome: 'Desativar e reativar pessoas',
    requer: 'users:read',
  },
  {
    codigo: 'profiles:manage',
    grupo: 'equipe',
    nome: 'Criar e alterar perfis',
    descricao: 'Só com permissões que a própria pessoa tem.',
    requer: 'users:read',
  },
  {
    codigo: 'audit:read',
    grupo: 'equipe',
    nome: 'Consultar o registro de auditoria',
    semTela: true,
  },
] as const satisfies readonly Permissao[]

export type CodigoDePermissao = (typeof PERMISSOES)[number]['codigo']

/** Tudo: é o que o proprietário tem, sempre — inclusive o que o catálogo ganhar depois. */
export const TODAS_AS_PERMISSOES: readonly CodigoDePermissao[] = PERMISSOES.map((p) => p.codigo)

const catalogo: readonly Permissao[] = PERMISSOES
const porCodigo = new Map(catalogo.map((p) => [p.codigo, p]))

export function permissaoExiste(codigo: string): codigo is CodigoDePermissao {
  return porCodigo.has(codigo)
}

/**
 * As permissões de um perfil como devem ser gravadas: só as que existem, sem
 * repetição, na ordem do catálogo, e com o que cada uma exige — quem altera
 * os produtos vê o cardápio, mesmo que a caixa de "ver" tenha ficado desmarcada.
 */
export function completarPermissoes(codigos: readonly string[]): CodigoDePermissao[] {
  const escolhidas = new Set<string>()
  const incluir = (codigo: string) => {
    const permissao = porCodigo.get(codigo)
    if (!permissao || escolhidas.has(codigo)) return
    escolhidas.add(codigo)
    if (permissao.requer) incluir(permissao.requer)
  }
  codigos.forEach(incluir)
  return TODAS_AS_PERMISSOES.filter((codigo) => escolhidas.has(codigo))
}

/** Das pedidas, as que `tem` não cobre: o que alguém tentou dar sem ter. */
export function permissoesQueFaltam(
  pedidas: readonly string[],
  tem: readonly string[],
): CodigoDePermissao[] {
  return completarPermissoes(pedidas).filter((codigo) => !tem.includes(codigo))
}

/** As permissões que a tela de perfis oferece, por grupo, na ordem do catálogo. */
export function permissoesPorGrupo(): {
  grupo: (typeof GRUPOS_DE_PERMISSAO)[number]
  permissoes: Permissao[]
}[] {
  return GRUPOS_DE_PERMISSAO.map((grupo) => ({
    grupo,
    permissoes: catalogo.filter((p) => p.grupo === grupo.codigo && !p.semTela),
  }))
}

/** O nome de uma permissão, para listas e resumos. Código desconhecido não aparece. */
export function nomeDaPermissao(codigo: string): string | undefined {
  return porCodigo.get(codigo)?.nome
}

interface PerfilPronto {
  nome: string
  descricao: string
  permissoes: readonly CodigoDePermissao[]
}

const doCardapio: CodigoDePermissao[] = [
  'products:read',
  'products:availability',
  'products:price',
  'products:update',
  'products:create',
  'products:delete',
  'categories:create',
  'categories:update',
  'categories:delete',
]

/**
 * Os perfis com que todo estabelecimento começa. São dele: o dono pode
 * mudá-los, renomeá-los e excluí-los, e criar outros.
 *
 * O proprietário não está aqui porque não é um perfil: quem criou o
 * estabelecimento tem sempre tudo, e isso não se edita.
 */
export const PERFIS_PRONTOS: readonly PerfilPronto[] = [
  {
    nome: 'Administrador',
    descricao: 'Cuida de tudo, menos desativar pessoas.',
    permissoes: TODAS_AS_PERMISSOES.filter((codigo) => codigo !== 'users:delete'),
  },
  {
    nome: 'Gerente do cardápio',
    descricao: 'Monta o cardápio inteiro: produtos, preços, categorias, opcionais e combos.',
    permissoes: doCardapio,
  },
  {
    nome: 'Atendente',
    descricao: 'Acompanha e atualiza os pedidos, e marca o que esgotou.',
    permissoes: [
      'orders:read',
      'orders:update',
      'orders:cancel',
      'customers:read',
      'products:read',
      'products:availability',
    ],
  },
  {
    nome: 'Cozinha',
    descricao: 'Vê os pedidos, muda o status e marca o que esgotou.',
    permissoes: ['orders:read', 'orders:update', 'products:read', 'products:availability'],
  },
]

/** Os limites do nome e da descrição de um perfil, iguais na tela e na API. */
export const PERFIL = { nomeMaximo: 60, descricaoMaxima: 200 } as const
