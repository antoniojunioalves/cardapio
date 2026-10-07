import { zodResolver } from '@hookform/resolvers/zod'
import { useId } from 'react'
import { useForm } from 'react-hook-form'

import { TextAreaField } from '@/components/TextAreaField'
import { TextField } from '@/components/TextField'
import { ApiError } from '@/services/api'

import {
  CATEGORIA_NOVA,
  categoriaParaFormulario,
  formularioDeCategoriaSchema,
  useSalvarCategoria,
  type Categoria,
  type DadosDaCategoria,
  type ValoresDaCategoria,
} from '../catalog'
import { Marcavel } from './form-parts'
import { FormSheet } from './FormSheet'

/** O código com que a API recusa um nome de categoria que já existe. */
const NOME_REPETIDO = 'CATEGORY_NAME_TAKEN'

interface CategorySheetProps {
  slug: string
  /** Sem ela, a janela cria uma categoria nova. */
  categoria?: Categoria | undefined
  aoFechar: () => void
  /** A categoria foi gravada: quem abriu a janela a fecha e avisa. */
  aoSalvar: (categoria: Categoria) => void
}

/**
 * A janela de criar ou editar uma categoria — o nome, a descrição e se ela
 * aparece no cardápio —, aberta sobre a lista do cardápio: por "Nova
 * categoria" e pelo lápis de cada uma.
 */
export function CategorySheet({ slug, categoria, aoFechar, aoSalvar }: CategorySheetProps) {
  const id = useId()
  const salvar = useSalvarCategoria(slug)
  const { register, formState, handleSubmit, setError } = useForm<
    ValoresDaCategoria,
    unknown,
    DadosDaCategoria
  >({
    resolver: zodResolver(formularioDeCategoriaSchema),
    defaultValues: categoria ? categoriaParaFormulario(categoria) : CATEGORIA_NOVA,
    mode: 'onTouched',
  })
  const erros = formState.errors

  function aoEnviar(dados: DadosDaCategoria) {
    salvar.mutate(
      { id: categoria?.id, dados },
      {
        onSuccess: aoSalvar,
        onError: (erro) => {
          if (erro instanceof ApiError && erro.code === NOME_REPETIDO) {
            setError('name', { message: 'Já existe uma categoria com esse nome.' })
          }
        },
      },
    )
  }

  return (
    <FormSheet
      titulo={categoria ? 'Editar categoria' : 'Nova categoria'}
      formulario={id}
      aoFechar={aoFechar}
      alterado={formState.isDirty}
      criando={!categoria}
      envio={salvar}
      rotulo={categoria ? 'Salvar alterações' : 'Criar categoria'}
      explicarFalha={(erro) =>
        erro instanceof ApiError && erro.code === NOME_REPETIDO
          ? 'Confira os campos marcados e tente de novo.'
          : erro instanceof ApiError && erro.status === 404
            ? 'Esta categoria foi excluída. Feche a janela.'
            : null
      }
    >
      <form
        id={id}
        noValidate
        onSubmit={(evento) => void handleSubmit(aoEnviar)(evento)}
        className="flex flex-col gap-stack"
      >
        <TextField
          rotulo="Nome da categoria"
          placeholder="Lanches"
          erro={erros.name?.message}
          {...register('name')}
        />
        <TextAreaField
          rotulo="Descrição da categoria"
          dica="Opcional. Aparece abaixo do nome da categoria no cardápio."
          erro={erros.description?.message}
          {...register('description')}
        />
        <Marcavel
          type="checkbox"
          titulo="Mostrar no cardápio"
          descricao="Desmarque para esconder a categoria inteira do cardápio, sem excluir os produtos dela."
          {...register('isActive')}
        />
      </form>
    </FormSheet>
  )
}
