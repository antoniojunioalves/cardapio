import { Carregado } from '@/features/admin/components/form-parts'
import { HoursForm } from '@/features/admin/components/HoursForm'
import { useHorarios } from '@/features/admin/hours'
import { usePainel } from '@/features/admin/panel'

/** A aba "Horários" das configurações, em `/{tenantSlug}/admin/configuracoes/horarios`. */
export function AdminHoursPage() {
  const { slug, permissoes } = usePainel()

  return (
    <Carregado consulta={useHorarios(slug)} oQue="os horários">
      {(horarios) => (
        <HoursForm
          slug={slug}
          horarios={horarios}
          podeEditar={permissoes.includes('settings:update')}
        />
      )}
    </Carregado>
  )
}
