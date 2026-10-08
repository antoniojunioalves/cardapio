import { Carregado } from '@/features/admin/components/form-parts'
import { SettingsForm } from '@/features/admin/components/SettingsForm'
import { usePainel } from '@/features/admin/panel'
import { useConfiguracoes } from '@/features/admin/settings'

/**
 * A aba "Estabelecimento" das configurações, em
 * `/{tenantSlug}/admin/configuracoes`: nome, descrição, imagens, contato,
 * endereço e as regras do pedido.
 */
export function AdminSettingsPage() {
  const { slug, permissoes } = usePainel()

  return (
    <Carregado consulta={useConfiguracoes(slug)} oQue="as configurações">
      {(configuracoes) => (
        <SettingsForm
          slug={slug}
          configuracoes={configuracoes}
          podeEditar={permissoes.includes('settings:update')}
          podePausar={permissoes.includes('settings:update') || permissoes.includes('orders:pause')}
        />
      )}
    </Carregado>
  )
}
