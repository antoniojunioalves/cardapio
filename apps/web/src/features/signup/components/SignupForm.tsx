import { zodResolver } from '@hookform/resolvers/zod'
import { cadastroSchema, fusoValido, slugSchema, VERSAO_DOS_TERMOS } from '@repo/shared'
import { useEffect, useId, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'

import { TextField } from '@/components/TextField'
import { ApiError } from '@/services/api'

import { cadastrar, useDisponibilidadeDoEndereco, type EstabelecimentoCadastrado } from '../api'
import { sugerirSlug } from '../slug'
import { PasswordRules } from './PasswordRules'
import { useAtrasado } from '../useAtrasado'

/**
 * O formulário é o cadastro da API sem a versão dos termos e o fuso — que a
 * tela preenche sozinha — e com o aceite, que é uma caixa de marcar.
 */
const formularioSchema = cadastroSchema.omit({ termsVersion: true, timezone: true }).extend({
  aceite: z
    .boolean()
    .refine(Boolean, 'Para criar a conta, aceite os termos de uso e a política de privacidade.'),
})

type ValoresDoFormulario = z.input<typeof formularioSchema>
type DadosDoFormulario = z.output<typeof formularioSchema>
type Campo = keyof ValoresDoFormulario

const VALORES_INICIAIS: ValoresDoFormulario = {
  establishmentName: '',
  slug: '',
  ownerName: '',
  email: '',
  password: '',
  website: '',
  aceite: false,
}

/** O fuso deste aparelho, se o `Intl` o reconhece: é o palpite do fuso do estabelecimento. */
function fusoDoAparelho(): string | null {
  const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone
  return fuso && fusoValido(fuso) ? fuso : null
}

/**
 * Os erros de validação da API vêm por campo (`instancePath: "/slug"`). O
 * formulário valida com as mesmas regras, então isto só acontece quando algo
 * mudou entre a tela e o servidor — os termos, por exemplo.
 */
function errosPorCampo(detalhes: unknown): Partial<Record<Campo, string>> {
  if (!Array.isArray(detalhes)) return {}
  const erros: Partial<Record<Campo, string>> = {}
  for (const item of detalhes as { instancePath?: unknown; message?: unknown }[]) {
    if (typeof item.instancePath !== 'string' || typeof item.message !== 'string') continue
    const nome = item.instancePath.slice(1)
    const campo: Campo | null =
      nome === 'termsVersion' ? 'aceite' : nome in VALORES_INICIAIS ? (nome as Campo) : null
    if (campo) erros[campo] ??= item.message
  }
  return erros
}

/** O e-mail é o login, um por pessoa: quem já tem conta entra, em vez de se cadastrar de novo. */
const CONTA_EXISTENTE = 'conta-existente'

function mensagemDaFalha(erro: unknown): string {
  if (!(erro instanceof ApiError)) {
    return 'Não foi possível falar com o servidor. Confira a conexão e tente de novo.'
  }
  if (erro.status === 429) {
    return 'Muitos cadastros feitos desta rede na última hora. Tente de novo mais tarde.'
  }
  if (erro.status === 503) return erro.message
  return 'Não foi possível concluir o cadastro. Confira os dados e tente de novo.'
}

interface SignupFormProps {
  aoCadastrar: (estabelecimento: EstabelecimentoCadastrado) => void
}

export function SignupForm({ aoCadastrar }: SignupFormProps) {
  const form = useForm<ValoresDoFormulario, unknown, DadosDoFormulario>({
    resolver: zodResolver(formularioSchema),
    defaultValues: VALORES_INICIAIS,
    mode: 'onTouched',
  })
  const { register, control, formState, setValue, setError, handleSubmit } = form
  const erros = formState.errors
  const [falha, setFalha] = useState<string | null>(null)

  // O endereço acompanha o nome até a pessoa mexer nele; apagado, volta a acompanhar.
  const [enderecoEditado, setEnderecoEditado] = useState(false)
  const [nome, slug, senha] = useWatch({
    control,
    name: ['establishmentName', 'slug', 'password'],
  })

  useEffect(() => {
    if (!enderecoEditado) setValue('slug', sugerirSlug(nome ?? ''))
  }, [nome, enderecoEditado, setValue])

  const formatoValido = slugSchema.safeParse(slug ?? '')
  const aConsultar = useAtrasado(formatoValido.success ? formatoValido.data : null, 400)
  const disponibilidade = useDisponibilidadeDoEndereco(aConsultar)
  const verificando =
    formatoValido.success && (aConsultar !== formatoValido.data || disponibilidade.isFetching)
  const ocupado =
    disponibilidade.data && !disponibilidade.data.available ? disponibilidade.data : null

  const idDoEndereco = useId()
  const idDaSenha = useId()
  const endereco = register('slug', {
    onChange: (evento: { target: { value: string } }) => {
      setEnderecoEditado(evento.target.value !== '')
    },
  })

  async function aoEnviar(dados: DadosDoFormulario) {
    setFalha(null)
    if (ocupado?.slug === dados.slug) {
      setError('slug', { message: ocupado.reason ?? 'Este endereço já está em uso.' })
      return
    }

    const fuso = fusoDoAparelho()
    try {
      aoCadastrar(
        await cadastrar({
          establishmentName: dados.establishmentName,
          slug: dados.slug,
          ownerName: dados.ownerName,
          email: dados.email,
          password: dados.password,
          termsVersion: VERSAO_DOS_TERMOS,
          ...(fuso ? { timezone: fuso } : {}),
          ...(dados.website ? { website: dados.website } : {}),
        }),
      )
    } catch (erro) {
      if (erro instanceof ApiError && erro.code === 'SLUG_TAKEN') {
        setError('slug', { message: erro.message }, { shouldFocus: true })
        return
      }
      if (erro instanceof ApiError && erro.code === 'EMAIL_TAKEN') {
        setError('email', { type: CONTA_EXISTENTE, message: erro.message }, { shouldFocus: true })
        return
      }
      const porCampo = erro instanceof ApiError ? errosPorCampo(erro.details) : {}
      if (porCampo.aceite) setValue('aceite', false)
      for (const [campo, mensagem] of Object.entries(porCampo)) {
        setError(campo as Campo, { message: mensagem })
      }
      if (Object.keys(porCampo).length === 0) setFalha(mensagemDaFalha(erro))
    }
  }

  const statusDoEndereco = !formatoValido.success
    ? null
    : verificando
      ? { classe: 'text-content-muted', texto: 'Conferindo se está livre…' }
      : ocupado
        ? { classe: 'text-danger', texto: ocupado.reason ?? 'Este endereço já está em uso.' }
        : disponibilidade.data?.available
          ? { classe: 'text-success', texto: 'Endereço livre.' }
          : null

  return (
    <form
      noValidate
      onSubmit={(evento) => void handleSubmit(aoEnviar)(evento)}
      className="flex flex-col gap-stack rounded-card bg-surface p-card shadow-card"
    >
      <TextField
        rotulo="Nome do estabelecimento"
        autoComplete="organization"
        erro={erros.establishmentName?.message}
        {...register('establishmentName')}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor={idDoEndereco} className="text-body font-semibold text-content">
          Endereço do cardápio
        </label>
        <div
          className={`flex items-center overflow-hidden rounded-control border bg-surface ${
            erros.slug ? 'border-danger' : 'border-border'
          }`}
        >
          <span aria-hidden="true" className="text-body shrink-0 pl-3 text-content-muted">
            {window.location.host}/
          </span>
          <input
            id={idDoEndereco}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={erros.slug ? true : undefined}
            aria-describedby={`${idDoEndereco}-dica ${idDoEndereco}-status`}
            className="text-body min-w-0 flex-1 bg-transparent py-2 pr-3"
            {...endereco}
          />
        </div>
        <p id={`${idDoEndereco}-dica`} className="text-caption text-content-muted">
          É o link que você vai mandar para os clientes.
        </p>
        <p id={`${idDoEndereco}-status`} role="status" className="text-caption">
          {erros.slug ? (
            <span className="text-danger">{erros.slug.message}</span>
          ) : statusDoEndereco ? (
            <span className={statusDoEndereco.classe}>{statusDoEndereco.texto}</span>
          ) : null}
        </p>
      </div>

      <TextField
        rotulo="Seu nome"
        autoComplete="name"
        erro={erros.ownerName?.message}
        {...register('ownerName')}
      />
      <TextField
        rotulo="E-mail"
        type="email"
        autoComplete="email"
        dica="Enviamos um link para confirmar. O cardápio só vai ao ar depois disso."
        erro={erros.email?.message}
        {...register('email')}
      />
      {erros.email?.type === CONTA_EXISTENTE && (
        <Link to="/entrar" className="text-body font-semibold text-primary hover:underline">
          Entrar no painel
        </Link>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor={idDaSenha} className="text-body font-semibold text-content">
          Senha
        </label>
        <input
          id={idDaSenha}
          type="password"
          autoComplete="new-password"
          aria-invalid={erros.password ? true : undefined}
          aria-describedby={`${idDaSenha}-regras${erros.password ? ` ${idDaSenha}-erro` : ''}`}
          className={`text-body w-full rounded-control border bg-surface px-3 py-2 ${
            erros.password ? 'border-danger' : 'border-border'
          }`}
          {...register('password')}
        />
        <PasswordRules id={`${idDaSenha}-regras`} senha={senha ?? ''} />
        {erros.password && (
          <p id={`${idDaSenha}-erro`} className="text-caption text-danger">
            {erros.password.message}
          </p>
        )}
      </div>

      {/* Campo-armadilha: fora da tela e do leitor de tela. Quem o preenche é robô. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          Deixe este campo em branco
          <input tabIndex={-1} autoComplete="off" {...register('website')} />
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-body flex items-start gap-2 text-content">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0"
            aria-invalid={erros.aceite ? true : undefined}
            aria-describedby={erros.aceite ? 'erro-do-aceite' : undefined}
            {...register('aceite')}
          />
          <span>
            Li e aceito os{' '}
            <Link to="/termos" target="_blank" rel="noopener noreferrer" className="underline">
              termos de uso
            </Link>{' '}
            e a{' '}
            <Link to="/privacidade" target="_blank" rel="noopener noreferrer" className="underline">
              política de privacidade
            </Link>
            .
          </span>
        </label>
        {erros.aceite && (
          <p id="erro-do-aceite" className="text-caption text-danger">
            {erros.aceite.message}
          </p>
        )}
      </div>

      {falha && (
        <p role="alert" className="text-caption rounded-control bg-accent-50 p-3 text-accent-800">
          {falha}
        </p>
      )}

      <button
        type="submit"
        disabled={formState.isSubmitting}
        className="text-body rounded-control bg-primary px-4 py-3 font-semibold text-primary-content hover:bg-primary-hover disabled:opacity-50"
      >
        {formState.isSubmitting ? 'Criando a conta…' : 'Criar conta grátis'}
      </button>
    </form>
  )
}
