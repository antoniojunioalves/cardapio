import { ABAS_DO_CARDAPIO } from '../menu'
import { TelaComAbas } from './TelaComAbas'

/**
 * A moldura do Cardápio: os produtos, em `/{tenantSlug}/admin/cardapio`, e as
 * opções e adicionais, em `/cardapio/opcoes`. As páginas de criar e editar
 * ficam fora dela, com o link de volta no lugar das abas.
 */
export function CardapioTabs() {
  return <TelaComAbas titulo="Cardápio" abas={ABAS_DO_CARDAPIO} />
}
