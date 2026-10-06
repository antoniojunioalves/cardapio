import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'

import { SelectField } from '@/components/SelectField'
import { TextAreaField } from '@/components/TextAreaField'
import { TextField } from '@/components/TextField'
import { ApiError } from '@/services/api'

import {
  alteracaoDoProduto,
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
import { useSalvarProdutoEOpcoes } from '../option-groups'
import { Excluir } from './catalog-parts'
import { ComboItemsSection } from './ComboItemsSection'
import { AvisoDeSomenteLeitura, Marcavel, RodapeDeSalvar, Secao } from './form-parts'
import { ImageField } from './ImageField'
import { ProductOptionsSection } from './ProductOptionsSection'

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
 * Criar ou editar um produto: nome, preço, se está disponível, categoria e
 * descrição — e, ao criar, se é um produto ou um combo. A foto, as opções e os
 * itens do combo vão depois de criado: as rotas são as do produto.
 *
 * No produto que já existe, as opções ficam no mesmo quadro dos campos e são
 * gravadas pelo mesmo "Salvar". A foto grava ao escolher o arquivo, e os itens
 * do combo têm o quadro e o "Salvar" deles.
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
  const criar = useSalvarProduto(slug)
  const alterar = useSalvarProdutoEOpcoes(slug)
  const excluir = useExcluirProduto(slug)
  // Os grupos de opção escolhidos e ainda não salvos; `null` enquanto valem os gravados.
  const [opcoes, setOpcoes] = useState<string[] | null>(null)
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
  const camposAlterados = formState.isDirty
  const alterado = camposAlterados || opcoes !== null

  function aoEnviar(dados: DadosDoProduto) {
    if (produto) {
      // Cada parte só vai se mudou: salvar as opções não regrava os campos.
      alterar.mutate(
        {
          produto,
          dados: camposAlterados ? alteracaoDoProduto(dados) : undefined,
          grupos: opcoes ?? undefined,
        },
        {
          onSuccess: (salvo) => {
            reset(produtoParaFormulario(salvo))
            setOpcoes(null)
          },
        },
      )
      return
    }
    criar.mutate(
      { dados },
      {
        onSuccess: (salvo) => {
          // Para a página do produto criado, onde vão a foto, as opções e os
          // itens do combo. Sem guardar esta página no histórico: "voltar"
          // leva ao cardápio.
          void navigate(caminhoDoPainel(slug, `cardapio/produtos/${salvo.id}`), {
            replace: true,
            state: {
              aviso:
                salvo.type === 'COMBO'
                  ? 'Combo criado. Agora escolha os itens dele e envie a foto.'
                  : 'Produto criado. Agora você pode enviar a foto e escolher as opções.',
            },
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
                descricao="Vários produtos por um preço só. Os itens dele você escolhe logo depois de criar."
                {...register('type')}
              />
            </div>
          </Secao>
        )}

        <fieldset disabled={!podeEditar} className="min-w-0">
          <Secao titulo="Produto">
            {/*
              A foto é a primeira coisa do produto, como no cardápio. Ela é
              gravada ao escolher o arquivo, por outra rota, e não pelo
              "Salvar": enviar a foto não mexe no que foi digitado nos campos.
              Em tela grande, o nome, o preço e o "Disponível" ficam ao lado dela.
            */}
            <div className="flex flex-col gap-stack lg:flex-row lg:items-start lg:gap-6">
              <div className="lg:w-48 lg:shrink-0">
                {produto ? (
                  <FotoDoProduto slug={slug} produto={produto} podeEditar={podeEditar} />
                ) : (
                  <FotoAntesDeCriar />
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
            {produto && (
              <ProductOptionsSection
                slug={slug}
                produtoId={produto.id}
                escolhidos={opcoes}
                aoMudar={setOpcoes}
                podeEditar={podeEditar}
                ocupado={alterar.isPending}
                porSalvar={alterado}
              />
            )}
          </Secao>
        </fieldset>

        {podeEditar && (
          <RodapeDeSalvar
            envio={produto ? alterar : criar}
            // Criando, o botão fica ligado: clicar mostra o que falta preencher.
            alterado={produto ? alterado : true}
            sucesso="Produto salvo."
            rotulo={produto ? 'Salvar alterações' : 'Criar produto'}
            // "Categoria não encontrada", "produto não encontrado": excluídos por outra pessoa.
            explicarFalha={(erro) =>
              erro instanceof ApiError && erro.status === 404 ? erro.message : null
            }
          />
        )}
      </form>

      {produto?.type === 'COMBO' && (
        <ComboItemsSection slug={slug} combo={produto} podeEditar={podeEditar} />
      )}

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
