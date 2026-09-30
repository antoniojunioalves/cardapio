import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'

import { TextField } from '@/components/TextField'
import { entrar, useSessaoStore } from '@/features/admin/session'
import { useCardapioPublico } from '@/features/menu/api'
import { ApiError } from '@/services/api'

/** O login do painel em `/{tenantSlug}/admin`. O slug vem da URL, não é digitado. */
export function AdminLoginPage() {
  const { tenantSlug = '' } = useParams()
  const navigate = useNavigate()
  const slugDaSessao = useSessaoStore((s) => s.slug)
  const nome = useCardapioPublico(tenantSlug).data?.establishment.name

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    document.title = nome ? `Painel — ${nome}` : 'Painel'
  }, [nome])

  if (slugDaSessao === tenantSlug) return <Navigate to={`/${tenantSlug}/admin/pedidos`} replace />

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await entrar(tenantSlug, email.trim(), senha)
      void navigate(`/${tenantSlug}/admin/pedidos`, { replace: true })
    } catch (e) {
      setErro(
        e instanceof ApiError && e.status === 401
          ? 'E-mail ou senha não conferem.'
          : e instanceof ApiError && e.status === 429
            ? 'Muitas tentativas. Aguarde um minuto e tente de novo.'
            : 'Não foi possível entrar agora. Tente de novo.',
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-section-y px-page-x">
      <div className="text-center">
        <h1 className="text-heading text-content">Painel do estabelecimento</h1>
        {nome && <p className="text-body text-content-muted">{nome}</p>}
      </div>

      <form
        noValidate
        onSubmit={(e) => void aoEnviar(e)}
        className="flex flex-col gap-stack rounded-card bg-surface p-card shadow-card"
      >
        <TextField
          rotulo="E-mail"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
          }}
        />
        <TextField
          rotulo="Senha"
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => {
            setSenha(e.target.value)
          }}
        />
        {erro && (
          <p role="alert" className="text-caption text-danger">
            {erro}
          </p>
        )}
        <button
          type="submit"
          disabled={enviando || !email || !senha}
          className="text-body rounded-control bg-primary px-4 py-3 font-semibold text-primary-content hover:bg-primary-hover disabled:opacity-50"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
