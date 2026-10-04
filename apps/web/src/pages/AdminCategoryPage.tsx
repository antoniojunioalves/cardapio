import { useParams } from 'react-router'

import { useCategorias, useProdutos } from '@/features/admin/catalog'
import { VoltarAoCardapio } from '@/features/admin/components/catalog-parts'
import { CategoryForm } from '@/features/admin/components/CategoryForm'
import { usePainel, useTituloDoPainel } from '@/features/admin/panel'

/**
 * Criar uma categoria (`/admin/cardapio/categorias/nova`) ou editar uma
 * (`/admin/cardapio/categorias/:id`).
 */
export function AdminCategoryPage() {
  const { slug, permissoes } = usePainel()
  const { categoriaId } = useParams()
  const nova = categoriaId === undefined
  const titulo = nova ? 'Nova categoria' : 'Editar categoria'
  // Uma categoria não tem rota própria de leitura: ela vem da lista, que a
  // tela do cardápio já deixou no cache.
  const categorias = useCategorias(slug)
  const produtos = useProdutos(slug)

  useTituloDoPainel(titulo)

  let conteudo
  if (nova) {
    conteudo = <CategoryForm slug={slug} podeEditar={permissoes.includes('categories:create')} />
  } else if (categorias.isPending || produtos.isPending) {
    conteudo = <p className="text-body text-content-muted">Carregando a categoria…</p>
  } else if (categorias.isError || produtos.isError) {
    conteudo = (
      <p role="alert" className="text-body text-content-muted">
        Não foi possível carregar a categoria. Recarregue a página para tentar de novo.
      </p>
    )
  } else {
    const categoria = categorias.data.find((c) => c.id === categoriaId)
    conteudo = categoria ? (
      <CategoryForm
        key={categoria.id}
        slug={slug}
        categoria={categoria}
        produtos={produtos.data.filter((p) => p.categoryId === categoria.id).length}
        podeEditar={permissoes.includes('categories:update')}
        podeExcluir={permissoes.includes('categories:delete')}
      />
    ) : (
      <p role="alert" className="text-body text-content-muted">
        Esta categoria não existe mais.
      </p>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-stack">
      <VoltarAoCardapio slug={slug} abrir={categoriaId} />
      <h1 className="text-heading text-content">{titulo}</h1>
      {conteudo}
    </div>
  )
}
