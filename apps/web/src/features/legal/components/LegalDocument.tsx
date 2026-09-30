import { VERSAO_DOS_TERMOS } from '@repo/shared'
import { useEffect } from 'react'

import { SiteLayout } from '@/components/SiteLayout'

import type { DocumentoLegal } from '../textos'

const DATA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' })

/** Um documento legal: o título, a versão em vigor e as seções. */
export function LegalDocument({ documento }: { documento: DocumentoLegal }) {
  useEffect(() => {
    document.title = documento.titulo
  }, [documento.titulo])

  return (
    <SiteLayout>
      <main className="mx-auto flex max-w-2xl flex-col gap-section-y px-page-x py-section-y">
        <div className="flex flex-col gap-1">
          <h1 className="text-display text-content">{documento.titulo}</h1>
          <p className="text-caption text-content-muted">
            Versão de {DATA.format(new Date(`${VERSAO_DOS_TERMOS}T00:00:00Z`))}
          </p>
        </div>

        <p role="note" className="text-caption rounded-control bg-accent-50 p-3 text-accent-800">
          Texto provisório: a versão definitiva será publicada antes do lançamento.
        </p>

        {documento.secoes.map((secao) => (
          <section key={secao.titulo} className="flex flex-col gap-2">
            <h2 className="text-heading text-content">{secao.titulo}</h2>
            {secao.paragrafos.map((paragrafo) => (
              <p key={paragrafo} className="text-body text-content">
                {paragrafo}
              </p>
            ))}
          </section>
        ))}
      </main>
    </SiteLayout>
  )
}
