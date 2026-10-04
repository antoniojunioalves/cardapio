import { Carregado } from '@/features/admin/components/form-parts'
import { PaymentForm } from '@/features/admin/components/PaymentForm'
import { usePainel } from '@/features/admin/panel'
import { useFormasDePagamento } from '@/features/admin/payment'

/** A aba "Pagamento" das configurações, em `/{tenantSlug}/admin/configuracoes/pagamento`. */
export function AdminPaymentPage() {
  const { slug, permissoes } = usePainel()

  return (
    <Carregado consulta={useFormasDePagamento(slug)} oQue="as formas de pagamento">
      {(formas) => (
        <PaymentForm
          slug={slug}
          formas={formas}
          podeEditar={permissoes.includes('settings:update')}
        />
      )}
    </Carregado>
  )
}
