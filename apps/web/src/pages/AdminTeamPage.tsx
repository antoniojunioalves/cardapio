import { useState } from 'react'

import { IconeMais } from '@/components/icons'
import { Sheet } from '@/components/Sheet'
import { EditarEExcluir } from '@/features/admin/components/catalog-parts'
import {
  AvisoDeAtencao,
  botaoDeTexto,
  botaoDeTextoPerigo,
} from '@/features/admin/components/form-parts'
import { NewPersonSheet, PersonSheet } from '@/features/admin/components/PersonSheet'
import { usePainel } from '@/features/admin/panel'
import { usePlano } from '@/features/admin/plan'
import {
  alcanca,
  alcancaAPessoa,
  equipeNoPlano,
  ultimoAcesso,
  useDefinirAtivo,
  usePerfis,
  usePessoas,
  type Pessoa,
} from '@/features/admin/team'
import { ApiError } from '@/services/api'

const botaoPrincipal =
  'text-body inline-flex shrink-0 items-center gap-1 rounded-control bg-primary px-4 py-2.5 font-semibold text-primary-content hover:bg-primary-hover disabled:opacity-50'
const selo = 'text-caption rounded-pill px-2 py-0.5 font-semibold'

/**
 * As pessoas que entram no painel, em `/{tenantSlug}/admin/equipe`: quem é, com
 * que e-mail entra e o que pode fazer — o perfil. Cadastrar e editar abrem uma
 * janela sobre a lista.
 *
 * Os botões seguem as regras da API: só o proprietário mexe na conta dele,
 * ninguém mexe em quem tem um perfil com permissões que ele mesmo não tem, e
 * ninguém se desativa nem muda o próprio perfil.
 */
export function AdminTeamPage() {
  const { slug, permissoes, usuario } = usePainel()
  const pessoas = usePessoas(slug)
  const perfis = usePerfis(slug)
  const plano = equipeNoPlano(usePlano(slug, true).data)
  const definirAtivo = useDefinirAtivo(slug)
  // A janela: `{}` cadastra uma pessoa; com `pessoa`, edita.
  const [janela, setJanela] = useState<{ pessoa?: Pessoa } | null>(null)
  const [desativando, setDesativando] = useState<Pessoa | null>(null)
  const [aviso, setAviso] = useState<string>()

  const pode = {
    cadastrar: permissoes.includes('users:create'),
    alterar: permissoes.includes('users:update'),
    desativar: permissoes.includes('users:delete'),
  }
  const eu = { id: usuario.id, permissoes }
  // Os perfis que a pessoa logada pode dar a alguém.
  const perfisAoAlcance = (perfis.data ?? []).filter((p) => alcanca(p.permissions, permissoes))

  function definir(pessoa: Pessoa, ativo: boolean) {
    setAviso(undefined)
    definirAtivo.mutate(
      { id: pessoa.id, ativo },
      {
        onSuccess: () => {
          setDesativando(null)
          setAviso(`${pessoa.name} ${ativo ? 'voltou a ter' : 'não tem mais'} acesso ao painel.`)
        },
      },
    )
  }

  return (
    // O título e as abas são da moldura (`TeamTabs`).
    <div className="flex flex-col gap-section-y">
      {/* No celular, o texto em cima e o botão embaixo: lado a lado, o texto vira uma coluna estreita. */}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
        <p className="text-caption min-w-0 flex-1 text-content-muted">
          Quem entra no painel do estabelecimento. O que cada pessoa pode fazer vem do perfil dela.{' '}
          {plano?.texto}
        </p>
        {pode.cadastrar && (
          <button
            type="button"
            disabled={plano?.noLimite}
            onClick={() => {
              setJanela({})
            }}
            className={botaoPrincipal}
          >
            <IconeMais className="size-5" />
            Nova pessoa
          </button>
        )}
      </div>

      {aviso && (
        <p role="status" className="text-caption font-semibold text-success">
          {aviso}
        </p>
      )}
      {pode.cadastrar && plano?.noLimite && (
        <AvisoDeAtencao>
          A equipe chegou ao limite de pessoas ativas do plano. Para cadastrar outra, desative uma
          pessoa ou mude de plano.
        </AvisoDeAtencao>
      )}
      {definirAtivo.isError && !desativando && (
        <p role="alert" className="text-caption text-danger">
          {definirAtivo.error instanceof ApiError && [403, 409].includes(definirAtivo.error.status)
            ? definirAtivo.error.message
            : 'Não foi possível mudar o acesso agora. Tente de novo.'}
        </p>
      )}

      {pessoas.isPending || perfis.isPending ? (
        <p className="text-body text-content-muted">Carregando a equipe…</p>
      ) : pessoas.isError || perfis.isError ? (
        <p role="alert" className="text-body text-content-muted">
          Não foi possível carregar a equipe. Recarregue a página para tentar de novo.
        </p>
      ) : (
        <ul className="flex flex-col gap-stack">
          {pessoas.data.map((pessoa) => {
            const souEu = pessoa.id === usuario.id
            const aoAlcance = alcancaAPessoa(pessoa, eu, perfis.data)
            const podeDesativar = pode.desativar && aoAlcance && !pessoa.isOwner && !souEu
            return (
              <li
                key={pessoa.id}
                className="flex flex-col gap-1 rounded-card bg-surface p-card shadow-card"
              >
                <div className="flex items-start gap-1">
                  <h2 className="text-body min-w-0 font-semibold break-words text-content">
                    {pessoa.name}
                  </h2>
                  <EditarEExcluir
                    quem={pessoa.name}
                    editar={
                      pode.alterar && aoAlcance
                        ? () => {
                            setJanela({ pessoa })
                          }
                        : undefined
                    }
                  />
                </div>
                <p className="text-caption break-all text-content-muted">{pessoa.email}</p>
                <p className="flex flex-wrap items-center gap-2">
                  <span className={`${selo} bg-brand-50 text-brand-800`}>
                    {pessoa.isOwner ? 'Proprietário' : (pessoa.profile?.name ?? 'Sem perfil')}
                  </span>
                  {!pessoa.isOwner && !pessoa.profile && (
                    <span className="text-caption text-content-muted">
                      Entra no painel e não vê nada.
                    </span>
                  )}
                  {souEu && <span className={`${selo} bg-surface-muted text-content`}>Você</span>}
                  {!pessoa.isActive && (
                    <span className={`${selo} bg-accent-100 text-accent-800`}>Desativada</span>
                  )}
                </p>
                <p className="text-caption text-content-muted">{ultimoAcesso(pessoa)}</p>
                {podeDesativar && (
                  <div className="-ml-2">
                    {pessoa.isActive ? (
                      <button
                        type="button"
                        aria-label={`Desativar ${pessoa.name}`}
                        onClick={() => {
                          definirAtivo.reset()
                          setDesativando(pessoa)
                        }}
                        className={botaoDeTextoPerigo}
                      >
                        Desativar
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Reativar ${pessoa.name}`}
                        disabled={definirAtivo.isPending}
                        onClick={() => {
                          definir(pessoa, true)
                        }}
                        className={botaoDeTexto}
                      >
                        Reativar
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {janela &&
        (janela.pessoa ? (
          <PersonSheet
            slug={slug}
            pessoa={janela.pessoa}
            perfis={perfisAoAlcance}
            souEu={janela.pessoa.id === usuario.id}
            aoFechar={() => {
              setJanela(null)
            }}
            aoSalvar={(salva) => {
              setAviso(`${salva.name}: alterações salvas.`)
              setJanela(null)
            }}
          />
        ) : (
          <NewPersonSheet
            slug={slug}
            perfis={perfisAoAlcance}
            aoFechar={() => {
              setJanela(null)
            }}
            aoSalvar={(criada) => {
              setAviso(
                `${criada.name} foi cadastrada. Passe a ela o e-mail e a senha para entrar no painel.`,
              )
              setJanela(null)
            }}
          />
        ))}

      {desativando && (
        <Sheet
          titulo={`Desativar ${desativando.name}?`}
          aoFechar={() => {
            setDesativando(null)
          }}
          rodape={
            <button
              type="button"
              disabled={definirAtivo.isPending}
              onClick={() => {
                definir(desativando, false)
              }}
              className="text-body w-full rounded-control bg-danger px-4 py-3 font-semibold text-content-inverted disabled:opacity-50"
            >
              {definirAtivo.isPending ? 'Desativando…' : 'Desativar'}
            </button>
          }
        >
          <p className="text-body text-content">
            A pessoa sai do painel na hora e não entra mais, até ser reativada. O que ela fez
            continua registrado.
          </p>
          {definirAtivo.isError && (
            <p role="alert" className="text-caption mt-stack text-danger">
              {definirAtivo.error instanceof ApiError &&
              [403, 409].includes(definirAtivo.error.status)
                ? definirAtivo.error.message
                : 'Não foi possível desativar agora. Tente de novo.'}
            </p>
          )}
        </Sheet>
      )}
    </div>
  )
}
