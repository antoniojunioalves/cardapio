import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { TextField } from '@/components/TextField'
import {
  formularioDaSenhaSchema,
  formularioDoNomeSchema,
  SENHA_EM_BRANCO,
  useRenomearConta,
  useTrocarSenha,
  type DadosDaSenha,
  type DadosDoNome,
  type ValoresDaSenha,
  type ValoresDoNome,
} from '@/features/admin/account'
import { botaoPrincipal } from '@/features/admin/components/form-parts'
import { usePainel } from '@/features/admin/panel'
import { PasswordRules } from '@/features/signup/components/PasswordRules'
import { ApiError } from '@/services/api'

const cartao = 'flex flex-col gap-stack rounded-card bg-surface p-card shadow-card'

/** A frase de uma falha. As recusas da API — o limite de tentativas — já falam com a pessoa. */
function mensagemDaFalha(erro: unknown): string {
  if (erro instanceof ApiError && erro.status === 429) {
    return 'Muitas tentativas. Aguarde um minuto e tente de novo.'
  }
  return 'Não foi possível salvar agora. Tente de novo.'
}

/**
 * "Minha conta", em `/{tenantSlug}/admin/minha-conta`: o nome e a senha da
 * própria pessoa. De todo mundo do painel, sem permissão nenhuma — a conta é
 * dela —, e valendo em todos os estabelecimentos em que ela trabalha.
 *
 * O e-mail aparece, mas não se muda por aqui (ROADMAP).
 */
export function AdminAccountPage() {
  const { usuario } = usePainel()

  useEffect(() => {
    document.title = 'Minha conta'
  }, [])

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-section-y">
      <div className="flex flex-col gap-1">
        <h1 className="text-heading text-content">Minha conta</h1>
        <p className="text-body text-content-muted">
          O nome e a senha são seus, e valem em todos os estabelecimentos em que você trabalha.
        </p>
      </div>
      <SeusDados nome={usuario.name} email={usuario.email} />
      <SuaSenha email={usuario.email} />
    </div>
  )
}

function SeusDados({ nome, email }: { nome: string; email: string }) {
  const idDoTitulo = useId()
  const renomear = useRenomearConta()
  const [salvo, setSalvo] = useState(false)
  const { register, formState, handleSubmit, reset } = useForm<ValoresDoNome, unknown, DadosDoNome>(
    {
      resolver: zodResolver(formularioDoNomeSchema),
      defaultValues: { name: nome },
      mode: 'onTouched',
    },
  )

  function aoEnviar(dados: DadosDoNome) {
    setSalvo(false)
    renomear.mutate(dados, {
      onSuccess: (usuario) => {
        reset({ name: usuario.name })
        setSalvo(true)
      },
    })
  }

  return (
    <section aria-labelledby={idDoTitulo} className={cartao}>
      <h2 id={idDoTitulo} className="text-body font-semibold text-content">
        Seus dados
      </h2>
      <form
        noValidate
        onSubmit={(evento) => void handleSubmit(aoEnviar)(evento)}
        className="flex flex-col gap-stack"
      >
        <TextField
          rotulo="Nome"
          autoComplete="name"
          dica="É como a equipe vê você, em todos os estabelecimentos."
          erro={formState.errors.name?.message}
          {...register('name', {
            onChange: () => {
              setSalvo(false)
            },
          })}
        />
        <TextField
          rotulo="E-mail"
          type="email"
          value={email}
          readOnly
          dica="É com ele que você entra no painel."
        />
        {salvo && (
          <p role="status" className="text-caption font-semibold text-success">
            Nome salvo.
          </p>
        )}
        {renomear.isError && (
          <p role="alert" className="text-caption text-danger">
            {mensagemDaFalha(renomear.error)}
          </p>
        )}
        <button
          type="submit"
          disabled={!formState.isDirty || renomear.isPending}
          className={`${botaoPrincipal} sm:self-start`}
        >
          {renomear.isPending ? 'Salvando…' : 'Salvar nome'}
        </button>
      </form>
    </section>
  )
}

function SuaSenha({ email }: { email: string }) {
  const idDoTitulo = useId()
  const idDaNova = useId()
  const idDasRegras = `${idDaNova}-regras`
  const trocar = useTrocarSenha()
  const [trocada, setTrocada] = useState(false)
  const { register, control, formState, handleSubmit, reset, setError } = useForm<
    ValoresDaSenha,
    unknown,
    DadosDaSenha
  >({
    resolver: zodResolver(formularioDaSenhaSchema),
    defaultValues: SENHA_EM_BRANCO,
    mode: 'onTouched',
  })
  const erros = formState.errors
  const nova = useWatch({ control, name: 'nova' })

  function aoEnviar(dados: DadosDaSenha) {
    setTrocada(false)
    trocar.mutate(dados, {
      onSuccess: () => {
        reset(SENHA_EM_BRANCO)
        setTrocada(true)
      },
      onError: (erro) => {
        // As duas recusas que são de um campo vão para ele; o resto, para baixo do formulário.
        if (erro instanceof ApiError && erro.code === 'CURRENT_PASSWORD_INVALID') {
          setError('atual', { message: erro.message }, { shouldFocus: true })
        } else if (erro instanceof ApiError && erro.code === 'SAME_PASSWORD') {
          setError('nova', { message: erro.message }, { shouldFocus: true })
        }
      },
    })
  }

  const falhaGeral =
    trocar.isError &&
    !(
      trocar.error instanceof ApiError &&
      ['CURRENT_PASSWORD_INVALID', 'SAME_PASSWORD'].includes(trocar.error.code ?? '')
    )

  return (
    <section aria-labelledby={idDoTitulo} className={cartao}>
      <div className="flex flex-col gap-1">
        <h2 id={idDoTitulo} className="text-body font-semibold text-content">
          Senha
        </h2>
        <p className="text-caption text-content-muted">
          Ao trocar, você sai do painel nos outros aparelhos — e nos outros estabelecimentos. Neste,
          você continua.
        </p>
      </div>
      <form
        noValidate
        onSubmit={(evento) => void handleSubmit(aoEnviar)(evento)}
        className="flex flex-col gap-stack"
      >
        {/* Para o gerenciador de senhas saber de qual conta é a senha nova. */}
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        <TextField
          rotulo="Senha atual"
          type="password"
          autoComplete="current-password"
          erro={erros.atual?.message}
          {...register('atual', {
            onChange: () => {
              setTrocada(false)
            },
          })}
        />
        <div className="flex flex-col gap-1">
          <TextField
            id={idDaNova}
            rotulo="Senha nova"
            type="password"
            autoComplete="new-password"
            erro={erros.nova?.message}
            aria-describedby={[idDasRegras, erros.nova && `${idDaNova}-erro`]
              .filter(Boolean)
              .join(' ')}
            {...register('nova')}
          />
          <PasswordRules id={idDasRegras} senha={nova} />
        </div>
        {trocada && (
          <p role="status" className="text-caption font-semibold text-success">
            Senha trocada. Nos outros aparelhos, é preciso entrar de novo, com a senha nova.
          </p>
        )}
        {falhaGeral && (
          <p role="alert" className="text-caption text-danger">
            {mensagemDaFalha(trocar.error)}
          </p>
        )}
        <button
          type="submit"
          disabled={trocar.isPending}
          className={`${botaoPrincipal} sm:self-start`}
        >
          {trocar.isPending ? 'Trocando…' : 'Trocar senha'}
        </button>
      </form>
    </section>
  )
}
