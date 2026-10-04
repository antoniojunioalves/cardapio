import { Link, useLocation, useParams, useSearchParams } from 'react-router'

import { agruparPorCategoria, useCategorias, useProduto } from '@/features/admin/catalog'
import { VoltarAoCardapio } from '@/features/admin/components/catalog-parts'
import { AvisoDeAtencao } from '@/features/admin/components/form-parts'
import { ProductForm, type ChegadaAoProduto } from '@/features/admin/components/ProductForm'
import { caminhoDoPainel } from '@/features/admin/menu'
import { usePainel, useTituloDoPainel } from '@/features/admin/panel'
import { cardapioNoPlano, usePlano } from '@/features/admin/plan'
import { ApiError } from '@/services/api'

/**
 * Criar um produto (`/admin/cardapio/produtos/novo?categoria=…`) ou editar um
 * (`/admin/cardapio/produtos/:id`).
 */
export function AdminProductPage() {
  const { produtoId } = useParams()

  useTituloDoPainel(produtoId === undefined ? 'Novo produto' : 'Editar produto')

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-stack">
      {produtoId === undefined ? (
        <NovoProduto />
      ) : (
        // A chave refaz o formulário ao trocar de produto — inclusive logo depois de criar.
        <ProdutoExistente key={produtoId} id={produtoId} />
      )}
    </div>
  )
}

/**
 * O "voltar" e o título. O "voltar" leva à lista com a categoria do produto
 * aberta — a de agora, se ele acabou de mudar de categoria.
 */
function Cabecalho({ titulo, abrir }: { titulo: string; abrir?: string | undefined }) {
  const { slug } = usePainel()
  return (
    <>
      <VoltarAoCardapio slug={slug} abrir={abrir} />
      <h1 className="text-heading text-content">{titulo}</h1>
    </>
  )
}

/** As categorias na ordem do cardápio, para o seletor. */
function useCategoriasEmOrdem(slug: string) {
  const consulta = useCategorias(slug)
  const emOrdem = consulta.data && agruparPorCategoria(consulta.data, []).map((g) => g.categoria)
  return { consulta, emOrdem }
}

function NovoProduto() {
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
          to={caminhoDoPainel(slug, 'cardapio/categorias/nova')}
          className="font-semibold text-primary hover:underline"
        >
          Crie a primeira categoria
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
        <ProductForm
          slug={slug}
          categorias={emOrdem}
          categoriaInicial={emOrdem.some((c) => c.id === pedida) ? pedida : undefined}
          podeEditar={permissoes.includes('products:create')}
        />
      </>
    )
  }

  return (
    <>
      <Cabecalho titulo="Novo produto" abrir={pedida} />
      {conteudo}
    </>
  )
}

function ProdutoExistente({ id }: { id: string }) {
  const { slug, permissoes } = usePainel()
  const chegada = useLocation().state as ChegadaAoProduto | null
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
      <>
        {chegada?.aviso && (
          <p role="status" className="text-caption font-semibold text-success">
            {chegada.aviso}
          </p>
        )}
        <ProductForm
          slug={slug}
          produto={produto.data}
          categorias={emOrdem}
          podeEditar={permissoes.includes('products:update')}
          podeExcluir={permissoes.includes('products:delete')}
        />
      </>
    )
  }

  return (
    <>
      {/* A categoria de agora: se o produto acabou de mudar de categoria, é a nova que abre. */}
      <Cabecalho titulo="Editar produto" abrir={produto.data?.categoryId} />
      {conteudo}
    </>
  )
}
