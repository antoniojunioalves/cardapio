import { useEffect } from 'react'

export function NotFoundPage({ mensagem = 'Esta página não existe.' }: { mensagem?: string }) {
  useEffect(() => {
    document.title = 'Página não encontrada'
  }, [])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-page-x text-center">
      <h1 className="text-display text-content">Não encontrado</h1>
      <p className="text-body text-content-muted">{mensagem}</p>
    </main>
  )
}
