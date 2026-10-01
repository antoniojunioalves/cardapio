import type { AvisoDoPlano } from '../plan'

/** O aviso do plano — perto do limite, na tolerância ou bloqueado. Sem aviso, não mostra nada. */
export function PlanNotice({ aviso }: { aviso: AvisoDoPlano | null }) {
  if (!aviso) return null

  return (
    <p
      role="note"
      className={`text-caption rounded-control p-3 ${
        aviso.nivel === 'alerta'
          ? 'bg-accent-100 font-semibold text-accent-800'
          : 'bg-brand-50 text-brand-800'
      }`}
    >
      {aviso.texto}
    </p>
  )
}
