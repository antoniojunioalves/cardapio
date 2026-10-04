import { useState } from 'react'
import { Link, useLocation } from 'react-router'

import {
  AO_EXCLUIR,
  agruparPorCategoria,
  moverNaLista,
  porQueNaoExcluirCategoria,
  useCategorias,
  useExcluirCategoria,
  useExcluirProduto,
  useProdutos,
  useReordenarCategorias,
  useReordenarProdutos,
  type Categoria,
  type Produto,
} from '@/features/admin/catalog'
import { ConfirmarExclusao } from '@/features/admin/components/catalog-parts'
import {
  AvisoDeAtencao,
  AvisoDeSomenteLeitura,
  botaoDeTexto,
} from '@/features/admin/components/form-parts'
import { MenuCategorySection } from '@/features/admin/components/MenuCategorySection'
import { caminhoDoPainel } from '@/features/admin/menu'
import { useCategoriasAbertas } from '@/features/admin/open-categories'
import { usePainel, useTituloDoPainel } from '@/features/admin/panel'
import { cardapioNoPlano, usePlano } from '@/features/admin/plan'

/** O recado de quem chega à lista vindo de uma página de categoria ou de produto. */
export interface ChegadaAoCardapio {
  /** "Produto excluído." */
  aviso?: string
  /** A categoria que deve estar aberta: a recém-criada, ou a do produto de onde se voltou. */
  abrir?: string
}

/** O que a lixeira abriu para confirmar. */
type Exclusao =
  | { tipo: 'produto'; produto: Produto }
  | { tipo: 'categoria'; categoria: Categoria; produtos: number }

const botaoPrincipal =
  'text-body shrink-0 rounded-control bg-primary px-4 py-2.5 font-semibold text-primary-content hover:bg-primary-hover disabled:opacity-50'

/**
 * O cardápio do estabelecimento, em `/{tenantSlug}/admin/cardapio`: as
 * categorias na ordem em que o cliente as vê, cada uma com os seus produtos.
 * Daqui se marca o que esgotou, se muda a ordem e se chega às páginas de
 * criar e editar.
 */
export function AdminMenuPage() {
  const { slug, permissoes } = usePainel()
  const categorias = useCategorias(slug)
  const produtos = useProdutos(slug)
  const plano = cardapioNoPlano(usePlano(slug, true).data)
  const chegada = useLocation().state as ChegadaAoCardapio | null
  const reordenarCategorias = useReordenarCategorias(slug)
  const reordenarProdutos = useReordenarProdutos(slug)
  const abertas = useCategoriasAbertas(slug, chegada?.abrir)
  const excluirProduto = useExcluirProduto(slug)
  const excluirCategoria = useExcluirCategoria(slug)
  const [exclusao, setExclusao] = useState<Exclusao | null>(null)
  // O recado de quem chegou de outra página, ou de uma exclusão feita aqui mesmo.
  const [aviso, setAviso] = useState(chegada?.aviso)

  useTituloDoPainel('Cardápio')

  const pode = {
    criarCategoria: permissoes.includes('categories:create'),
    alterarCategoria: permissoes.includes('categories:update'),
    excluirCategoria: permissoes.includes('categories:delete'),
    criarProduto: permissoes.includes('products:create'),
    alterarProduto: permissoes.includes('products:update'),
    excluirProduto: permissoes.includes('products:delete'),
  }
  const somenteLeitura = !Object.values(pode).some(Boolean)
  const ordenando = reordenarCategorias.isPending || reordenarProdutos.isPending
  const grupos =
    categorias.data && produtos.data ? agruparPorCategoria(categorias.data, produtos.data) : []
  const idsDasCategorias = grupos.map((g) => g.categoria.id)
  const falhaAoOrdenar = reordenarCategorias.isError || reordenarProdutos.isError

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-section-y">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-heading text-content">Cardápio</h1>
          {plano && <p className="text-caption text-content-muted">{plano.texto}</p>}
        </div>
        {pode.criarCategoria &&
          categorias.data &&
          categorias.data.length > 0 &&
          (plano?.categoriasNoLimite ? (
            <button type="button" disabled className={botaoPrincipal}>
              Nova categoria
            </button>
          ) : (
            <Link to={caminhoDoPainel(slug, 'cardapio/categorias/nova')} className={botaoPrincipal}>
              Nova categoria
            </Link>
          ))}
      </div>

      {aviso && (
        <p role="status" className="text-caption font-semibold text-success">
          {aviso}
        </p>
      )}
      {somenteLeitura && (
        <AvisoDeSomenteLeitura texto="Você pode ver o cardápio, mas só quem administra o estabelecimento o altera." />
      )}
      {pode.criarProduto && plano?.produtosNoLimite && (
        <AvisoDeAtencao>
          O cardápio chegou ao limite de produtos do plano. Para cadastrar outro, exclua um produto
          ou mude de plano.
        </AvisoDeAtencao>
      )}
      {pode.criarCategoria && plano?.categoriasNoLimite && (
        <AvisoDeAtencao>
          O cardápio chegou ao limite de categorias do plano. Para criar outra, exclua uma categoria
          vazia ou mude de plano.
        </AvisoDeAtencao>
      )}
      {falhaAoOrdenar && (
        <p role="alert" className="text-caption text-danger">
          Não foi possível mudar a ordem. Recarregue a página e tente de novo.
        </p>
      )}

      {categorias.isPending || produtos.isPending ? (
        <p className="text-body text-content-muted">Carregando o cardápio…</p>
      ) : categorias.isError || produtos.isError ? (
        <p role="alert" className="text-body text-content-muted">
          Não foi possível carregar o cardápio. Recarregue a página para tentar de novo.
        </p>
      ) : categorias.data.length === 0 ? (
        <section className="flex flex-col items-start gap-stack rounded-card bg-surface p-card shadow-card">
          <h2 className="text-body font-semibold text-content">O cardápio ainda está vazio</h2>
          <p className="text-body text-content-muted">
            Comece por uma categoria, como Lanches ou Bebidas. Depois, cadastre os produtos dentro
            dela.
          </p>
          {pode.criarCategoria && (
            <Link to={caminhoDoPainel(slug, 'cardapio/categorias/nova')} className={botaoPrincipal}>
              Criar a primeira categoria
            </Link>
          )}
        </section>
      ) : (
        // As categorias mais juntas que as seções da página: recolhidas, são uma lista.
        <div className="flex flex-col gap-stack">
          {grupos.length > 1 && (
            <div className="-mb-2 flex justify-end">
              {idsDasCategorias.every((id) => abertas.aberta(id)) ? (
                <button type="button" onClick={abertas.recolherTodas} className={botaoDeTexto}>
                  Recolher todas
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    abertas.abrirTodas(idsDasCategorias)
                  }}
                  className={botaoDeTexto}
                >
                  Abrir todas
                </button>
              )}
            </div>
          )}
          {grupos.map(({ categoria, produtos: daCategoria }, indice) => (
            <MenuCategorySection
              key={categoria.id}
              slug={slug}
              categoria={categoria}
              produtos={daCategoria}
              pode={pode}
              primeira={indice === 0}
              ultima={indice === grupos.length - 1}
              ordenando={ordenando}
              produtosNoLimite={plano?.produtosNoLimite ?? false}
              aberta={abertas.aberta(categoria.id)}
              aoAlternar={() => {
                abertas.alternar(categoria.id)
              }}
              aoMoverCategoria={(direcao) => {
                reordenarProdutos.reset()
                reordenarCategorias.mutate(moverNaLista(idsDasCategorias, indice, direcao))
              }}
              aoExcluirCategoria={() => {
                excluirCategoria.reset()
                setExclusao({ tipo: 'categoria', categoria, produtos: daCategoria.length })
              }}
              aoExcluirProduto={(produto) => {
                excluirProduto.reset()
                setExclusao({ tipo: 'produto', produto })
              }}
              aoMoverProduto={(posicao, direcao) => {
                reordenarCategorias.reset()
                reordenarProdutos.mutate({
                  categoryId: categoria.id,
                  ids: moverNaLista(
                    daCategoria.map((p) => p.id),
                    posicao,
                    direcao,
                  ),
                })
              }}
            />
          ))}
        </div>
      )}

      {exclusao?.tipo === 'produto' && (
        <ConfirmarExclusao
          oQue="o produto"
          nome={exclusao.produto.name}
          consequencia={AO_EXCLUIR.produto}
          excluir={excluirProduto}
          aoFechar={() => {
            setExclusao(null)
          }}
          aoConfirmar={() => {
            const { id, name } = exclusao.produto
            excluirProduto.mutate(id, {
              onSuccess: () => {
                setExclusao(null)
                setAviso(`Produto “${name}” excluído.`)
              },
            })
          }}
        />
      )}
      {exclusao?.tipo === 'categoria' && (
        <ConfirmarExclusao
          oQue="a categoria"
          nome={exclusao.categoria.name}
          consequencia={AO_EXCLUIR.categoria}
          impedimento={porQueNaoExcluirCategoria(exclusao.produtos)}
          excluir={excluirCategoria}
          aoFechar={() => {
            setExclusao(null)
          }}
          aoConfirmar={() => {
            const { id, name } = exclusao.categoria
            excluirCategoria.mutate(id, {
              onSuccess: () => {
                setExclusao(null)
                setAviso(`Categoria “${name}” excluída.`)
              },
            })
          }}
        />
      )}
    </div>
  )
}
