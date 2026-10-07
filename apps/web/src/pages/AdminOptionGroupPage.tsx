import { useParams, useSearchParams } from 'react-router'

import { Voltar } from '@/features/admin/components/catalog-parts'
import { OptionGroupForm } from '@/features/admin/components/OptionGroupForm'
import { caminhoDoPainel } from '@/features/admin/menu'
import { useGrupo } from '@/features/admin/option-groups'
import { usePainel, useTituloDoPainel } from '@/features/admin/panel'
import { ApiError } from '@/services/api'

/**
 * Criar um grupo de opções (`/admin/cardapio/opcoes/novo`) ou editar um
 * (`/admin/cardapio/opcoes/:id`). Criado a partir de um produto
 * (`?produto=…`), o grupo já entra nele, e a página volta para o produto.
 */
export function AdminOptionGroupPage() {
  const { slug, permissoes } = usePainel()
  const { grupoId } = useParams()
  const [busca] = useSearchParams()
  const produtoDeOrigem = busca.get('produto') ?? undefined
  const titulo = grupoId === undefined ? 'Novo grupo de opções' : 'Editar grupo de opções'
  const podeEditar = permissoes.includes('products:update')

  useTituloDoPainel(titulo)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-stack">
      {produtoDeOrigem ? (
        <Voltar
          para={caminhoDoPainel(slug, `cardapio/produtos/${produtoDeOrigem}`)}
          rotulo="Produto"
        />
      ) : (
        <Voltar para={caminhoDoPainel(slug, 'cardapio/opcoes')} rotulo="Opções e adicionais" />
      )}
      <h1 className="text-heading text-content">{titulo}</h1>
      {grupoId === undefined ? (
        <OptionGroupForm slug={slug} produtoDeOrigem={produtoDeOrigem} podeEditar={podeEditar} />
      ) : (
        <GrupoExistente key={grupoId} id={grupoId} podeEditar={podeEditar} />
      )}
    </div>
  )
}

function GrupoExistente({ id, podeEditar }: { id: string; podeEditar: boolean }) {
  const { slug } = usePainel()
  const grupo = useGrupo(slug, id)

  if (grupo.isPending) {
    return <p className="text-body text-content-muted">Carregando o grupo…</p>
  }
  if (grupo.isError) {
    return (
      <p role="alert" className="text-body text-content-muted">
        {grupo.error instanceof ApiError && grupo.error.status === 404
          ? 'Este grupo não existe mais.'
          : 'Não foi possível carregar o grupo. Recarregue a página para tentar de novo.'}
      </p>
    )
  }
  return <OptionGroupForm slug={slug} grupo={grupo.data} podeEditar={podeEditar} />
}
