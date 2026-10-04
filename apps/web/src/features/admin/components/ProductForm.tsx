import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'

import { SelectField } from '@/components/SelectField'
import { TextAreaField } from '@/components/TextAreaField'
import { TextField } from '@/components/TextField'
import { ApiError } from '@/services/api'

import {
  AO_EXCLUIR,
  formularioDeProdutoSchema,
  produtoNovo,
  produtoParaFormulario,
  useExcluirProduto,
  useImagemDoProduto,
  useSalvarProduto,
  type Categoria,
  type DadosDoProduto,
  type Produto,
  type ValoresDoProduto,
} from '../catalog'
import { caminhoDoPainel } from '../menu'
import { Excluir } from './catalog-parts'
import { AvisoDeSomenteLeitura, Marcavel, RodapeDeSalvar, Secao } from './form-parts'
import { ImageField } from './ImageField'

/** O recado da página do produto para quem acabou de criá-lo. */
export interface ChegadaAoProduto {
  aviso?: string
}

interface ProductFormProps {
  slug: string
  /** Sem ele, o formulário cria um produto novo. */
  produto?: Produto | undefined
  /** As categorias para escolher, na ordem do cardápio. */
  categorias: readonly Categoria[]
  /** A categoria já escolhida num produto novo — a de onde a pessoa clicou em "Novo produto". */
  categoriaInicial?: string | undefined
  podeEditar: boolean
  podeExcluir?: boolean
}

const SOMENTE_LEITURA =
  'Você pode ver o cardápio, mas só quem administra o estabelecimento o altera.'

/**
 * Criar ou editar um produto: categoria, nome, descrição, preço e se está
 * disponível. A foto vai depois de criado — a rota de imagem é a do produto —,
 * e é gravada ao escolher o arquivo.
 */
export function ProductForm({
  slug,
  produto,
  categorias,
  categoriaInicial,
  podeEditar,
  podeExcluir = false,
}: ProductFormProps) {
  const navigate = useNavigate()
  const salvar = useSalvarProduto(slug)
  const excluir = useExcluirProduto(slug)
  const { register, formState, handleSubmit, reset } = useForm<
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

  function aoEnviar(dados: DadosDoProduto) {
    salvar.mutate(
      { id: produto?.id, dados },
      {
        onSuccess: (salvo) => {
          if (produto) {
            reset(produtoParaFormulario(salvo))
            return
          }
          // Para a página do produto criado, onde a foto pode ser enviada. Sem
          // guardar esta página no histórico: "voltar" leva ao cardápio.
          void navigate(caminhoDoPainel(slug, `cardapio/produtos/${salvo.id}`), {
            replace: true,
            state: { aviso: 'Produto criado. Agora você pode enviar a foto.' },
          })
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
        {!podeEditar && <AvisoDeSomenteLeitura texto={SOMENTE_LEITURA} />}
        {produto?.type === 'COMBO' && (
          <p role="note" className="text-caption rounded-control bg-brand-50 p-3 text-brand-800">
            Este produto é um combo. Os itens que o compõem ainda não são editados pelo painel.
          </p>
        )}

        <fieldset disabled={!podeEditar} className="min-w-0">
          <Secao titulo="Produto">
            {/*
              A foto é a primeira coisa do produto, como no cardápio. Ela é
              gravada ao escolher o arquivo, por outra rota, e não pelo
              "Salvar": enviar a foto não mexe no que foi digitado nos campos.
            */}
            {produto ? (
              <FotoDoProduto slug={slug} produto={produto} podeEditar={podeEditar} />
            ) : (
              <FotoAntesDeCriar />
            )}
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
            <TextField
              rotulo="Nome"
              placeholder="X-Burger"
              erro={erros.name?.message}
              {...register('name')}
            />
            <TextAreaField
              rotulo="Descrição"
              dica="Opcional. O que vem nele, o tamanho, o que acompanha."
              erro={erros.description?.message}
              {...register('description')}
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
          </Secao>
        </fieldset>

        {podeEditar && (
          <RodapeDeSalvar
            envio={salvar}
            // Criando, o botão fica ligado: clicar mostra o que falta preencher.
            alterado={produto ? formState.isDirty : true}
            sucesso="Produto salvo."
            rotulo={produto ? 'Salvar alterações' : 'Criar produto'}
            // "Categoria não encontrada", "produto não encontrado": excluídos por outra pessoa.
            explicarFalha={(erro) =>
              erro instanceof ApiError && erro.status === 404 ? erro.message : null
            }
          />
        )}
      </form>

      {produto && podeExcluir && (
        <Excluir
          oQue="o produto"
          nome={produto.name}
          consequencia={AO_EXCLUIR.produto}
          excluir={excluir}
          aoConfirmar={() => {
            excluir.mutate(produto.id, {
              onSuccess: () => {
                void navigate(caminhoDoPainel(slug, 'cardapio'), {
                  state: {
                    aviso: `Produto “${produto.name}” excluído.`,
                    abrir: produto.categoryId,
                  },
                })
              },
            })
          }}
        />
      )}
    </div>
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
      dica="Aparece no cardápio, ao lado do nome. JPEG, PNG ou WebP, até 15 MB; a foto é reduzida e guardada sem a localização de onde foi tirada."
      url={produto.imageUrl}
      podeEditar={podeEditar}
      moldura="size-40"
      envio={envio}
      remocao={remocao}
    />
  )
}

/**
 * O lugar da foto num produto novo. A rota de imagem é a do produto, que só
 * existe depois de criado: criar leva à página dele, onde o envio aparece aqui.
 */
function FotoAntesDeCriar() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body font-semibold text-content">Foto</p>
      <div className="flex size-40 items-center justify-center rounded-control border border-dashed border-border bg-surface-muted">
        <span className="text-caption text-content-muted">Sem imagem</span>
      </div>
      <p className="text-caption text-content-muted">
        Você envia a foto logo depois de criar o produto.
      </p>
    </div>
  )
}
