import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'

import { buscarProduto, resolverCarrinho, resumirCarrinho } from '@/features/cart/cart'
import { CartBar } from '@/features/cart/components/CartBar'
import { CartSheet } from '@/features/cart/components/CartSheet'
import { ProductDialog } from '@/features/cart/components/ProductDialog'
import { useCarrinho } from '@/features/cart/store'
import { useCardapioPublico } from '@/features/menu/api'
import { BottomNav } from '@/features/menu/components/BottomNav'
import { CategoryNav } from '@/features/menu/components/CategoryNav'
import { MenuHeader } from '@/features/menu/components/MenuHeader'
import { MenuInfo } from '@/features/menu/components/MenuInfo'
import { ProductCard } from '@/features/menu/components/ProductCard'
import { filtrarCardapio, idDaSecao } from '@/features/menu/presentation'
import { ApiError } from '@/services/api'

import { NotFoundPage } from './NotFoundPage'

/** O cardápio público em `/{tenantSlug}`. */
export function MenuPage() {
  const { tenantSlug = '' } = useParams()
  const consulta = useCardapioPublico(tenantSlug)
  const [busca, setBusca] = useState('')
  const carrinho = useCarrinho(tenantSlug)

  // O produto aberto, o carrinho aberto e as informações moram na URL
  // (`?produto=`, `?carrinho` e `?info`): o "voltar" do celular fecha a janela
  // em vez de sair do cardápio, e o link de um produto pode ser compartilhado.
  const [parametros, setParametros] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()

  const abrirJanela = (chave: 'produto' | 'carrinho' | 'info', valor: string) => {
    setParametros({ [chave]: valor }, { state: { janela: true } })
  }

  // Aberta pela página, a janela fecha voltando no histórico — senão o
  // "voltar" seguinte a reabriria. Aberta por link direto, não há para onde
  // voltar, e só se tira o parâmetro.
  const fecharJanela = () => {
    const abertaPelaPagina = (location.state as { janela?: boolean } | null)?.janela === true
    if (abertaPelaPagina) void navigate(-1)
    else setParametros({}, { replace: true })
  }

  const nome = consulta.data?.establishment.name
  useEffect(() => {
    if (nome) document.title = `${nome} — Cardápio`
  }, [nome])

  const categorias = useMemo(
    () => filtrarCardapio(consulta.data?.categories ?? [], busca),
    [consulta.data, busca],
  )

  if (consulta.isPending) {
    return (
      <div
        role="status"
        className="text-body flex min-h-dvh items-center justify-center text-content-muted"
      >
        Carregando o cardápio…
      </div>
    )
  }

  if (consulta.isError) {
    if (consulta.error instanceof ApiError && consulta.error.status === 404) {
      // A dica vale para qualquer endereço desconhecido: não revela se este,
      // em particular, espera a confirmação do e-mail.
      return (
        <NotFoundPage
          mensagem="Não encontramos este estabelecimento. Confira o endereço."
          dica="Acabou de cadastrar o seu? O cardápio aparece aqui depois que você confirmar o e-mail."
        />
      )
    }

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-stack px-page-x text-center">
        <p className="text-heading">Não foi possível carregar o cardápio</p>
        <p className="text-body text-content-muted">Verifique a sua conexão e tente de novo.</p>
        <button
          type="button"
          onClick={() => void consulta.refetch()}
          className="rounded-control bg-primary px-4 py-2 font-semibold text-primary-content hover:bg-primary-hover"
        >
          Tentar de novo
        </button>
      </div>
    )
  }

  const cardapio = consulta.data
  const vazio = cardapio.categories.length === 0

  const linhas = resolverCarrinho(carrinho.itens, cardapio)
  const resumo = resumirCarrinho(linhas, cardapio.establishment.minimumOrderInCents)
  const idDoProduto = parametros.get('produto')
  const produtoAberto = idDoProduto ? buscarProduto(cardapio, idDoProduto) : null
  const carrinhoAberto = parametros.has('carrinho')
  const infoAberta = parametros.has('info')

  return (
    // O espaço de baixo é o das barras fixas: o menu, e o carrinho quando há itens.
    <div className={`min-h-dvh ${linhas.length > 0 ? 'pb-44' : 'pb-24'}`}>
      <MenuHeader
        cardapio={cardapio}
        aoAbrirInfo={() => {
          abrirJanela('info', '1')
        }}
      />

      <div className="mx-auto mt-stack max-w-3xl px-page-x">
        <label htmlFor="busca" className="sr-only">
          Buscar no cardápio
        </label>
        <input
          id="busca"
          type="search"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value)
          }}
          placeholder="Buscar no cardápio"
          className="text-body w-full rounded-control border border-border bg-surface px-4 py-3 shadow-card"
        />
      </div>

      {/*
       * Filho direto do contêiner da página, sem envoltório: um elemento
       * `sticky` só fica preso enquanto o pai dele está na tela. Dentro de um
       * <div> da altura da própria faixa, ela subia junto com o <div>.
       */}
      <CategoryNav categorias={categorias} />

      <main className="mx-auto mt-stack flex max-w-3xl flex-col gap-section-y px-page-x">
        {vazio && (
          <p className="text-body text-center text-content-muted">
            O cardápio ainda está sendo preparado. Volte em breve.
          </p>
        )}

        {!vazio && categorias.length === 0 && (
          <p className="text-body text-center text-content-muted">
            Nenhum produto encontrado para “{busca.trim()}”.
          </p>
        )}

        {categorias.map((categoria) => (
          <section
            key={categoria.id}
            id={idDaSecao(categoria.id)}
            aria-labelledby={`titulo-${categoria.id}`}
            className="scroll-mt-16"
          >
            <h2 id={`titulo-${categoria.id}`} className="text-heading text-content">
              {categoria.name}
            </h2>
            {categoria.description && (
              <p className="text-caption text-content-muted">{categoria.description}</p>
            )}
            <div className="mt-stack flex flex-col gap-stack">
              {categoria.products.map((produto) => (
                <ProductCard
                  key={produto.id}
                  produto={produto}
                  aoAbrir={() => {
                    abrirJanela('produto', produto.id)
                  }}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* As barras do fim da tela, numa pilha só: o carrinho sempre logo acima do menu. */}
      <div className="fixed inset-x-0 bottom-0 z-20">
        {linhas.length > 0 && !carrinhoAberto && (
          <CartBar
            quantidadeDeItens={resumo.quantidadeDeItens}
            subtotalEmCentavos={resumo.subtotalEmCentavos}
            aoAbrir={() => {
              abrirJanela('carrinho', '1')
            }}
          />
        )}
        <BottomNav />
      </div>

      {produtoAberto && (
        <ProductDialog
          // Trocar de produto recomeça a escolha do zero.
          key={produtoAberto.id}
          produto={produtoAberto}
          aoAdicionar={(item) => {
            carrinho.adicionar(item)
            fecharJanela()
          }}
          aoFechar={fecharJanela}
        />
      )}

      {infoAberta && <MenuInfo cardapio={cardapio} aoFechar={fecharJanela} />}

      {carrinhoAberto && (
        <CartSheet
          linhas={linhas}
          resumo={resumo}
          pedidoMinimoEmCentavos={cardapio.establishment.minimumOrderInCents}
          aberto={cardapio.status.aberto}
          aoMudarQuantidade={carrinho.alterarQuantidade}
          aoRemover={carrinho.remover}
          aoEsvaziar={carrinho.esvaziar}
          aoContinuar={() => {
            void navigate(`/${tenantSlug}/checkout`)
          }}
          aoFechar={fecharJanela}
        />
      )}
    </div>
  )
}
