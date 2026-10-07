import { useState } from 'react'

import { IconeMais } from '@/components/icons'
import { ConfirmarExclusao, EditarEExcluir } from '@/features/admin/components/catalog-parts'
import { AvisoDeSomenteLeitura } from '@/features/admin/components/form-parts'
import { OptionGroupSheet } from '@/features/admin/components/OptionGroupSheet'
import {
  listaEmPalavras,
  opcoesEmPalavras,
  porQueNaoExcluirGrupo,
  regraEmPalavras,
  useExcluirGrupo,
  useGrupos,
  type GrupoDeOpcoes,
} from '@/features/admin/option-groups'
import { usePainel } from '@/features/admin/panel'

const botaoPrincipal =
  'text-body inline-flex shrink-0 items-center gap-1 rounded-control bg-primary px-4 py-2.5 font-semibold text-primary-content hover:bg-primary-hover'

/**
 * Os grupos de opcionais do estabelecimento, em
 * `/{tenantSlug}/admin/cardapio/opcionais`: tamanho, adicionais, o que dá para
 * tirar. Um grupo vale para vários produtos; em quais ele aparece se escolhe no
 * passo Opcionais de cada produto. Criar e editar um grupo abrem a janela dele
 * por cima da lista — a mesma do passo do produto.
 */
export function AdminOptionGroupsPage() {
  const { slug, permissoes } = usePainel()
  const grupos = useGrupos(slug)
  const excluir = useExcluirGrupo(slug)
  const [excluindo, setExcluindo] = useState<GrupoDeOpcoes | null>(null)
  // A janela do grupo: `{}` cria um novo; com `grupo`, edita.
  const [janela, setJanela] = useState<{ grupo?: GrupoDeOpcoes } | null>(null)
  const [aviso, setAviso] = useState<string>()
  const podeAlterar = permissoes.includes('products:update')
  const abrirNovo = () => {
    setJanela({})
  }

  return (
    // O título e as abas são da moldura (`CardapioTabs`).
    <div className="flex flex-col gap-section-y">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-caption min-w-0 flex-1 text-content-muted">
          Tamanho, adicionais, o que dá para tirar do lanche. Um grupo vale para vários produtos: em
          quais ele aparece, você escolhe no passo Opcionais de cada produto.
        </p>
        {podeAlterar && grupos.data && grupos.data.length > 0 && (
          <button type="button" onClick={abrirNovo} className={botaoPrincipal}>
            <IconeMais className="size-5" />
            Novo grupo
          </button>
        )}
      </div>

      {aviso && (
        <p role="status" className="text-caption font-semibold text-success">
          {aviso}
        </p>
      )}
      {!podeAlterar && (
        <AvisoDeSomenteLeitura texto="Você pode ver o cardápio, mas só quem administra o estabelecimento o altera." />
      )}

      {grupos.isPending ? (
        <p className="text-body text-content-muted">Carregando os opcionais…</p>
      ) : grupos.isError ? (
        <p role="alert" className="text-body text-content-muted">
          Não foi possível carregar os opcionais. Recarregue a página para tentar de novo.
        </p>
      ) : grupos.data.length === 0 ? (
        <section className="flex flex-col items-start gap-stack rounded-card bg-surface p-card shadow-card">
          <h2 className="text-body font-semibold text-content">Nenhum grupo de opcionais ainda</h2>
          <p className="text-body text-content-muted">
            Exemplos: <strong>Tamanho</strong> (pequeno, médio, grande), <strong>Adicionais</strong>{' '}
            (bacon, ovo, cheddar) ou <strong>Retirar</strong> (cebola, tomate). Sem grupos, o
            cliente pede cada produto como ele está.
          </p>
          {podeAlterar && (
            <button type="button" onClick={abrirNovo} className={botaoPrincipal}>
              Criar o primeiro grupo
            </button>
          )}
        </section>
      ) : (
        <ul className="flex flex-col gap-stack">
          {grupos.data.map((grupo) => (
            <li
              key={grupo.id}
              className="flex flex-col gap-1 rounded-card bg-surface p-card shadow-card"
            >
              <div className="flex items-start gap-1">
                <h2 className="text-body min-w-0 font-semibold break-words text-content">
                  {grupo.name}
                </h2>
                <EditarEExcluir
                  quem={`o grupo ${grupo.name}`}
                  editar={
                    podeAlterar
                      ? () => {
                          setJanela({ grupo })
                        }
                      : undefined
                  }
                  aoExcluir={
                    podeAlterar
                      ? () => {
                          excluir.reset()
                          setExcluindo(grupo)
                        }
                      : undefined
                  }
                />
              </div>
              <p className="text-caption font-semibold text-content">{regraEmPalavras(grupo)}</p>
              <p className="text-caption text-content-muted">{opcoesEmPalavras(grupo.options)}</p>
              <p className="text-caption text-content-muted">
                {grupo.products.length === 0
                  ? 'Ainda não está em nenhum produto.'
                  : `Em ${listaEmPalavras(grupo.products.map((p) => p.name))}.`}
              </p>
            </li>
          ))}
        </ul>
      )}

      {janela && (
        <OptionGroupSheet
          slug={slug}
          grupo={janela.grupo}
          aoFechar={() => {
            setJanela(null)
          }}
          aoSalvar={(salvo) => {
            setAviso(`Grupo “${salvo.name}” ${janela.grupo ? 'salvo' : 'criado'}.`)
            setJanela(null)
          }}
        />
      )}
      {excluindo && (
        <ConfirmarExclusao
          oQue="o grupo"
          nome={excluindo.name}
          consequencia="Ele e as opções dele deixam de existir, e isso não pode ser desfeito."
          impedimento={porQueNaoExcluirGrupo(excluindo)}
          excluir={excluir}
          aoFechar={() => {
            setExcluindo(null)
          }}
          aoConfirmar={() => {
            const { id, name } = excluindo
            excluir.mutate(id, {
              onSuccess: () => {
                setExcluindo(null)
                setAviso(`Grupo “${name}” excluído.`)
              },
            })
          }}
        />
      )}
    </div>
  )
}
