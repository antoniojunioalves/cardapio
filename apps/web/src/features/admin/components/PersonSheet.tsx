import { zodResolver } from '@hookform/resolvers/zod'
import { useId } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { SelectField } from '@/components/SelectField'
import { TextField } from '@/components/TextField'
import { PasswordRules } from '@/features/signup/components/PasswordRules'
import { ApiError } from '@/services/api'

import {
  formularioDePessoaNovaSchema,
  formularioDePessoaSchema,
  PESSOA_NOVA,
  useAlterarPessoa,
  useCriarPessoa,
  type DadosDaPessoa,
  type DadosDaPessoaNova,
  type Perfil,
  type Pessoa,
  type ValoresDaPessoa,
  type ValoresDaPessoaNova,
} from '../team'
import { FormSheet } from './FormSheet'

/**
 * As recusas que só a API vê — o e-mail em uso, o limite do plano, um perfil
 * fora do alcance de quem está logado. A mensagem dela já é escrita para quem
 * usa o painel.
 */
const explicarRecusa = (erro: unknown) =>
  erro instanceof ApiError && [403, 404, 409].includes(erro.status) ? erro.message : null

interface NewPersonSheetProps {
  slug: string
  /** Os perfis que a pessoa logada pode dar: só os que ela alcança. */
  perfis: readonly Perfil[]
  aoFechar: () => void
  aoSalvar: (pessoa: Pessoa) => void
}

/**
 * A janela de cadastrar uma pessoa: o nome, o e-mail com que ela entra, a
 * senha inicial e o perfil. Não há convite por e-mail: quem cadastra passa a
 * senha à pessoa — por isso ela fica à vista enquanto é digitada.
 */
export function NewPersonSheet({ slug, perfis, aoFechar, aoSalvar }: NewPersonSheetProps) {
  const id = useId()
  const criar = useCriarPessoa(slug)
  const { register, control, formState, handleSubmit, setError } = useForm<
    ValoresDaPessoaNova,
    unknown,
    DadosDaPessoaNova
  >({
    resolver: zodResolver(formularioDePessoaNovaSchema),
    defaultValues: PESSOA_NOVA,
    mode: 'onTouched',
  })
  const erros = formState.errors
  const senha = useWatch({ control, name: 'password' })

  function aoEnviar(dados: DadosDaPessoaNova) {
    criar.mutate(dados, {
      onSuccess: aoSalvar,
      onError: (erro) => {
        if (erro instanceof ApiError && erro.code === 'USER_EMAIL_TAKEN') {
          setError('email', { message: 'Este e-mail já está em uso.' })
        }
      },
    })
  }

  return (
    <FormSheet
      titulo="Nova pessoa"
      formulario={id}
      aoFechar={aoFechar}
      alterado={formState.isDirty}
      criando
      envio={criar}
      rotulo="Cadastrar pessoa"
      explicarFalha={(erro) =>
        erro instanceof ApiError && erro.code === 'USER_EMAIL_TAKEN'
          ? 'Confira os campos marcados e tente de novo.'
          : explicarRecusa(erro)
      }
    >
      <form
        id={id}
        noValidate
        onSubmit={(evento) => void handleSubmit(aoEnviar)(evento)}
        className="flex flex-col gap-stack"
      >
        <TextField
          rotulo="Nome"
          autoComplete="off"
          erro={erros.name?.message}
          {...register('name')}
        />
        <TextField
          rotulo="E-mail"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          dica="É com ele que a pessoa entra no painel."
          erro={erros.email?.message}
          {...register('email')}
        />
        <div className="flex flex-col gap-1">
          <TextField
            rotulo="Senha inicial"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            dica="Passe a senha à pessoa: ela entra com o e-mail e esta senha."
            erro={erros.password?.message}
            {...register('password')}
          />
          <PasswordRules id={`${id}-regras`} senha={senha} />
        </div>
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
  /** É a própria pessoa logada: ela muda o nome, e não o perfil. */
  souEu: boolean
  aoFechar: () => void
  aoSalvar: (pessoa: Pessoa) => void
}

/**
 * A janela de editar uma pessoa: o nome e o perfil. Ninguém muda o próprio
 * perfil, e o proprietário não tem um — tem sempre todas as permissões.
 */
export function PersonSheet({ slug, pessoa, perfis, souEu, aoFechar, aoSalvar }: PersonSheetProps) {
  const id = useId()
  const alterar = useAlterarPessoa(slug)
  const { register, formState, handleSubmit } = useForm<ValoresDaPessoa, unknown, DadosDaPessoa>({
    resolver: zodResolver(formularioDePessoaSchema),
    defaultValues: { name: pessoa.name, profileId: pessoa.profile?.id ?? '' },
    mode: 'onTouched',
  })
  const erros = formState.errors
  const perfilFixo = souEu || pessoa.isOwner

  function aoEnviar(dados: DadosDaPessoa) {
    alterar.mutate(
      {
        id: pessoa.id,
        // O perfil só vai quando pode mudar — o da própria pessoa a API recusa —
        // e quando há um escolhido: quem está sem perfil pode continuar assim.
        dados: {
          name: dados.name,
          ...(!perfilFixo && dados.profileId && { profileId: dados.profileId }),
        },
      },
      { onSuccess: aoSalvar },
    )
  }

  return (
    <FormSheet
      titulo={`Editar ${pessoa.name}`}
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
        <TextField
          rotulo="Nome"
          autoComplete="off"
          erro={erros.name?.message}
          {...register('name')}
        />
        <div className="flex flex-col gap-1">
          <p className="text-body font-semibold text-content">E-mail</p>
          <p className="text-body break-all text-content-muted">{pessoa.email}</p>
        </div>
        {pessoa.isOwner ? (
          <div className="flex flex-col gap-1">
            <p className="text-body font-semibold text-content">Perfil</p>
            <p className="text-body text-content-muted">
              Proprietário: tem sempre todas as permissões.
            </p>
          </div>
        ) : (
          <SelectField
            rotulo="Perfil"
            dica={
              souEu
                ? 'Você não muda o seu próprio perfil: peça a outra pessoa da equipe.'
                : 'Vale na hora: a pessoa não precisa entrar de novo.'
            }
            disabled={souEu}
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
        )}
      </form>
    </FormSheet>
  )
}
