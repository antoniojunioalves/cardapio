import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'

import { SiteLayout } from '@/components/SiteLayout'
import { TextField } from '@/components/TextField'
import { entrar, useSessaoStore } from '@/features/admin/session'
import { ApiError } from '@/services/api'

const painelDe = (slug: string) => `/${slug}/admin/pedidos`

function mensagemDaFalha(erro: unknown): string {
  if (!(erro instanceof ApiError)) return 'Não foi possível entrar agora. Tente de novo.'
  if (erro.status === 401) return 'E-mail ou senha não conferem.'
  // Conta desativada ou estabelecimento suspenso: a API só diz qual depois de
  // a senha conferir, e a pessoa precisa saber por que não entra.
  if (erro.status === 403) return erro.message
  if (erro.status === 429) return 'Muitas tentativas. Aguarde um minuto e tente de novo.'
  return 'Não foi possível entrar agora. Tente de novo.'
}

/**
 * O login do painel, em `/entrar`: só e-mail e senha, para o dono e para os
 * funcionários. A pessoa não informa o estabelecimento — a API responde de
 * qual ela é, e a tela segue para o painel dele.
 */
export function EnterPage() {
  const navigate = useNavigate()
  const slugDaSessao = useSessaoStore((s) => s.slug)

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    document.title = 'Entrar no painel'
  }, [])

  // Quem já entrou neste aparelho vai direto: a pessoa não precisa saber o
  // endereço do painel, e nem digitar a senha a cada visita.
  if (slugDaSessao) return <Navigate to={painelDe(slugDaSessao)} replace />

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      const slug = await entrar(email.trim(), senha)
      void navigate(painelDe(slug), { replace: true })
    } catch (e) {
      setErro(mensagemDaFalha(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <SiteLayout>
      <main className="mx-auto flex max-w-md flex-col gap-section-y px-page-x py-section-y">
        <div className="flex flex-col gap-1">
          <h1 className="text-heading text-content">Entrar no painel</h1>
          <p className="text-body text-content-muted">
            Use o e-mail e a senha do seu cadastro no estabelecimento.
          </p>
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

        <p className="text-body text-center text-content-muted">
          Ainda não tem conta?{' '}
          <Link to="/cadastro" className="font-semibold text-primary hover:underline">
            Cadastre seu estabelecimento
          </Link>
        </p>
      </main>
    </SiteLayout>
  )
}
