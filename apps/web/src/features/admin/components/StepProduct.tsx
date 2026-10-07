import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { SelectField } from '@/components/SelectField'
import { TextAreaField } from '@/components/TextAreaField'
import { TextField } from '@/components/TextField'
import { ApiError } from '@/services/api'

import {
  alteracaoDoProduto,
  formularioDeProdutoSchema,
  produtoNovo,
  produtoParaFormulario,
  useAlterarProduto,
  useCriarProduto,
  useImagemDoProduto,
  type Categoria,
  type DadosDoProduto,
  type Produto,
  type ValoresDoProduto,
} from '../catalog'
import { useImagemEscolhida } from '../image-choice'
import { useAlteracaoDoPasso } from '../product-steps'
import { Marcavel, Secao } from './form-parts'
import { ImageField, ImagemAEnviar } from './ImageField'
import { RodapeDoPasso } from './Passos'

interface StepProductProps {
  slug: string
  /** Sem ele, o passo cria o produto. */
  produto?: Produto | undefined
  /** As categorias para escolher, na ordem do cardápio. */
  categorias: readonly Categoria[]
  /** A categoria já escolhida num produto novo — a de onde a pessoa clicou em "Novo produto". */
  categoriaInicial?: string | undefined
  podeEditar: boolean
  aoAlterar: (alterado: boolean) => void
  /** Produto ou combo, enquanto a pessoa escolhe: o combo tem um passo a mais. */
  aoMudarTipo: (tipo: Produto['type']) => void
  /** O produto foi criado. A foto escolhida pode ter sido recusada — ele existe mesmo assim. */
  aoCriar: (produto: Produto, fotoRecusada: boolean) => void
  /** O passo de um produto que já existe foi gravado, ou não tinha o que gravar. */
  aoAvancar: () => void
}

const MOLDURA_DA_FOTO = 'size-40'

/**
 * O primeiro passo: a foto, o nome, o preço, se está disponível, a categoria
 * e a descrição — e, ao cadastrar, se é um produto ou um combo. O botão grava
 * e leva ao passo seguinte; num produto que existe e não foi mexido, só leva.
 *
 * Cadastrando, a foto já pode ser escolhida: ela é enviada logo depois de o
 * produto ser criado. Num produto que existe, a foto grava ao escolher o
 * arquivo, por outra rota: enviá-la não mexe no que foi digitado nos campos.
 */
export function StepProduct({
  slug,
  produto,
  categorias,
  categoriaInicial,
  podeEditar,
  aoAlterar,
  aoMudarTipo,
  aoCriar,
  aoAvancar,
}: StepProductProps) {
  const criar = useCriarProduto(slug)
  const alterar = useAlterarProduto(slug)
  const foto = useImagemEscolhida()
  const { register, control, formState, handleSubmit, reset } = useForm<
    ValoresDoProduto,
    unknown,
    DadosDoProduto
  >({
    resolver: zodResolver(formularioDeProdutoSchema),
    defaultValues: produto
      ? produtoParaFormulario(produto)
      : produtoNovo(categoriaInicial ?? categorias[0]?.id ?? ''),
    mode: 'onTouched',
  })
  const erros = formState.errors
  const camposAlterados = formState.isDirty
  const tipo = useWatch({ control, name: 'type' })

  useAlteracaoDoPasso(camposAlterados || Boolean(foto.escolhida), aoAlterar)
  useEffect(() => {
    if (!produto) aoMudarTipo(tipo)
  }, [produto, tipo, aoMudarTipo])

  function aoEnviar(dados: DadosDoProduto) {
    if (!produto) {
      criar.mutate(
        { dados, foto: foto.escolhida?.arquivo },
        {
          onSuccess: (resultado) => {
            aoCriar(resultado.produto, resultado.fotoRecusada)
          },
        },
      )
      return
    }
    // Nada mudou: é só seguir adiante.
    if (!camposAlterados) {
      aoAvancar()
      return
    }
    alterar.mutate(
      { id: produto.id, dados: alteracaoDoProduto(dados) },
      {
        onSuccess: (salvo) => {
          reset(produtoParaFormulario(salvo))
          aoAvancar()
        },
      },
    )
  }

  return (
    <form
      noValidate
      onSubmit={(evento) => void handleSubmit(aoEnviar)(evento)}
      className="flex flex-col gap-section-y"
    >
      <fieldset disabled={!podeEditar} className="flex min-w-0 flex-col gap-section-y">
        {/* O tipo se escolhe uma vez, ao criar: a API não deixa mudar depois. */}
        {!produto && (
          <Secao titulo="O que você vai cadastrar">
            <div role="radiogroup" aria-label="Tipo" className="flex flex-col gap-stack">
              <Marcavel
                type="radio"
                value="SIMPLE"
                titulo="Produto"
                descricao="Um item do cardápio: um lanche, uma bebida, uma sobremesa."
                {...register('type')}
              />
              <Marcavel
                type="radio"
                value="COMBO"
                titulo="Combo"
                descricao="Vários produtos por um preço só. Os itens dele você escolhe no passo seguinte."
                {...register('type')}
              />
            </div>
          </Secao>
        )}

        <Secao titulo="Produto">
          {/* Em tela grande, o nome, o preço e o "Disponível" ficam ao lado da foto. */}
          <div className="flex flex-col gap-stack lg:flex-row lg:items-start lg:gap-6">
            <div className="lg:shrink-0">
              {produto ? (
                <FotoDoProduto slug={slug} produto={produto} podeEditar={podeEditar} />
              ) : (
                <ImagemAEnviar
                  rotulo="Foto"
                  moldura={MOLDURA_DA_FOTO}
                  acoes="icones"
                  imagem={foto}
                  enviando={criar.isPending}
                />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-stack">
              <TextField
                rotulo="Nome"
                placeholder="X-Burger"
                erro={erros.name?.message}
                {...register('name')}
              />
              <TextField
                rotulo="Preço (R$)"
                inputMode="decimal"
                placeholder="0,00"
                erro={erros.priceInCents?.message}
                className="sm:max-w-48"
                {...register('priceInCents')}
              />
              <Marcavel
                type="checkbox"
                titulo="Disponível"
                descricao="Desmarque quando acabar: o produto continua no cardápio, marcado como esgotado."
                {...register('isAvailable')}
              />
            </div>
          </div>
          <SelectField
            rotulo="Categoria"
            erro={erros.categoryId?.message}
            {...register('categoryId')}
          >
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.isActive ? categoria.name : `${categoria.name} (oculta)`}
              </option>
            ))}
          </SelectField>
          <TextAreaField
            rotulo="Descrição"
            dica="Opcional. O que vem nele, o tamanho, o que acompanha."
            erro={erros.description?.message}
            {...register('description')}
          />
        </Secao>
      </fieldset>

      {podeEditar && (
        <RodapeDoPasso
          envio={produto ? alterar : criar}
          // "Categoria não encontrada", "produto não encontrado": excluídos por outra pessoa.
          explicarFalha={(erro) =>
            erro instanceof ApiError && erro.status === 404 ? erro.message : null
          }
        />
      )}
    </form>
  )
}

function FotoDoProduto({
  slug,
  produto,
  podeEditar,
}: {
  slug: string
  produto: Produto
  podeEditar: boolean
}) {
  const { envio, remocao } = useImagemDoProduto(slug, produto.id)
  return (
    <ImageField
      rotulo="Foto"
      url={produto.imageUrl}
      podeEditar={podeEditar}
      moldura={MOLDURA_DA_FOTO}
      acoes="icones"
      envio={envio}
      remocao={remocao}
    />
  )
}
