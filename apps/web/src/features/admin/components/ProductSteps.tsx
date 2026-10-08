import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'

import { AO_EXCLUIR, useExcluirProduto, type Categoria, type Produto } from '../catalog'
import { caminhoDoPainel } from '../menu'
import {
  limiteNoProduto,
  NADA_NO_PRODUTO,
  podeAlgoNoProduto,
  podeNoProduto,
  SO_VE_O_CARDAPIO,
  TUDO_NO_PRODUTO,
} from '../permissions'
import {
  maisAdiante,
  NOME_DO_PASSO,
  passoAberto,
  passoAnterior,
  passosAlcancaveis,
  passosDe,
  passoSeguinte,
  type Passo,
} from '../product-steps'
import { Excluir } from './catalog-parts'
import { AvisoDeAtencao, AvisoDeSomenteLeitura, botaoDeTexto } from './form-parts'
import { Passos } from './Passos'
import { StepComboItems } from './StepComboItems'
import { StepOptions } from './StepOptions'
import { StepProduct } from './StepProduct'

/** O que acompanha o endereço enquanto o cadastro em passos não acaba. */
export interface ChegadaAoProduto {
  /** O cadastro ainda está em andamento: o título é "Novo produto", e os passos vão em ordem. */
  cadastrando?: boolean
  /** O passo mais adiante a que o cadastro já chegou. */
  ate?: Passo
  /** Algo do passo anterior que não deu certo e não impede de seguir: a foto recusada. */
  atencao?: string | undefined
}

interface ProductStepsProps {
  slug: string
  /** Sem ele, o cadastro começa: o passo do produto o cria. */
  produto?: Produto | undefined
  /** As categorias, na ordem do cardápio, para o seletor do passo do produto. */
  categorias: readonly Categoria[]
  /** A categoria já escolhida num produto novo — a de onde a pessoa clicou em "Novo produto". */
  categoriaInicial?: string | undefined
  permissoes: readonly string[]
}

const FOTO_RECUSADA =
  'O produto foi criado, mas a foto não pôde ser enviada. Volte ao passo Produto para enviar de novo.'

/**
 * O cadastro e a edição de um produto, em passos: os dados do produto — com a
 * categoria —, os itens (no combo) e os opcionais. Cada passo grava por conta
 * própria e tem o seu endereço (`?passo=`), então sair no meio não perde o que
 * já foi feito, e o "voltar" do navegador volta um passo.
 *
 * O botão de cada passo grava e leva ao seguinte ("Salvar e continuar"); o do
 * último grava e volta à lista ("Salvar"). Cadastrando, os passos vão em
 * ordem; editando, qualquer um pode ser aberto pelo cabeçalho. Um passo com
 * alteração por salvar segura a saída.
 */
export function ProductSteps({
  slug,
  produto,
  categorias,
  categoriaInicial,
  permissoes,
}: ProductStepsProps) {
  const navigate = useNavigate()
  const chegada = useLocation().state as ChegadaAoProduto | null
  const [busca] = useSearchParams()
  const excluir = useExcluirProduto(slug)
  // Produto ou combo, enquanto se escolhe no passo do produto: o combo tem um passo a mais.
  const [tipoEscolhido, setTipoEscolhido] = useState<Produto['type']>('SIMPLE')
  const [alterado, setAlterado] = useState(false)
  // O passo a que a pessoa quis ir com alteração por salvar neste.
  const [segurada, setSegurada] = useState<Passo | null>(null)

  const cadastrando = !produto || Boolean(chegada?.cadastrando)
  const passos = passosDe(produto?.type ?? tipoEscolhido)
  const atual = passoAberto(busca.get('passo'), passos, Boolean(produto))
  const ate = maisAdiante(passos, chegada?.ate, atual)
  const anterior = passoAnterior(passos, atual)

  const tem = (permissao: string) => permissoes.includes(permissao)
  // Num produto que existe, o preço, o que esgotou e o resto são permissões
  // separadas; num produto novo, quem cria informa tudo, o preço inclusive.
  const pode = produto
    ? podeNoProduto(permissoes)
    : tem('products:create')
      ? TUDO_NO_PRODUTO
      : NADA_NO_PRODUTO
  const limite = limiteNoProduto(pode)

  function irPara(passo: Passo) {
    setSegurada(null)
    void navigate(
      { search: `?passo=${passo}` },
      // A foto recusada se avisa uma vez, no passo a que se chegou.
      { state: { ...chegada, ate: maisAdiante(passos, ate, passo), atencao: undefined } },
    )
  }

  /** Para outro passo — se este não tiver alteração por salvar. */
  function pedirPara(passo: Passo) {
    if (alterado) setSegurada(passo)
    else irPara(passo)
  }

  /** Depois de gravar um passo: o seguinte — ou, no último, a volta à lista. */
  function avancar() {
    if (!produto) return
    const seguinte = passoSeguinte(passos, atual)
    if (seguinte) {
      irPara(seguinte)
      return
    }
    const oQue = produto.type === 'COMBO' ? 'Combo' : 'Produto'
    void navigate(caminhoDoPainel(slug, 'cardapio'), {
      state: {
        aviso: `${oQue} “${produto.name}” ${cadastrando ? 'cadastrado' : 'salvo'}.`,
        abrir: produto.categoryId,
      },
    })
  }

  const doPasso = {
    slug,
    aoAlterar: setAlterado,
    aoAvancar: avancar,
    aoVoltar: anterior
      ? () => {
          pedirPara(anterior)
        }
      : undefined,
  } as const

  return (
    <>
      <Passos
        passos={passos}
        atual={atual}
        alcancaveis={passosAlcancaveis(passos, {
          cadastrando,
          produtoCriado: Boolean(produto),
          ate,
        })}
        feitos={cadastrando ? passos.slice(0, passos.indexOf(ate)) : []}
        aoIr={pedirPara}
      />

      {!podeAlgoNoProduto(pode) && <AvisoDeSomenteLeitura texto={SO_VE_O_CARDAPIO} />}
      {limite && <AvisoDeSomenteLeitura texto={limite} />}
      {chegada?.atencao && <AvisoDeAtencao>{chegada.atencao}</AvisoDeAtencao>}
      {segurada && alterado && (
        <div className="flex flex-col items-start gap-1">
          <p role="alert" className="text-caption rounded-control bg-accent-50 p-3 text-accent-800">
            Este passo tem alterações por salvar. Salve-as antes de sair dele, ou descarte-as.
          </p>
          <button
            type="button"
            // Trocar de passo já o descarta: ao voltar, ele se monta de novo com o que está gravado.
            onClick={() => {
              irPara(segurada)
            }}
            className={botaoDeTexto}
          >
            Descartar e ir para {NOME_DO_PASSO[segurada]}
          </button>
        </div>
      )}

      {atual === 'produto' && (
        <StepProduct
          slug={slug}
          produto={produto}
          categorias={categorias}
          categoriaInicial={categoriaInicial}
          pode={pode}
          aoAlterar={setAlterado}
          aoMudarTipo={setTipoEscolhido}
          aoAvancar={avancar}
          aoCriar={(criado, fotoRecusada) => {
            const seguinte = passoSeguinte(passosDe(criado.type), 'produto') ?? 'opcionais'
            // No lugar desta página no histórico: "voltar" não leva a um formulário de criar em branco.
            void navigate(
              `${caminhoDoPainel(slug, `cardapio/produtos/${criado.id}`)}?passo=${seguinte}`,
              {
                replace: true,
                state: {
                  cadastrando: true,
                  ate: seguinte,
                  atencao: fotoRecusada ? FOTO_RECUSADA : undefined,
                } satisfies ChegadaAoProduto,
              },
            )
          }}
        />
      )}
      {atual === 'itens' && produto && (
        <StepComboItems {...doPasso} combo={produto} podeEditar={pode.resto} />
      )}
      {atual === 'opcionais' && produto && (
        <StepOptions {...doPasso} produto={produto} pode={pode} />
      )}

      {!cadastrando && produto && tem('products:delete') && (
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
    </>
  )
}
