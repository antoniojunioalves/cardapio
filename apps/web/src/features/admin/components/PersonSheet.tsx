import { zodResolver } from '@hookform/resolvers/zod'
import { useId } from 'react'
import { useForm } from 'react-hook-form'

import { SelectField } from '@/components/SelectField'
import { TextField } from '@/components/TextField'
import { ApiError } from '@/services/api'

import {
  CONVITE_NOVO,
  formularioDeConviteSchema,
  formularioDePessoaSchema,
  useAlterarPessoa,
  useConvidar,
  type DadosDaPessoa,
  type DadosDoConvite,
  type EnvioDoConvite,
  type Perfil,
  type Pessoa,
  type ValoresDaPessoa,
  type ValoresDoConvite,
} from '../team'
import { FormSheet } from './FormSheet'

/**
 * As recusas que só a API vê — o limite do plano, um perfil fora do alcance de
 * quem está logado. A mensagem dela já é escrita para quem usa o painel.
 */
const explicarRecusa = (erro: unknown) =>
  erro instanceof ApiError && [403, 404, 409, 429].includes(erro.status) ? erro.message : null

/** As recusas que são do e-mail digitado: ele já está na equipe, ou já tem convite. */
const DO_EMAIL = new Set(['USER_ALREADY_MEMBER', 'INVITATION_PENDING'])
const doEmail = (erro: unknown): erro is ApiError =>
  erro instanceof ApiError && erro.code !== null && DO_EMAIL.has(erro.code)

interface InviteSheetProps {
  slug: string
  /** Os perfis que a pessoa logada pode dar: só os que ela alcança. */
  perfis: readonly Perfil[]
  aoFechar: () => void
  aoConvidar: (envio: EnvioDoConvite) => void
}

/**
 * A janela de convidar uma pessoa: o e-mail para onde vai o link e o perfil.
 * O nome e a senha são da pessoa, e ela os escolhe ao aceitar — ou entra com os
 * que já usa, se trabalha em outro estabelecimento.
 */
export function InviteSheet({ slug, perfis, aoFechar, aoConvidar }: InviteSheetProps) {
  const id = useId()
  const convidar = useConvidar(slug)
  const { register, formState, handleSubmit, setError } = useForm<
    ValoresDoConvite,
    unknown,
    DadosDoConvite
  >({
    resolver: zodResolver(formularioDeConviteSchema),
    defaultValues: CONVITE_NOVO,
    mode: 'onTouched',
  })
  const erros = formState.errors

  function aoEnviar(dados: DadosDoConvite) {
    convidar.mutate(dados, {
      onSuccess: aoConvidar,
      onError: (erro) => {
        if (doEmail(erro)) setError('email', { message: erro.message })
      },
    })
  }

  return (
    <FormSheet
      titulo="Convidar pessoa"
      formulario={id}
      aoFechar={aoFechar}
      alterado={formState.isDirty}
      criando
      envio={convidar}
      rotulo="Enviar convite"
      explicarFalha={(erro) =>
        doEmail(erro) ? 'Confira os campos marcados e tente de novo.' : explicarRecusa(erro)
      }
    >
      <form
        id={id}
        noValidate
        onSubmit={(evento) => void handleSubmit(aoEnviar)(evento)}
        className="flex flex-col gap-stack"
      >
        <TextField
          rotulo="E-mail"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          dica="A pessoa recebe um link para entrar. Se ela já usa o painel em outro estabelecimento, entra com a mesma senha de lá."
          erro={erros.email?.message}
          {...register('email')}
        />
        <SelectField
          rotulo="Perfil"
          dica="O que a pessoa pode fazer no painel. Os perfis se ajustam na aba Perfis."
          erro={erros.profileId?.message}
          {...register('profileId')}
        >
          <option value="">Escolha um perfil</option>
          {perfis.map((perfil) => (
            <option key={perfil.id} value={perfil.id}>
              {perfil.name}
            </option>
          ))}
        </SelectField>
      </form>
    </FormSheet>
  )
}

interface PersonSheetProps {
  slug: string
  pessoa: Pessoa
  /** Os perfis que a pessoa logada pode dar: só os que ela alcança. */
  perfis: readonly Perfil[]
  aoFechar: () => void
  aoSalvar: (pessoa: Pessoa) => void
}

/**
 * A janela de mudar o perfil de uma pessoa. O nome e o e-mail aparecem, mas
 * não se mudam: são da conta dela. Só abre para quem tem perfil para mudar —
 * nem o proprietário, que tem todas as permissões, nem a própria pessoa logada.
 */
export function PersonSheet({ slug, pessoa, perfis, aoFechar, aoSalvar }: PersonSheetProps) {
  const id = useId()
  const alterar = useAlterarPessoa(slug)
  const { register, formState, handleSubmit } = useForm<ValoresDaPessoa, unknown, DadosDaPessoa>({
    resolver: zodResolver(formularioDePessoaSchema),
    defaultValues: { profileId: pessoa.profile?.id ?? '' },
    mode: 'onTouched',
  })
  const erros = formState.errors

  function aoEnviar(dados: DadosDaPessoa) {
    // Quem está sem perfil pode continuar assim: sem um escolhido, não há o que mudar.
    if (!dados.profileId) {
      aoSalvar(pessoa)
      return
    }
    alterar.mutate(
      { id: pessoa.id, dados: { profileId: dados.profileId } },
      { onSuccess: aoSalvar },
    )
  }

  return (
    <FormSheet
      titulo={`Perfil de ${pessoa.name}`}
      formulario={id}
      aoFechar={aoFechar}
      alterado={formState.isDirty}
      criando={false}
      envio={alterar}
      rotulo="Salvar alterações"
      explicarFalha={explicarRecusa}
    >
      <form
        id={id}
        noValidate
        onSubmit={(evento) => void handleSubmit(aoEnviar)(evento)}
        className="flex flex-col gap-stack"
      >
        <div className="flex flex-col gap-1">
          <p className="text-body font-semibold text-content">Nome e e-mail</p>
          <p className="text-body break-words text-content">{pessoa.name}</p>
          <p className="text-body break-all text-content-muted">{pessoa.email}</p>
          <p className="text-caption text-content-muted">São da conta da pessoa: só ela os muda.</p>
        </div>
        <SelectField
          rotulo="Perfil"
          dica="Vale na hora: a pessoa não precisa entrar de novo."
          erro={erros.profileId?.message}
          {...register('profileId')}
        >
          {/* Sem perfil, a pessoa entra no painel e não vê nada. */}
          {!pessoa.profile && <option value="">Sem perfil</option>}
          {perfis.map((perfil) => (
            <option key={perfil.id} value={perfil.id}>
              {perfil.name}
            </option>
          ))}
        </SelectField>
      </form>
    </FormSheet>
  )
}
