import { useState } from 'react'

import { Sheet } from '@/components/Sheet'

interface CancelOrderDialogProps {
  numero: number
  enviando: boolean
  aoConfirmar: (motivo: string) => void
  aoFechar: () => void
}

/** Cancelar pede motivo: ele fica no pedido e na auditoria. */
export function CancelOrderDialog({
  numero,
  enviando,
  aoConfirmar,
  aoFechar,
}: CancelOrderDialogProps) {
  const [motivo, setMotivo] = useState('')
  const valido = motivo.trim().length >= 3

  return (
    <Sheet
      titulo={`Cancelar o pedido #${String(numero)}`}
      aoFechar={aoFechar}
      rodape={
        <button
          type="button"
          disabled={!valido || enviando}
          onClick={() => {
            aoConfirmar(motivo.trim())
          }}
          className="text-body w-full rounded-control bg-danger px-4 py-3 font-semibold text-content-inverted disabled:opacity-50"
        >
          {enviando ? 'Cancelando…' : 'Cancelar o pedido'}
        </button>
      }
    >
      <label htmlFor="motivo-do-cancelamento" className="text-body font-semibold text-content">
        Motivo
      </label>
      <textarea
        id="motivo-do-cancelamento"
        value={motivo}
        maxLength={280}
        rows={3}
        placeholder="Ex.: cliente desistiu, produto acabou"
        onChange={(e) => {
          setMotivo(e.target.value)
        }}
        className="text-body mt-1 w-full rounded-control border border-border bg-surface px-3 py-2"
      />
      <p className="text-caption mt-1 text-content-muted">
        O cliente não é avisado automaticamente: combine com ele pelo WhatsApp.
      </p>
    </Sheet>
  )
}
