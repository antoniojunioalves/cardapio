/**
 * O menu do painel, sem React.
 *
 * Cada tela do painel é uma linha aqui e uma rota filha de
 * `/:tenantSlug/admin` em `App.tsx`. Para acrescentar uma tela: uma entrada
 * nesta lista, com a permissão que a API exige para os dados dela, e a rota.
 *
 * Um item fica marcado também nos endereços abaixo do seu: "Configurações"
 * continua marcado em `configuracoes/horarios`.
 */

export type IconeDoMenu = 'inicio' | 'pedidos' | 'cardapio' | 'equipe' | 'configuracoes'

export interface ItemDoMenu {
  rotulo: string
  /** Depois de `/{slug}/admin`. Vazio é o Início. */
  caminho: string
  icone: IconeDoMenu
  /** Sem ela, a pessoa não vê o item — a API recusaria os dados da tela de qualquer jeito. */
  permissao?: string
  /**
   * Fica no fim do menu, abaixo de "Ver cardápio", e não entre as telas do dia
   * a dia: é o lugar do que se ajusta de vez em quando.
   */
  rodape?: boolean
}

export const MENU: readonly ItemDoMenu[] = [
  { rotulo: 'Início', caminho: '', icone: 'inicio' },
  { rotulo: 'Pedidos', caminho: 'pedidos', icone: 'pedidos', permissao: 'orders:read' },
  // Fica entre as telas do dia a dia: é aqui que se marca o que acabou.
  { rotulo: 'Cardápio', caminho: 'cardapio', icone: 'cardapio', permissao: 'products:read' },
  // Quem entra no painel e o que cada pessoa pode: ajusta-se de vez em quando.
  { rotulo: 'Equipe', caminho: 'equipe', icone: 'equipe', permissao: 'users:read', rodape: true },
  {
    rotulo: 'Configurações',
    caminho: 'configuracoes',
    icone: 'configuracoes',
    permissao: 'settings:read',
    rodape: true,
  },
]

/**
 * As abas da tela de Configurações. Cada uma tem o próprio endereço e o próprio
 * "Salvar"; todas pedem a mesma permissão do item do menu, e por isso não
 * viram itens dele.
 */
export const ABAS_DAS_CONFIGURACOES: readonly { rotulo: string; caminho: string }[] = [
  { rotulo: 'Estabelecimento', caminho: 'configuracoes' },
  { rotulo: 'Horários', caminho: 'configuracoes/horarios' },
  { rotulo: 'Entrega', caminho: 'configuracoes/entrega' },
  { rotulo: 'Pagamento', caminho: 'configuracoes/pagamento' },
]

/**
 * As abas do Cardápio. Os grupos de opção — tamanho, adicionais, o que dá para
 * tirar — valem para vários produtos, e por isso têm a lista deles, ao lado da
 * dos produtos, e não um item próprio no menu.
 */
export const ABAS_DO_CARDAPIO: readonly { rotulo: string; caminho: string }[] = [
  { rotulo: 'Produtos', caminho: 'cardapio' },
  { rotulo: 'Opcionais', caminho: 'cardapio/opcionais' },
]

/**
 * As abas da Equipe: as pessoas que entram no painel e os perfis — os conjuntos
 * de permissões que cada uma recebe. As duas pedem a permissão do item do menu.
 */
export const ABAS_DA_EQUIPE: readonly { rotulo: string; caminho: string }[] = [
  { rotulo: 'Pessoas', caminho: 'equipe' },
  { rotulo: 'Perfis', caminho: 'equipe/perfis' },
]

/** Os itens que as permissões da pessoa alcançam, na ordem do menu. */
export function itensDoMenu(permissoes: readonly string[]): ItemDoMenu[] {
  return MENU.filter((item) => !item.permissao || permissoes.includes(item.permissao))
}

/** O endereço de uma tela do painel: `/{slug}/admin` ou `/{slug}/admin/pedidos`. */
export function caminhoDoPainel(slug: string, caminho = ''): string {
  return caminho ? `/${slug}/admin/${caminho}` : `/${slug}/admin`
}
