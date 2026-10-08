import { ABAS_DA_EQUIPE } from '../menu'
import { TelaComAbas } from './TelaComAbas'

/**
 * A moldura da Equipe: as pessoas, em `/{tenantSlug}/admin/equipe`, e os
 * perfis, em `/equipe/perfis`. Criar e editar uma pessoa ou um perfil abrem
 * uma janela sobre a lista.
 */
export function TeamTabs() {
  return <TelaComAbas titulo="Equipe" abas={ABAS_DA_EQUIPE} />
}
