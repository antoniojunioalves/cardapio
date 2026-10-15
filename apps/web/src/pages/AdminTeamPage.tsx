import { useId, useState } from 'react'

import { IconeMais } from '@/components/icons'
import { Sheet } from '@/components/Sheet'
import { EditarEExcluir } from '@/features/admin/components/catalog-parts'
import {
  AvisoDeAtencao,
  botaoDeTexto,
  botaoDeTextoPerigo,
} from '@/features/admin/components/form-parts'
import { InviteSheet, PersonSheet } from '@/features/admin/components/PersonSheet'
import { usePainel } from '@/features/admin/panel'
import { usePlano } from '@/features/admin/plan'
import {
  alcanca,
  alcancaAPessoa,
  conviteVencido,
  equipeNoPlano,
  prazoDoConvite,
  ultimoAcesso,
  useCancelarConvite,
  useConvites,
  useDefinirAtivo,
  usePerfis,
  usePessoas,
  useReenviarConvite,
  type Convite,
  type EnvioDoConvite,
  type Pessoa,
} from '@/features/admin/team'
import { ApiError } from '@/services/api'

const botaoPrincipal =
  'text-body inline-flex shrink-0 items-center gap-1 rounded-control bg-primary px-4 py-2.5 font-semibold text-primary-content hover:bg-primary-hover disabled:opacity-50'
const selo = 'text-caption rounded-pill px-2 py-0.5 font-semibold'

/** A mensagem de uma recusa da API — que já fala com quem usa o painel — ou a genérica. */
const explicar = (erro: unknown, generica: string) =>
  erro instanceof ApiError && [403, 404, 409, 429].includes(erro.status) ? erro.message : generica

/**
 * As pessoas que entram no painel, em `/{tenantSlug}/admin/equipe`: quem é, com
 * que e-mail entra e o que pode fazer — o perfil. E os convites que ainda não
 * foram aceitos.
 *
 * Quem entra na equipe entra por convite: o e-mail e o perfil. O nome e a
 * senha são da conta da pessoa, e só ela os muda; daqui, muda-se o perfil e se
 * ela tem acesso.
 *
 * Os botões seguem as regras da API: só o proprietário mexe na conta dele,
 * ninguém mexe em quem tem um perfil com permissões que ele mesmo não tem — nem
 * no convite para um perfil assim —, e ninguém se desativa nem muda o próprio
 * perfil.
 */
export function AdminTeamPage() {
  const { slug, permissoes, usuario } = usePainel()
  const pessoas = usePessoas(slug)
  const perfis = usePerfis(slug)
  const convites = useConvites(slug, true)
  const plano = equipeNoPlano(usePlano(slug, true).data)
  const definirAtivo = useDefinirAtivo(slug)
  const reenviar = useReenviarConvite(slug)
  const cancelar = useCancelarConvite(slug)
  const idDosConvites = useId()
  // A janela: `{}` convida uma pessoa; com `pessoa`, muda o perfil dela.
  const [janela, setJanela] = useState<{ pessoa?: Pessoa } | null>(null)
  const [desativando, setDesativando] = useState<Pessoa | null>(null)
  const [cancelando, setCancelando] = useState<Convite | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; atencao?: boolean }>()

  const pode = {
    convidar: permissoes.includes('users:create'),
    alterar: permissoes.includes('users:update'),
    desativar: permissoes.includes('users:delete'),
  }
  const eu = { id: usuario.id, permissoes }
  // Os perfis que a pessoa logada pode dar a alguém.
  const perfisAoAlcance = (perfis.data ?? []).filter((p) => alcanca(p.permissions, permissoes))
  const alcancaOConvite = (convite: Convite) => {
    const perfil = perfis.data?.find((p) => p.id === convite.profile.id)
    return perfil !== undefined && alcanca(perfil.permissions, permissoes)
  }

  function definir(pessoa: Pessoa, ativo: boolean) {
    setAviso(undefined)
    definirAtivo.mutate(
      { id: pessoa.id, ativo },
      {
        onSuccess: () => {
          setDesativando(null)
          setAviso({
            texto: `${pessoa.name} ${ativo ? 'voltou a ter' : 'não tem mais'} acesso ao painel.`,
          })
        },
      },
    )
  }

  function avisarEnvio({ invitation, emailSent }: EnvioDoConvite, de: 'novo' | 'reenvio') {
    setAviso(
      emailSent
        ? {
            texto:
              de === 'novo'
                ? `Convite enviado para ${invitation.email}. A pessoa entra pelo link do e-mail.`
                : `Convite reenviado para ${invitation.email}, com um link novo.`,
          }
        : {
            texto: `O convite para ${invitation.email} está feito, mas o e-mail não saiu. Tente reenviar daqui a alguns minutos.`,
            atencao: true,
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
        {pode.convidar && (
          <button
            type="button"
            disabled={plano?.noLimite}
            onClick={() => {
              setJanela({})
            }}
            className={botaoPrincipal}
          >
            <IconeMais className="size-5" />
            Convidar pessoa
          </button>
        )}
      </div>

      {aviso &&
        (aviso.atencao ? (
          <AvisoDeAtencao>{aviso.texto}</AvisoDeAtencao>
        ) : (
          <p role="status" className="text-caption font-semibold text-success">
            {aviso.texto}
          </p>
        ))}
      {pode.convidar && plano?.noLimite && (
        <AvisoDeAtencao>
          A equipe chegou ao limite de pessoas do plano, contando os convites pendentes. Para
          convidar outra, desative uma pessoa, cancele um convite ou mude de plano.
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
            // O que se muda numa pessoa é o perfil: o proprietário não tem um, e
            // ninguém muda o próprio.
            const podeAlterar = pode.alterar && aoAlcance && !pessoa.isOwner && !souEu
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
                      podeAlterar
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

      {convites.data && convites.data.length > 0 && (
        <section aria-labelledby={idDosConvites} className="flex flex-col gap-stack">
          <h2 id={idDosConvites} className="text-body font-semibold text-content">
            Convites pendentes
          </h2>
          {(reenviar.isError || cancelar.isError) && !cancelando && (
            <p role="alert" className="text-caption text-danger">
              {explicar(
                reenviar.error ?? cancelar.error,
                'Não foi possível mexer no convite agora. Tente de novo.',
              )}
            </p>
          )}
          <ul className="flex flex-col gap-stack">
            {convites.data.map((convite) => {
              const vencido = conviteVencido(convite)
              const podeMexer = pode.convidar && alcancaOConvite(convite)
              return (
                <li
                  key={convite.id}
                  className="flex flex-col gap-1 rounded-card bg-surface p-card shadow-card"
                >
                  <p className="text-body font-semibold break-all text-content">{convite.email}</p>
                  <p className="flex flex-wrap items-center gap-2">
                    <span className={`${selo} bg-brand-50 text-brand-800`}>
                      {convite.profile.name}
                    </span>
                    <span
                      className={`${selo} ${vencido ? 'bg-accent-100 text-accent-800' : 'bg-surface-muted text-content'}`}
                    >
                      {vencido ? 'Vencido' : 'Aguardando aceite'}
                    </span>
                  </p>
                  <p className="text-caption text-content-muted">
                    {prazoDoConvite(convite)}
                    {convite.invitedBy && ` · Enviado por ${convite.invitedBy}`}
                  </p>
                  {podeMexer && (
                    <div className="-ml-2 flex flex-wrap gap-1">
                      <button
                        type="button"
                        aria-label={`Reenviar o convite para ${convite.email}`}
                        disabled={reenviar.isPending}
                        onClick={() => {
                          setAviso(undefined)
                          cancelar.reset()
                          reenviar.mutate(convite.id, {
                            onSuccess: (envio) => {
                              avisarEnvio(envio, 'reenvio')
                            },
                          })
                        }}
                        className={botaoDeTexto}
                      >
                        Reenviar
                      </button>
                      <button
                        type="button"
                        aria-label={`Cancelar o convite para ${convite.email}`}
                        onClick={() => {
                          reenviar.reset()
                          cancelar.reset()
                          setCancelando(convite)
                        }}
                        className={botaoDeTextoPerigo}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {janela &&
        (janela.pessoa ? (
          <PersonSheet
            slug={slug}
            pessoa={janela.pessoa}
            perfis={perfisAoAlcance}
            aoFechar={() => {
              setJanela(null)
            }}
            aoSalvar={(salva) => {
              setAviso({ texto: `${salva.name}: perfil salvo.` })
              setJanela(null)
            }}
          />
        ) : (
          <InviteSheet
            slug={slug}
            perfis={perfisAoAlcance}
            aoFechar={() => {
              setJanela(null)
            }}
            aoConvidar={(envio) => {
              avisarEnvio(envio, 'novo')
              setJanela(null)
            }}
          />
        ))}

      {cancelando && (
        <Sheet
          titulo={`Cancelar o convite para ${cancelando.email}?`}
          aoFechar={() => {
            setCancelando(null)
          }}
          rodape={
            <button
              type="button"
              disabled={cancelar.isPending}
              onClick={() => {
                const { id, email } = cancelando
                cancelar.mutate(id, {
                  onSuccess: () => {
                    setCancelando(null)
                    setAviso({ texto: `O convite para ${email} foi cancelado.` })
                  },
                })
              }}
              className="text-body w-full rounded-control bg-danger px-4 py-3 font-semibold text-content-inverted disabled:opacity-50"
            >
              {cancelar.isPending ? 'Cancelando…' : 'Cancelar convite'}
            </button>
          }
        >
          <p className="text-body text-content">
            O link do e-mail deixa de valer, e a vaga do plano fica livre. Se mudar de ideia, é só
            convidar de novo.
          </p>
          {cancelar.isError && (
            <p role="alert" className="text-caption mt-stack text-danger">
              {explicar(cancelar.error, 'Não foi possível cancelar agora. Tente de novo.')}
            </p>
          )}
        </Sheet>
      )}

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
