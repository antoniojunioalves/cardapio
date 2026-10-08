import { useState } from 'react'

import { IconeMais } from '@/components/icons'
import { ConfirmarExclusao, EditarEExcluir } from '@/features/admin/components/catalog-parts'
import { ProfileSheet } from '@/features/admin/components/ProfileSheet'
import { usePainel } from '@/features/admin/panel'
import {
  alcanca,
  porQueNaoExcluirPerfil,
  quantasPessoas,
  resumoDoPerfil,
  useExcluirPerfil,
  usePerfis,
  usePessoas,
  type Perfil,
} from '@/features/admin/team'

const botaoPrincipal =
  'text-body inline-flex shrink-0 items-center gap-1 rounded-control bg-primary px-4 py-2.5 font-semibold text-primary-content hover:bg-primary-hover'

/**
 * Os perfis do estabelecimento, em `/{tenantSlug}/admin/equipe/perfis`: cada um
 * com o que permite e quantas pessoas o têm. Criar e editar abrem a janela do
 * perfil sobre a lista.
 *
 * Os botões seguem as regras da API: ninguém mexe num perfil com permissões
 * que ele mesmo não tem, nem no perfil que tem — e um perfil com alguém dentro
 * não se exclui.
 */
export function AdminProfilesPage() {
  const { slug, permissoes, usuario } = usePainel()
  const perfis = usePerfis(slug)
  // Só para saber qual é o perfil de quem está logado: esse ele não altera.
  const pessoas = usePessoas(slug)
  const excluir = useExcluirPerfil(slug)
  // A janela do perfil: `{}` cria um novo; com `perfil`, edita.
  const [janela, setJanela] = useState<{ perfil?: Perfil } | null>(null)
  const [excluindo, setExcluindo] = useState<Perfil | null>(null)
  const [aviso, setAviso] = useState<string>()

  const podeGerenciar = permissoes.includes('profiles:manage')
  const meuPerfil = pessoas.data?.find((p) => p.id === usuario.id)?.profile?.id

  return (
    // O título e as abas são da moldura (`TeamTabs`).
    <div className="flex flex-col gap-section-y">
      {/* No celular, o texto em cima e o botão embaixo: lado a lado, o texto vira uma coluna estreita. */}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
        <p className="text-caption min-w-0 flex-1 text-content-muted">
          Um perfil é um conjunto de permissões com nome. Cada pessoa tem um, e mudar o perfil muda
          o que todas as pessoas com ele podem fazer. O proprietário não tem perfil: tem sempre
          todas as permissões.
        </p>
        {podeGerenciar && (
          <button
            type="button"
            onClick={() => {
              setJanela({})
            }}
            className={botaoPrincipal}
          >
            <IconeMais className="size-5" />
            Novo perfil
          </button>
        )}
      </div>

      {aviso && (
        <p role="status" className="text-caption font-semibold text-success">
          {aviso}
        </p>
      )}

      {perfis.isPending ? (
        <p className="text-body text-content-muted">Carregando os perfis…</p>
      ) : perfis.isError ? (
        <p role="alert" className="text-body text-content-muted">
          Não foi possível carregar os perfis. Recarregue a página para tentar de novo.
        </p>
      ) : perfis.data.length === 0 ? (
        <p className="text-body text-content-muted">
          Nenhum perfil ainda. Sem um perfil, não dá para cadastrar pessoas.
        </p>
      ) : (
        <ul className="flex flex-col gap-stack">
          {perfis.data.map((perfil) => {
            const resumo = resumoDoPerfil(perfil.permissions)
            const meu = perfil.id === meuPerfil
            // Quem não alcança o perfil não o altera nem exclui; o próprio, ninguém altera.
            const aoAlcance = podeGerenciar && alcanca(perfil.permissions, permissoes)
            return (
              <li
                key={perfil.id}
                className="flex flex-col gap-1 rounded-card bg-surface p-card shadow-card"
              >
                <div className="flex items-start gap-1">
                  <h2 className="text-body min-w-0 font-semibold break-words text-content">
                    {perfil.name}
                  </h2>
                  <EditarEExcluir
                    quem={`o perfil ${perfil.name}`}
                    editar={
                      aoAlcance && !meu
                        ? () => {
                            setJanela({ perfil })
                          }
                        : undefined
                    }
                    aoExcluir={
                      aoAlcance && !meu
                        ? () => {
                            excluir.reset()
                            setExcluindo(perfil)
                          }
                        : undefined
                    }
                  />
                </div>
                {perfil.description && (
                  <p className="text-caption text-content-muted">{perfil.description}</p>
                )}
                {resumo.length === 0 ? (
                  <p className="text-caption text-content-muted">
                    Sem permissões: quem tem este perfil entra no painel e não vê nada.
                  </p>
                ) : (
                  <dl className="text-caption flex flex-col gap-0.5">
                    {resumo.map(({ grupo, texto }) => (
                      <div key={grupo}>
                        <dt className="inline font-semibold text-content">{grupo}: </dt>
                        <dd className="inline text-content-muted">{texto}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="text-caption text-content-muted">
                  {perfil.users === 0
                    ? 'Ninguém tem este perfil.'
                    : `${quantasPessoas(perfil.users)} com este perfil${meu ? ' — é o seu' : ''}.`}
                </p>
              </li>
            )
          })}
        </ul>
      )}

      {janela && (
        <ProfileSheet
          slug={slug}
          perfil={janela.perfil}
          minhasPermissoes={permissoes}
          aoFechar={() => {
            setJanela(null)
          }}
          aoSalvar={(salvo) => {
            setAviso(`Perfil “${salvo.name}” ${janela.perfil ? 'salvo' : 'criado'}.`)
            setJanela(null)
          }}
        />
      )}
      {excluindo && (
        <ConfirmarExclusao
          oQue="o perfil"
          nome={excluindo.name}
          consequencia="Ele deixa de existir, e isso não pode ser desfeito."
          impedimento={porQueNaoExcluirPerfil(excluindo)}
          excluir={excluir}
          aoFechar={() => {
            setExcluindo(null)
          }}
          aoConfirmar={() => {
            const { id, name } = excluindo
            excluir.mutate(id, {
              onSuccess: () => {
                setExcluindo(null)
                setAviso(`Perfil “${name}” excluído.`)
              },
            })
          }}
        />
      )}
    </div>
  )
}
