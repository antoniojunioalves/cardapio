import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'

import { TextAreaField } from '@/components/TextAreaField'
import { TextField } from '@/components/TextField'
import { ApiError } from '@/services/api'

import {
  AO_EXCLUIR,
  CATEGORIA_NOVA,
  categoriaParaFormulario,
  formularioDeCategoriaSchema,
  porQueNaoExcluirCategoria,
  useExcluirCategoria,
  useSalvarCategoria,
  type Categoria,
  type DadosDaCategoria,
  type ValoresDaCategoria,
} from '../catalog'
import { caminhoDoPainel } from '../menu'
import { Excluir } from './catalog-parts'
import { AvisoDeSomenteLeitura, Marcavel, RodapeDeSalvar, Secao } from './form-parts'

interface CategoryFormProps {
  slug: string
  /** Sem ela, o formulário cria uma categoria nova. */
  categoria?: Categoria | undefined
  /** Quantos produtos ela tem: com algum, a categoria não pode ser excluída. */
  produtos?: number
  podeEditar: boolean
  podeExcluir?: boolean
}

const NOME_REPETIDO = 'CATEGORY_NAME_TAKEN'

/** Criar ou editar uma categoria: nome, descrição e se ela aparece no cardápio. */
export function CategoryForm({
  slug,
  categoria,
  produtos = 0,
  podeEditar,
  podeExcluir = false,
}: CategoryFormProps) {
  const navigate = useNavigate()
  const salvar = useSalvarCategoria(slug)
  const excluir = useExcluirCategoria(slug)
  const { register, formState, handleSubmit, reset, setError } = useForm<
    ValoresDaCategoria,
    unknown,
    DadosDaCategoria
  >({
    resolver: zodResolver(formularioDeCategoriaSchema),
    defaultValues: categoria ? categoriaParaFormulario(categoria) : CATEGORIA_NOVA,
    mode: 'onTouched',
  })
  const erros = formState.errors
  const voltar = (aviso: string, abrir?: string) => {
    void navigate(caminhoDoPainel(slug, 'cardapio'), { state: { aviso, abrir } })
  }

  function aoEnviar(dados: DadosDaCategoria) {
    salvar.mutate(
      { id: categoria?.id, dados },
      {
        onSuccess: (salva) => {
          if (categoria) reset(categoriaParaFormulario(salva))
          // A lista chega com ela aberta, pronta para o primeiro produto.
          else voltar(`Categoria “${salva.name}” criada.`, salva.id)
        },
        onError: (erro) => {
          if (erro instanceof ApiError && erro.code === NOME_REPETIDO) {
            setError('name', { message: 'Já existe uma categoria com esse nome.' })
          }
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-section-y">
      <form
        noValidate
        onSubmit={(evento) => void handleSubmit(aoEnviar)(evento)}
        className="flex flex-col gap-section-y"
      >
        {!podeEditar && (
          <AvisoDeSomenteLeitura texto="Você pode ver o cardápio, mas só quem administra o estabelecimento o altera." />
        )}

        <fieldset disabled={!podeEditar} className="min-w-0">
          <Secao titulo="Categoria">
            <TextField
              rotulo="Nome"
              placeholder="Lanches"
              erro={erros.name?.message}
              {...register('name')}
            />
            <TextAreaField
              rotulo="Descrição"
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
          </Secao>
        </fieldset>

        {podeEditar && (
          <RodapeDeSalvar
            envio={salvar}
            // Criando, o botão fica ligado: clicar mostra o que falta preencher.
            alterado={categoria ? formState.isDirty : true}
            sucesso="Categoria salva."
            rotulo={categoria ? 'Salvar alterações' : 'Criar categoria'}
            explicarFalha={(erro) =>
              erro instanceof ApiError && erro.code === NOME_REPETIDO
                ? 'Confira os campos marcados e tente de novo.'
                : erro instanceof ApiError && erro.status === 404
                  ? 'Esta categoria foi excluída. Volte ao cardápio.'
                  : null
            }
          />
        )}
      </form>

      {categoria && podeExcluir && (
        <Excluir
          oQue="a categoria"
          nome={categoria.name}
          consequencia={AO_EXCLUIR.categoria}
          impedimento={porQueNaoExcluirCategoria(produtos)}
          excluir={excluir}
          aoConfirmar={() => {
            excluir.mutate(categoria.id, {
              onSuccess: () => {
                voltar(`Categoria “${categoria.name}” excluída.`)
              },
            })
          }}
        />
      )}
    </div>
  )
}
