import { useId } from 'react'
import { Link } from 'react-router'

import { IconeDescer, IconeMais } from '@/components/icons'
import { formatarPreco } from '@/utils/money'

import { resumoDaCategoria, useDisponibilidade, type Categoria, type Produto } from '../catalog'
import { caminhoDoPainel } from '../menu'
import { BotoesDeOrdem, EditarEExcluir, Miniatura } from './catalog-parts'

const selo = 'text-caption rounded-pill px-2 py-0.5 font-semibold'

interface PodeNoCardapio {
  alterarCategoria: boolean
  excluirCategoria: boolean
  criarProduto: boolean
  alterarProduto: boolean
  excluirProduto: boolean
}

interface MenuCategorySectionProps {
  slug: string
  categoria: Categoria
  produtos: readonly Produto[]
  pode: PodeNoCardapio
  /** A posição da categoria na lista, para desligar "subir" na primeira e "descer" na última. */
  primeira: boolean
  ultima: boolean
  /** Uma reordenação em andamento: os botões de ordem ficam desligados até ela voltar. */
  ordenando: boolean
  /** O plano não deixa criar mais produtos: "Novo produto" fica desligado. */
  produtosNoLimite: boolean
  /** Recolhida, a categoria mostra só o nome e o resumo; os produtos ficam escondidos. */
  aberta: boolean
  aoAlternar: () => void
  aoMoverCategoria: (direcao: 'subir' | 'descer') => void
  aoMoverProduto: (indice: number, direcao: 'subir' | 'descer') => void
  /** O lápis da categoria: quem chama abre a janela de editar. */
  aoEditarCategoria: () => void
  /** A lixeira: quem chama abre a confirmação. */
  aoExcluirCategoria: () => void
  aoExcluirProduto: (produto: Produto) => void
}

/**
 * Uma categoria da lista do cardápio, com os produtos dela na ordem em que o
 * cliente os vê. O nome abre e recolhe a categoria; o lápis, a lixeira e os
 * botões de ordem ficam fora dele, e funcionam com ela recolhida.
 */
export function MenuCategorySection({
  slug,
  categoria,
  produtos,
  pode,
  primeira,
  ultima,
  ordenando,
  produtosNoLimite,
  aberta,
  aoAlternar,
  aoMoverCategoria,
  aoMoverProduto,
  aoEditarCategoria,
  aoExcluirCategoria,
  aoExcluirProduto,
}: MenuCategorySectionProps) {
  const idDoNome = useId()
  const idDoConteudo = useId()

  return (
    <section
      aria-labelledby={idDoNome}
      className="flex flex-col rounded-card bg-surface p-card shadow-card"
    >
      {/*
        O cabeçalho é uma grade, e não uma linha que quebra sozinha: assim o
        nome é que quebra quando é comprido, e não as setas que pulam para
        baixo. "Novo produto" fica na segunda linha no celular — ao lado do
        lápis e da lixeira não cabe — e entra na primeira a partir de `sm`.
      */}
      <div className="grid grid-cols-[minmax(0,max-content)_auto_1fr_auto] items-start gap-x-1 gap-y-2 sm:grid-cols-[minmax(0,max-content)_auto_auto_1fr_auto]">
        <h2 className="col-start-1 row-start-1 min-w-0">
          {/*
            O nome e o resumo são o botão de abrir e recolher. O lápis e a
            lixeira vêm logo depois do nome, fora do botão — um botão não pode
            ter outro dentro. O nome que o leitor de tela anuncia vem pronto, com vírgulas:
            montado pelo navegador a partir dos blocos, sairia "Lanches4
            produtos" ou "Lanches , 4 produtos", conforme o navegador.
          */}
          <button
            type="button"
            aria-expanded={aberta}
            aria-controls={idDoConteudo}
            aria-label={[
              categoria.name,
              resumoDaCategoria(produtos),
              ...(categoria.isActive ? [] : ['oculta no cardápio']),
            ].join(', ')}
            onClick={aoAlternar}
            className="-m-1 flex items-start gap-2 rounded-control p-1 text-left hover:bg-surface-muted"
          >
            <IconeDescer
              className={`mt-0.5 size-5 text-content-muted transition-transform ${aberta ? '' : '-rotate-90'}`}
            />
            <span className="min-w-0">
              <span
                id={idDoNome}
                className="text-body block font-semibold break-words text-content"
              >
                {categoria.name}
              </span>
              <span className="text-caption block text-content-muted">
                {resumoDaCategoria(produtos)}
                {!categoria.isActive && (
                  <span className={`${selo} ml-2 bg-neutral-100 text-neutral-700`}>
                    Oculta no cardápio
                  </span>
                )}
              </span>
            </span>
          </button>
        </h2>
        <div className="col-start-2 row-start-1">
          <EditarEExcluir
            quem={`a categoria ${categoria.name}`}
            editar={pode.alterarCategoria ? aoEditarCategoria : undefined}
            aoExcluir={pode.excluirCategoria ? aoExcluirCategoria : undefined}
          />
        </div>
        {pode.criarProduto && (
          <div className="col-span-4 row-start-2 pl-7 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:pl-1">
            {produtosNoLimite ? (
              <button type="button" disabled className={novoProduto}>
                <IconeMais className="size-4" />
                Novo produto
              </button>
            ) : (
              <Link
                to={`${caminhoDoPainel(slug, 'cardapio/produtos/novo')}?categoria=${categoria.id}`}
                aria-label={`Novo produto em ${categoria.name}`}
                className={novoProduto}
              >
                <IconeMais className="size-4" />
                Novo produto
              </Link>
            )}
          </div>
        )}
        {pode.alterarCategoria && (
          <div className="col-start-4 row-start-1 justify-self-end sm:col-start-5">
            <BotoesDeOrdem
              quem={`a categoria ${categoria.name}`}
              lado="a-lado"
              primeiro={primeira}
              ultimo={ultima}
              ocupado={ordenando}
              aoMover={aoMoverCategoria}
            />
          </div>
        )}
      </div>

      {/* Fica no documento mesmo recolhido, para o `aria-controls` apontar para algo. */}
      <div id={idDoConteudo} hidden={!aberta}>
        {produtos.length === 0 ? (
          <p className="text-caption mt-3 border-t border-border pt-3 text-content-muted">
            Nenhum produto nesta categoria.
          </p>
        ) : (
          // Cada produto tem a linha em cima — o primeiro também: é ela que separa os produtos do nome da categoria.
          <ul className="mt-3">
            {produtos.map((produto, indice) => (
              <LinhaDoProduto
                key={produto.id}
                slug={slug}
                produto={produto}
                podeAlterar={pode.alterarProduto}
                podeExcluir={pode.excluirProduto}
                aoExcluir={() => {
                  aoExcluirProduto(produto)
                }}
                primeiro={indice === 0}
                ultimo={indice === produtos.length - 1}
                ordenando={ordenando}
                aoMover={(direcao) => {
                  aoMoverProduto(indice, direcao)
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/** Com texto, e não só o "+": a pessoa precisa ler o que o botão faz. */
const novoProduto =
  'text-caption inline-flex items-center gap-1 rounded-control border border-primary/40 px-2 py-1 font-semibold whitespace-nowrap text-primary hover:bg-primary/10 disabled:opacity-50 disabled:hover:bg-transparent'

interface LinhaDoProdutoProps {
  slug: string
  produto: Produto
  podeAlterar: boolean
  podeExcluir: boolean
  aoExcluir: () => void
  primeiro: boolean
  ultimo: boolean
  ordenando: boolean
  aoMover: (direcao: 'subir' | 'descer') => void
}

/**
 * Um produto na lista: foto, nome, preço e — o que se mexe todo dia — se está
 * disponível. A caixa grava na hora; o resto se edita nos passos do produto.
 */
function LinhaDoProduto({
  slug,
  produto,
  podeAlterar,
  podeExcluir,
  aoExcluir,
  primeiro,
  ultimo,
  ordenando,
  aoMover,
}: LinhaDoProdutoProps) {
  const disponibilidade = useDisponibilidade(slug)

  return (
    <li className="flex items-start gap-3 border-t border-border py-3">
      <Miniatura url={produto.imageUrl} />

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1">
          {/* O nome também leva à edição — para quem só pode ver, é o único caminho. */}
          <Link
            to={caminhoDoPainel(slug, `cardapio/produtos/${produto.id}`)}
            className="text-body min-w-0 font-semibold break-words text-content hover:text-primary hover:underline"
          >
            {produto.name}
          </Link>
          <EditarEExcluir
            quem={produto.name}
            editar={
              podeAlterar ? caminhoDoPainel(slug, `cardapio/produtos/${produto.id}`) : undefined
            }
            aoExcluir={podeExcluir ? aoExcluir : undefined}
          />
        </div>
        <p className="text-caption text-content-muted">
          {formatarPreco(produto.priceInCents)}
          {produto.type === 'COMBO' && (
            <span className={`${selo} ml-2 bg-brand-50 text-brand-800`}>Combo</span>
          )}
          {!produto.isAvailable && (
            <span className={`${selo} ml-2 bg-accent-100 text-accent-800`}>Esgotado</span>
          )}
        </p>

        {podeAlterar && (
          <label className="text-caption mt-1 flex w-fit items-center gap-2 text-content">
            <input
              type="checkbox"
              className="size-5"
              checked={produto.isAvailable}
              disabled={disponibilidade.isPending}
              aria-label={`Disponível: ${produto.name}`}
              onChange={() => {
                disponibilidade.mutate({ id: produto.id, isAvailable: !produto.isAvailable })
              }}
            />
            Disponível
          </label>
        )}
        {disponibilidade.isError && (
          <p role="alert" className="text-caption mt-1 text-danger">
            Não foi possível mudar a disponibilidade. Tente de novo.
          </p>
        )}
      </div>

      {podeAlterar && (
        <BotoesDeOrdem
          quem={produto.name}
          primeiro={primeiro}
          ultimo={ultimo}
          ocupado={ordenando}
          aoMover={aoMover}
        />
      )}
    </li>
  )
}
