import { app as product } from '@repo/config'
import { senhaSchema } from '@repo/shared'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

import { SiteLayout } from '@/components/SiteLayout'
import { TextField } from '@/components/TextField'
import { caminhoDoPainel } from '@/features/admin/menu'
import { PasswordRules } from '@/features/signup/components/PasswordRules'
import {
  aceitarConvite,
  consultarConvite,
  type ConviteParaAceitar,
} from '@/features/invitation/api'
import { ApiError } from '@/services/api'

/** O token vem no fragmento do link: `/convite#token=…`. */
function tokenDoFragmento(fragmento: string): string | null {
  return new URLSearchParams(fragmento.replace(/^#/, '')).get('token')
}

const botao =
  'text-body rounded-control bg-primary px-4 py-3 text-center font-semibold text-primary-content hover:bg-primary-hover disabled:opacity-50'

function Quadro({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <SiteLayout>
      <main className="mx-auto flex max-w-md flex-col gap-stack px-page-x py-section-y">
        <h1 className="text-heading text-content">{titulo}</h1>
        {children}
      </main>
    </SiteLayout>
  )
}

/**
 * A página do convite para a equipe, em `/convite#token=…`.
 *
 * Como a da confirmação de e-mail: o token sai do fragmento, que o navegador
 * não envia a servidor nenhum, vai para a API no corpo de um POST, e é tirado do
 * endereço — não fica no histórico nem vai junto se a pessoa copiar o link.
 *
 * A pessoa vê quem convidou, para qual estabelecimento e com que perfil. Quem
 * já tem conta — trabalha em outro estabelecimento, ou é dono de um — aceita
 * com a senha dela; quem não tem cria a conta ali, com o nome e uma senha.
 */
export function AcceptInvitationPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [token] = useState(() => tokenDoFragmento(location.hash))

  useEffect(() => {
    document.title = 'Convite para a equipe'
  }, [])

  useEffect(() => {
    if (location.hash) void navigate(location.pathname, { replace: true })
  }, [location.hash, location.pathname, navigate])

  const convite = useQuery({
    queryKey: ['convite-para-a-equipe', token],
    queryFn: () => consultarConvite(token ?? ''),
    enabled: token !== null,
    retry: false,
    staleTime: Infinity,
  })

  if (!token) {
    return (
      <Quadro titulo="Link incompleto">
        <p className="text-body text-content-muted">
          Abra de novo o link do e-mail, sem cortar nenhuma parte. Se não der certo, peça outro
          convite a quem convidou você.
        </p>
      </Quadro>
    )
  }

  if (convite.isPending) {
    return (
      <Quadro titulo="Abrindo o convite…">
        <p role="status" className="text-body text-content-muted">
          Só um instante.
        </p>
      </Quadro>
    )
  }

  if (convite.isError) {
    const erro = convite.error
    const doConvite = erro instanceof ApiError && [400, 403].includes(erro.status)
    const titulo = !doConvite
      ? 'Não deu para abrir o convite agora'
      : erro.code === 'INVITATION_EXPIRED'
        ? 'Este convite venceu'
        : erro.status === 403
          ? 'Este estabelecimento está suspenso'
          : 'Este convite não vale mais'
    return (
      <Quadro titulo={titulo}>
        <p role="alert" className="text-body text-content-muted">
          {doConvite
            ? erro.message
            : 'Não foi possível falar com o servidor. Confira a conexão e tente de novo.'}
        </p>
        {doConvite ? (
          <Link to="/entrar" className={botao}>
            Entrar no painel
          </Link>
        ) : (
          <button type="button" onClick={() => void convite.refetch()} className={botao}>
            Tentar de novo
          </button>
        )}
      </Quadro>
    )
  }

  return <FormularioDoAceite token={token} convite={convite.data} />
}

/** A frase de uma falha no aceite. As da API já falam com a pessoa. */
function mensagemDaFalha(erro: unknown): string {
  if (!(erro instanceof ApiError)) return 'Não foi possível aceitar agora. Tente de novo.'
  if (erro.status === 429) return 'Muitas tentativas. Aguarde um minuto e tente de novo.'
  if ([400, 401, 403, 409].includes(erro.status)) return erro.message
  return 'Não foi possível aceitar agora. Tente de novo.'
}

function FormularioDoAceite({ token, convite }: { token: string; convite: ConviteParaAceitar }) {
  const navigate = useNavigate()
  const idDaSenha = useId()
  const idDasRegras = `${idDaSenha}-regras`
  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [erros, setErros] = useState<{ nome?: string; senha?: string }>({})
  const [falha, setFalha] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const temConta = convite.accountExists

  function conferir(): boolean {
    const novos: { nome?: string; senha?: string } = {}
    if (temConta) {
      if (!senha) novos.senha = 'Informe a senha da sua conta.'
    } else {
      if (nome.trim().length < 2) novos.nome = 'Informe o seu nome.'
      const regras = senhaSchema.safeParse(senha)
      if (!regras.success) novos.senha = regras.error.issues[0]?.message ?? 'Senha inválida.'
    }
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    setFalha(null)
    if (!conferir()) return

    setEnviando(true)
    try {
      const slug = await aceitarConvite(
        token,
        temConta ? { password: senha } : { name: nome.trim(), password: senha },
      )
      void navigate(caminhoDoPainel(slug), { replace: true })
    } catch (erro) {
      // A senha que não confere é do campo; o resto, do convite.
      if (erro instanceof ApiError && erro.status === 401) setErros({ senha: erro.message })
      else setFalha(mensagemDaFalha(erro))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <SiteLayout>
      <main className="mx-auto flex max-w-md flex-col gap-section-y px-page-x py-section-y">
        <div className="flex flex-col gap-1">
          <h1 className="text-heading text-content">Convite para a equipe</h1>
          <p className="text-body text-content-muted">
            {convite.invitedBy ? `${convite.invitedBy} convidou você` : 'Você recebeu um convite'}{' '}
            para a equipe de <strong className="text-content">{convite.establishment.name}</strong>,
            com o perfil <strong className="text-content">{convite.profile}</strong>.
          </p>
        </div>

        <form
          noValidate
          onSubmit={(e) => void aoEnviar(e)}
          className="flex flex-col gap-stack rounded-card bg-surface p-card shadow-card"
        >
          <p className="text-body text-content">
            {temConta
              ? `Você já tem conta no ${product.name}. Entre com a sua senha para aceitar.`
              : `Crie a sua conta para aceitar. Com ela, você entra no painel deste estabelecimento — e no de outros que convidarem você.`}
          </p>
          <TextField
            rotulo="E-mail"
            type="email"
            autoComplete="username"
            value={convite.email}
            readOnly
            dica="É o e-mail do convite."
          />
          {!temConta && (
            <TextField
              rotulo="Seu nome"
              autoComplete="name"
              value={nome}
              erro={erros.nome}
              onChange={(e) => {
                setNome(e.target.value)
              }}
            />
          )}
          <div className="flex flex-col gap-1">
            <TextField
              id={idDaSenha}
              rotulo={temConta ? 'Senha' : 'Crie uma senha'}
              type="password"
              autoComplete={temConta ? 'current-password' : 'new-password'}
              value={senha}
              erro={erros.senha}
              // As regras ficam embaixo do campo, e quem usa leitor de tela as
              // ouve junto com ele — e o erro, quando há.
              {...(!temConta && {
                'aria-describedby': [idDasRegras, erros.senha && `${idDaSenha}-erro`]
                  .filter(Boolean)
                  .join(' '),
              })}
              onChange={(e) => {
                setSenha(e.target.value)
              }}
            />
            {!temConta && <PasswordRules id={idDasRegras} senha={senha} />}
          </div>
          {falha && (
            <p role="alert" className="text-caption text-danger">
              {falha}
            </p>
          )}
          <button type="submit" disabled={enviando} className={botao}>
            {enviando ? 'Entrando…' : temConta ? 'Aceitar e entrar' : 'Criar conta e entrar'}
          </button>
        </form>
      </main>
    </SiteLayout>
  )
}
