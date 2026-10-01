/**
 * O menu do painel, sem React.
 *
 * Cada tela do painel é uma linha aqui e uma rota filha de
 * `/:tenantSlug/admin` em `App.tsx`. Para acrescentar uma tela: uma entrada
 * nesta lista, com a permissão que a API exige para os dados dela, e a rota.
 */

export type IconeDoMenu = 'inicio' | 'pedidos'

export interface ItemDoMenu {
  rotulo: string
  /** Depois de `/{slug}/admin`. Vazio é o Início. */
  caminho: string
  icone: IconeDoMenu
  /** Sem ela, a pessoa não vê o item — a API recusaria os dados da tela de qualquer jeito. */
  permissao?: string
}

export const MENU: readonly ItemDoMenu[] = [
  { rotulo: 'Início', caminho: '', icone: 'inicio' },
  { rotulo: 'Pedidos', caminho: 'pedidos', icone: 'pedidos', permissao: 'orders:read' },
]

/** Os itens que as permissões da pessoa alcançam, na ordem do menu. */
export function itensDoMenu(permissoes: readonly string[]): ItemDoMenu[] {
  return MENU.filter((item) => !item.permissao || permissoes.includes(item.permissao))
}

/** O endereço de uma tela do painel: `/{slug}/admin` ou `/{slug}/admin/pedidos`. */
export function caminhoDoPainel(slug: string, caminho = ''): string {
  return caminho ? `/${slug}/admin/${caminho}` : `/${slug}/admin`
}
