import { ABAS_DO_CARDAPIO } from '../menu'
import { TelaComAbas } from './TelaComAbas'

/**
 * A moldura do Cardápio: os produtos, em `/{tenantSlug}/admin/cardapio`, e os
 * opcionais, em `/cardapio/opcionais`. O cadastro de um produto, em passos,
 * fica fora dela, com o link de volta no lugar das abas.
 */
export function CardapioTabs() {
  return <TelaComAbas titulo="Cardápio" abas={ABAS_DO_CARDAPIO} />
}
