import { permissoesPorGrupo } from '@repo/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'

import { TextAreaField } from '@/components/TextAreaField'
import { TextField } from '@/components/TextField'
import { ApiError } from '@/services/api'

import {
  desmarcarPermissao,
  formularioDePerfilSchema,
  marcarPermissao,
  permissoesMudaram,
  quantasPessoas,
  useSalvarPerfil,
  type DadosDoPerfil,
  type Perfil,
  type ValoresDoPerfil,
} from '../team'
import { AvisoDeAtencao, AvisoDeSomenteLeitura, Marcavel } from './form-parts'
import { FormSheet } from './FormSheet'

/** O código com que a API recusa um nome de perfil que já existe. */
const NOME_REPETIDO = 'PROFILE_NAME_TAKEN'

interface ProfileSheetProps {
  slug: string
  /** Sem ele, a janela cria um perfil novo. */
  perfil?: Perfil | undefined
  /** As permissões de quem está logado: ninguém dá o que não tem. */
  minhasPermissoes: readonly string[]
  aoFechar: () => void
  aoSalvar: (perfil: Perfil) => void
}

/**
 * A janela de criar ou editar um perfil: o nome, a descrição e as permissões,
 * por grupo, na ordem do catálogo (`@repo/shared`).
 *
 * Marcar uma permissão marca a que ela exige — quem altera os produtos vê o
 * cardápio —, e desmarcar essa desmarca as que dependiam dela: o que está
 * marcado é o que será gravado. As permissões que a pessoa logada não tem
 * ficam desligadas.
 */
export function ProfileSheet({
  slug,
  perfil,
  minhasPermissoes,
  aoFechar,
  aoSalvar,
}: ProfileSheetProps) {
  const id = useId()
  const salvar = useSalvarPerfil(slug)
  const { register, formState, handleSubmit, setError } = useForm<
    ValoresDoPerfil,
    unknown,
    Omit<DadosDoPerfil, 'permissions'>
  >({
    resolver: zodResolver(formularioDePerfilSchema),
    defaultValues: { name: perfil?.name ?? '', description: perfil?.description ?? '' },
    mode: 'onTouched',
  })
  const erros = formState.errors
  // As do perfil, inteiras — inclusive as que ainda não têm tela e não aparecem aqui.
  const gravadas = perfil?.permissions ?? []
  const [marcadas, setMarcadas] = useState<readonly string[]>(gravadas)
  const grupos = permissoesPorGrupo()
  const foraDoAlcance = grupos.some(({ permissoes }) =>
    permissoes.some((p) => !minhasPermissoes.includes(p.codigo)),
  )

  function aoEnviar(dados: Omit<DadosDoPerfil, 'permissions'>) {
    salvar.mutate(
      { id: perfil?.id, dados: { ...dados, permissions: [...marcadas] } },
      {
        onSuccess: aoSalvar,
        onError: (erro) => {
          if (erro instanceof ApiError && erro.code === NOME_REPETIDO) {
            setError('name', { message: 'Já existe um perfil com esse nome.' })
          }
        },
      },
    )
  }

  return (
    <FormSheet
      titulo={perfil ? 'Editar perfil' : 'Novo perfil'}
      formulario={id}
      aoFechar={aoFechar}
      alterado={formState.isDirty || permissoesMudaram(gravadas, marcadas)}
      criando={!perfil}
      envio={salvar}
      rotulo={perfil ? 'Salvar alterações' : 'Criar perfil'}
      explicarFalha={(erro) => {
        if (!(erro instanceof ApiError)) return null
        if (erro.code === NOME_REPETIDO) return 'Confira os campos marcados e tente de novo.'
        if (erro.status === 404) return 'Este perfil foi excluído. Feche a janela.'
        // Fora do alcance, ou o perfil de quem está logado: a API explica.
        return erro.status === 403 ? erro.message : null
      }}
    >
      <form
        id={id}
        noValidate
        onSubmit={(evento) => void handleSubmit(aoEnviar)(evento)}
        className="flex flex-col gap-stack"
      >
        {perfil && perfil.users > 0 && (
          <AvisoDeAtencao>
            {perfil.users === 1 ? 'Uma pessoa tem' : `${quantasPessoas(perfil.users)} têm`} este
            perfil. O que você mudar aqui vale na hora, sem ninguém precisar entrar de novo.
          </AvisoDeAtencao>
        )}

        <TextField
          rotulo="Nome do perfil"
          placeholder="Caixa"
          erro={erros.name?.message}
          {...register('name')}
        />
        <TextAreaField
          rotulo="Descrição"
          dica="Opcional. Para quem for escolher o perfil de uma pessoa saber para que ele serve."
          erro={erros.description?.message}
          {...register('description')}
        />

        {foraDoAlcance && (
          <AvisoDeSomenteLeitura texto="As permissões desligadas são as que o seu perfil não tem: ninguém dá o que não tem." />
        )}

        {grupos.map(({ grupo, permissoes }) => (
          <fieldset
            key={grupo.codigo}
            className="flex min-w-0 flex-col gap-3 border-t border-border pt-stack"
          >
            <legend className="text-body float-left mb-3 w-full font-semibold text-content">
              {grupo.nome}
            </legend>
            {permissoes.map((permissao) => (
              <Marcavel
                key={permissao.codigo}
                type="checkbox"
                titulo={permissao.nome}
                descricao={permissao.descricao}
                checked={marcadas.includes(permissao.codigo)}
                disabled={!minhasPermissoes.includes(permissao.codigo)}
                onChange={(evento) => {
                  setMarcadas(
                    evento.target.checked
                      ? marcarPermissao(marcadas, permissao.codigo)
                      : desmarcarPermissao(marcadas, permissao.codigo),
                  )
                }}
              />
            ))}
          </fieldset>
        ))}
      </form>
    </FormSheet>
  )
}
