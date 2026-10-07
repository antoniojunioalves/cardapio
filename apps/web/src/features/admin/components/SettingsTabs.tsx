import { ABAS_DAS_CONFIGURACOES } from '../menu'
import { TelaComAbas } from './TelaComAbas'

/**
 * A moldura de Configurações: Estabelecimento, Horários, Entrega e Pagamento,
 * cada aba no seu endereço — `/{tenantSlug}/admin/configuracoes/horarios`.
 */
export function SettingsTabs() {
  return <TelaComAbas titulo="Configurações" abas={ABAS_DAS_CONFIGURACOES} />
}
