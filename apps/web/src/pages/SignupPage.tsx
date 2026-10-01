import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router'

import { SiteLayout } from '@/components/SiteLayout'
import { caminhoDoPainel } from '@/features/admin/menu'
import type { ChegadaDoCadastro } from '@/features/signup/api'
import { SignupForm } from '@/features/signup/components/SignupForm'

/**
 * O cadastro do estabelecimento em `/cadastro`. Deu certo, a sessão já está
 * aberta e a pessoa cai no painel — onde o aviso lembra de confirmar o e-mail.
 */
export function SignupPage() {
  const navigate = useNavigate()

  useEffect(() => {
    document.title = 'Cadastre seu estabelecimento'
  }, [])

  return (
    <SiteLayout
      acoes={
        <Link to="/entrar" className="text-body font-semibold text-primary hover:underline">
          Entrar
        </Link>
      }
    >
      <main className="mx-auto flex max-w-md flex-col gap-section-y px-page-x py-section-y">
        <div className="flex flex-col gap-1">
          <h1 className="text-heading text-content">Cadastre seu estabelecimento</h1>
          <p className="text-body text-content-muted">
            Grátis, sem cartão de crédito. O cardápio vai ao ar assim que você confirmar o e-mail.
          </p>
        </div>

        <SignupForm
          aoCadastrar={(cadastrado) => {
            const chegada: ChegadaDoCadastro = {
              emailNaoEnviado: !cadastrado.confirmationEmailSent,
            }
            void navigate(caminhoDoPainel(cadastrado.establishment.slug), {
              replace: true,
              state: chegada,
            })
          }}
        />

        <p className="text-body text-center text-content-muted">
          Já tem conta?{' '}
          <Link to="/entrar" className="font-semibold text-primary hover:underline">
            Entrar
          </Link>
        </p>
      </main>
    </SiteLayout>
  )
}
