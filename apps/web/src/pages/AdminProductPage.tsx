import { Link, useLocation, useParams, useSearchParams } from 'react-router'

import { agruparPorCategoria, useCategorias, useProduto } from '@/features/admin/catalog'
import { VoltarAoCardapio } from '@/features/admin/components/catalog-parts'
import { AvisoDeAtencao } from '@/features/admin/components/form-parts'
import { ProductSteps, type ChegadaAoProduto } from '@/features/admin/components/ProductSteps'
import { caminhoDoPainel } from '@/features/admin/menu'
import { usePainel, useTituloDoPainel } from '@/features/admin/panel'
import { cardapioNoPlano, usePlano } from '@/features/admin/plan'
import { ApiError } from '@/services/api'

/**
 * O cadastro de um produto, em passos (`/admin/cardapio/produtos/novo`), e a
 * edição de um que existe (`/admin/cardapio/produtos/:id`), pelos mesmos
 * passos. `?categoria=…` traz a categoria já escolhida no produto novo;
 * `?passo=…`, o passo.
 */
export function AdminProductPage() {
  const { produtoId } = useParams()
  const chegada = useLocation().state as ChegadaAoProduto | null
  // Depois de criado, o endereço já é o do produto — mas o cadastro ainda não acabou.
  const titulo = produtoId === undefined || chegada?.cadastrando ? 'Novo produto' : 'Editar produto'

  useTituloDoPainel(titulo)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-stack">
      {produtoId === undefined ? (
        <NovoProduto titulo={titulo} />
      ) : (
        // A chave refaz os passos ao trocar de produto — inclusive logo depois de criar.
        <ProdutoExistente key={produtoId} id={produtoId} titulo={titulo} />
      )}
    </div>
  )
}

interface CabecalhoProps {
  titulo: string
  /** O nome do produto, abaixo do título: nos passos sem o campo do nome, diz de quem se trata. */
  nome?: string | undefined
  /** A categoria que a lista deve mostrar aberta na volta. */
  abrir?: string | undefined
}

/** O "voltar" e o título. */
function Cabecalho({ titulo, nome, abrir }: CabecalhoProps) {
  const { slug } = usePainel()
  return (
    <>
      <VoltarAoCardapio slug={slug} abrir={abrir} />
      <div>
        <h1 className="text-heading text-content">{titulo}</h1>
        {nome && <p className="text-body break-words text-content-muted">{nome}</p>}
      </div>
    </>
  )
}

/** As categorias na ordem do cardápio, para o seletor do passo do produto. */
function useCategoriasEmOrdem(slug: string) {
  const consulta = useCategorias(slug)
  const emOrdem = consulta.data && agruparPorCategoria(consulta.data, []).map((g) => g.categoria)
  return { consulta, emOrdem }
}

function NovoProduto({ titulo }: { titulo: string }) {
  const { slug, permissoes } = usePainel()
  const [busca] = useSearchParams()
  const { consulta, emOrdem } = useCategoriasEmOrdem(slug)
  const plano = cardapioNoPlano(usePlano(slug, true).data)
  const pedida = busca.get('categoria') ?? undefined

  let conteudo
  if (consulta.isPending) {
    conteudo = <p className="text-body text-content-muted">Carregando…</p>
  } else if (consulta.isError || !emOrdem) {
    conteudo = (
      <p role="alert" className="text-body text-content-muted">
        Não foi possível carregar as categorias. Recarregue a página para tentar de novo.
      </p>
    )
  } else if (emOrdem.length === 0) {
    conteudo = (
      <p className="text-body text-content-muted">
        Todo produto fica dentro de uma categoria.{' '}
        <Link
          to={caminhoDoPainel(slug, 'cardapio')}
          className="font-semibold text-primary hover:underline"
        >
          Crie a primeira categoria no cardápio
        </Link>{' '}
        antes.
      </p>
    )
  } else {
    conteudo = (
      <>
        {plano?.produtosNoLimite && (
          <AvisoDeAtencao>
            O cardápio chegou ao limite de produtos do plano. Para cadastrar outro, exclua um
            produto ou mude de plano.
          </AvisoDeAtencao>
        )}
        <ProductSteps
          slug={slug}
          categorias={emOrdem}
          categoriaInicial={emOrdem.some((c) => c.id === pedida) ? pedida : undefined}
          permissoes={permissoes}
        />
      </>
    )
  }

  return (
    <>
      <Cabecalho titulo={titulo} abrir={pedida} />
      {conteudo}
    </>
  )
}

function ProdutoExistente({ id, titulo }: { id: string; titulo: string }) {
  const { slug, permissoes } = usePainel()
  const produto = useProduto(slug, id)
  const { consulta, emOrdem } = useCategoriasEmOrdem(slug)

  let conteudo
  if (produto.isPending || consulta.isPending) {
    conteudo = <p className="text-body text-content-muted">Carregando o produto…</p>
  } else if (produto.isError && produto.error instanceof ApiError && produto.error.status === 404) {
    conteudo = (
      <p role="alert" className="text-body text-content-muted">
        Este produto não existe mais.
      </p>
    )
  } else if (produto.isError || consulta.isError || !emOrdem) {
    conteudo = (
      <p role="alert" className="text-body text-content-muted">
        Não foi possível carregar o produto. Recarregue a página para tentar de novo.
      </p>
    )
  } else {
    conteudo = (
      <ProductSteps
        slug={slug}
        produto={produto.data}
        categorias={emOrdem}
        permissoes={permissoes}
      />
    )
  }

  return (
    <>
      {/* A categoria de agora: se o produto acabou de mudar de categoria, é a nova que abre. */}
      <Cabecalho titulo={titulo} nome={produto.data?.name} abrir={produto.data?.categoryId} />
      {conteudo}
    </>
  )
}
