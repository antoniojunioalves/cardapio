import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

import { SiteLayout } from '@/components/SiteLayout'
import { confirmarEmail } from '@/features/signup/api'
import { ApiError } from '@/services/api'

/** O token vem no fragmento do link: `/confirmar-email#token=…`. */
function tokenDoFragmento(fragmento: string): string | null {
  return new URLSearchParams(fragmento.replace(/^#/, '')).get('token')
}

const botao =
  'text-body rounded-control bg-primary px-4 py-3 text-center font-semibold text-primary-content hover:bg-primary-hover'
const botaoSecundario =
  'text-body rounded-control border border-border-strong px-4 py-3 text-center font-semibold text-content hover:bg-neutral-50'

function Quadro({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-stack px-page-x py-section-y">
      <h1 className="text-heading text-content">{titulo}</h1>
      {children}
    </main>
  )
}

/**
 * A página do link de confirmação, em `/confirmar-email#token=…`.
 *
 * O token sai do fragmento, que o navegador não envia a servidor nenhum, e vai
 * para a API no corpo de um POST. Lido o token, o fragmento é tirado do
 * endereço: ele não fica no histórico nem vai junto se a pessoa copiar o link.
 */
export function ConfirmEmailPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [token] = useState(() => tokenDoFragmento(location.hash))

  useEffect(() => {
    document.title = 'Confirmação de e-mail'
  }, [])

  useEffect(() => {
    if (location.hash) void navigate(location.pathname, { replace: true })
  }, [location.hash, location.pathname, navigate])

  // Uma consulta por token: o React Query não repete o POST quando o React
  // monta o efeito duas vezes, e o segundo clique no mesmo link é "já confirmado".
  const confirmacao = useQuery({
    queryKey: ['confirmacao-de-email', token],
    queryFn: () => confirmarEmail(token ?? ''),
    enabled: token !== null,
    retry: false,
    staleTime: Infinity,
  })

  if (!token) {
    return (
      <SiteLayout>
        <Quadro titulo="Link incompleto">
          <p className="text-body text-content-muted">
            Abra de novo o link do e-mail, sem cortar nenhuma parte. Se preferir, entre no painel e
            peça um novo.
          </p>
          <Link to="/entrar" className={botao}>
            Entrar no painel
          </Link>
        </Quadro>
      </SiteLayout>
    )
  }

  if (confirmacao.isPending) {
    return (
      <SiteLayout>
        <Quadro titulo="Confirmando seu e-mail…">
          <p role="status" className="text-body text-content-muted">
            Só um instante.
          </p>
        </Quadro>
      </SiteLayout>
    )
  }

  if (confirmacao.isError) {
    const erro = confirmacao.error
    const doLink = erro instanceof ApiError && erro.status === 400
    return (
      <SiteLayout>
        <Quadro titulo={doLink ? 'Este link não vale mais' : 'Não deu para confirmar agora'}>
          <p role="alert" className="text-body text-content-muted">
            {doLink
              ? `${erro.message} No painel, o aviso de confirmação tem o botão para reenviar.`
              : 'Não foi possível falar com o servidor. Confira a conexão e tente de novo.'}
          </p>
          {doLink ? (
            <Link to="/entrar" className={botao}>
              Entrar no painel
            </Link>
          ) : (
            <button type="button" onClick={() => void confirmacao.refetch()} className={botao}>
              Tentar de novo
            </button>
          )}
        </Quadro>
      </SiteLayout>
    )
  }

  const { slug, status } = confirmacao.data
  return (
    <SiteLayout>
      <Quadro
        titulo={status === 'CONFIRMED' ? 'E-mail confirmado!' : 'Este e-mail já estava confirmado'}
      >
        <p className="text-body text-content-muted">
          Seu cardápio está no ar em{' '}
          <Link to={`/${slug}`} className="font-semibold text-primary hover:underline">
            {window.location.host}/{slug}
          </Link>
          . Agora é montar o cardápio e mandar o link para os clientes.
        </p>
        <div className="flex flex-col gap-stack sm:flex-row">
          <Link to={`/${slug}/admin`} className={botao}>
            Ir para o painel
          </Link>
          <Link to={`/${slug}`} className={botaoSecundario}>
            Ver o cardápio
          </Link>
        </div>
      </Quadro>
    </SiteLayout>
  )
}
