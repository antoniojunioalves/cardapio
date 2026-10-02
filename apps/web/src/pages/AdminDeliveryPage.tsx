import { DeliveryForm } from '@/features/admin/components/DeliveryForm'
import { Carregado } from '@/features/admin/components/form-parts'
import { useEntrega } from '@/features/admin/delivery'
import { usePainel } from '@/features/admin/panel'

/** A aba "Entrega" das configurações, em `/{tenantSlug}/admin/configuracoes/entrega`. */
export function AdminDeliveryPage() {
  const { slug, permissoes } = usePainel()

  return (
    <Carregado consulta={useEntrega(slug)} oQue="a entrega">
      {(entrega) => (
        <DeliveryForm
          slug={slug}
          entrega={entrega}
          podeEditar={permissoes.includes('settings:update')}
        />
      )}
    </Carregado>
  )
}
