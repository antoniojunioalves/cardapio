import {
  completarPermissoes,
  PERFIL,
  PERMISSOES,
  permissoesPorGrupo,
  permissoesQueFaltam,
  textoObrigatorio,
} from '@repo/shared'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { textoOpcional } from './form-fields'
import { chaveDoPlano, type UsoDoPlano } from './plan'
import { comSessao } from './session'

/**
 * A equipe do estabelecimento: as pessoas que entram no painel, os convites e
 * os perfis.
 *
 * Quem entra na equipe entra por convite: o e-mail e o perfil. O nome, o e-mail
 * e a senha são da conta da pessoa — a mesma em todos os estabelecimentos em
 * que ela trabalha —, e ninguém daqui os muda.
 *
 * Um perfil é um conjunto de permissões com nome, montado pelo estabelecimento;
 * cada pessoa tem um, e mudar o perfil muda todas as que o têm. O proprietário
 * não tem perfil: tem sempre todas as permissões. O catálogo de permissões é o
 * de `@repo/shared`, o mesmo que a API confere.
 */

/** Um perfil, como `GET /api/v1/admin/profiles` devolve. */
export interface Perfil {
  id: string
  name: string
  description: string | null
  /** Os códigos, na ordem do catálogo. */
  permissions: string[]
  /** Quantas pessoas têm o perfil. */
  users: number
}

/** Um convite pendente, como `GET /api/v1/admin/invitations` devolve. */
export interface Convite {
  id: string
  email: string
  profile: { id: string; name: string }
  /** O nome de quem convidou. */
  invitedBy: string | null
  expiresAt: string
  /** Quando o último e-mail saiu: a criação ou o reenvio mais recente. */
  sentAt: string
  createdAt: string
}

/** O que convidar e reenviar devolvem. */
export interface EnvioDoConvite {
  invitation: Convite
  /** Falso quando o servidor de e-mail falhou: o convite vale, e dá para reenviar. */
  emailSent: boolean
}

/** Uma pessoa, como `GET /api/v1/admin/users` devolve. */
export interface Pessoa {
  id: string
  name: string
  email: string
  isOwner: boolean
  /** `null` no proprietário. */
  profile: { id: string; name: string } | null
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

// --- Regras, sem tela -------------------------------------------------------------

/** Quem tem `minhas` alcança um perfil com estas permissões? Ninguém dá o que não tem. */
export const alcanca = (doPerfil: readonly string[], minhas: readonly string[]) =>
  permissoesQueFaltam(doPerfil, minhas).length === 0

/**
 * A pessoa logada pode mexer nesta? Na conta do proprietário, só ele mesmo; em
 * quem tem um perfil, só quem alcança o perfil. Quem está sem perfil — não
 * tinha papel nenhum antes de os perfis existirem — não tem o que alcançar:
 * falta dar um a ela. É a regra da API, dita antes de oferecer o botão.
 */
export function alcancaAPessoa(
  pessoa: Pessoa,
  eu: { id: string; permissoes: readonly string[] },
  perfis: readonly Perfil[],
): boolean {
  if (pessoa.isOwner) return pessoa.id === eu.id
  if (!pessoa.profile) return true
  const perfil = perfis.find((p) => p.id === pessoa.profile?.id)
  return perfil ? alcanca(perfil.permissions, eu.permissoes) : false
}

/** Marca uma permissão — e, junto, a que ela exige: quem altera precisa ver. */
export const marcarPermissao = (marcadas: readonly string[], codigo: string): string[] =>
  completarPermissoes([...marcadas, codigo])

/** Desmarca uma permissão — e, junto, as que não servem sem ela. */
export function desmarcarPermissao(marcadas: readonly string[], codigo: string): string[] {
  const fora = new Set([codigo])
  // Até não sobrar nenhuma que exija uma das que saíram.
  for (let antes = 0; antes !== fora.size;) {
    antes = fora.size
    for (const permissao of PERMISSOES) {
      if ('requer' in permissao && fora.has(permissao.requer)) fora.add(permissao.codigo)
    }
  }
  return marcadas.filter((marcada) => !fora.has(marcada))
}

/** As permissões marcadas são outras, e não só as mesmas em outra ordem? */
export const permissoesMudaram = (antes: readonly string[], agora: readonly string[]) =>
  antes.length !== agora.length || antes.some((codigo) => !agora.includes(codigo))

const minuscula = (texto: string) => texto.charAt(0).toLowerCase() + texto.slice(1)

/**
 * O que um perfil permite, em poucas linhas, para a lista: uma por grupo que
 * tem algo marcado — "tudo", ou as permissões pelo nome. Um perfil sem nada
 * devolve a lista vazia.
 */
export function resumoDoPerfil(permissoes: readonly string[]): { grupo: string; texto: string }[] {
  return permissoesPorGrupo().flatMap(({ grupo, permissoes: doGrupo }) => {
    const marcadas = doGrupo.filter((p) => permissoes.includes(p.codigo))
    if (marcadas.length === 0) return []
    return [
      {
        grupo: grupo.nome,
        texto:
          marcadas.length === doGrupo.length
            ? 'tudo'
            : marcadas.map((p) => minuscula(p.nome)).join(', '),
      },
    ]
  })
}

/** "1 pessoa", "3 pessoas", "ninguém". */
export const quantasPessoas = (total: number) =>
  total === 0 ? 'ninguém' : total === 1 ? '1 pessoa' : `${String(total)} pessoas`

/** Por que o perfil não pode ser excluído agora, ou `null`. É a regra da API. */
export function porQueNaoExcluirPerfil(perfil: Perfil): string | null {
  if (perfil.users === 0) return null
  return perfil.users === 1
    ? 'Uma pessoa tem este perfil. Dê outro perfil a ela antes de excluir.'
    : `${String(perfil.users)} pessoas têm este perfil. Dê outro perfil a elas antes de excluir.`
}

/**
 * Como a equipe está diante do limite do plano. Os convites pendentes contam:
 * cada um é uma vaga prometida. `null`: o plano não limita as pessoas.
 */
export function equipeNoPlano(
  uso: UsoDoPlano | undefined,
): { texto: string; noLimite: boolean } | null {
  if (!uso?.plan || uso.users.limit === null) return null
  const { active, invited, limit } = uso.users
  const convites =
    invited === 0
      ? ''
      : `, contando ${invited === 1 ? '1 convite pendente' : `${String(invited)} convites pendentes`}`
  return {
    texto: `${String(active + invited)} de ${String(limit)} ${limit === 1 ? 'pessoa ativa' : 'pessoas ativas'} do plano ${uso.plan.name}${convites}.`,
    noLimite: active + invited >= limit,
  }
}

const data = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })

/** O convite já venceu? Vencido, o link não abre, e reenviar dá um novo. */
export const conviteVencido = (convite: Pick<Convite, 'expiresAt'>, agora = Date.now()) =>
  new Date(convite.expiresAt).getTime() <= agora

/** "Vale até 21/10/2026" ou "Venceu em 14/10/2026". */
export const prazoDoConvite = (convite: Pick<Convite, 'expiresAt'>, agora = Date.now()) =>
  `${conviteVencido(convite, agora) ? 'Venceu em' : 'Vale até'} ${data.format(new Date(convite.expiresAt))}`

const dataEHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/** "Último acesso em 05/10/2026, 14:32" ou "Ainda não entrou no painel". */
export const ultimoAcesso = (pessoa: Pick<Pessoa, 'lastLoginAt'>) =>
  pessoa.lastLoginAt
    ? `Último acesso em ${dataEHora.format(new Date(pessoa.lastLoginAt))}`
    : 'Ainda não entrou no painel'

// --- Formulários ------------------------------------------------------------------

/** Convidar uma pessoa: o e-mail para onde vai o link, e o perfil que ela terá. */
export const formularioDeConviteSchema = z.object({
  email: z.email('Informe um e-mail válido, como voce@exemplo.com.').max(254),
  profileId: z.string().min(1, 'Escolha um perfil.'),
})
export type ValoresDoConvite = z.input<typeof formularioDeConviteSchema>
export type DadosDoConvite = z.output<typeof formularioDeConviteSchema>

export const CONVITE_NOVO: ValoresDoConvite = { email: '', profileId: '' }

/** Editar uma pessoa: só o perfil. O nome, o e-mail e a senha são da conta dela. */
export const formularioDePessoaSchema = z.object({
  // Em branco em quem está sem perfil, que pode continuar assim.
  profileId: z.string(),
})
export type ValoresDaPessoa = z.input<typeof formularioDePessoaSchema>
export type DadosDaPessoa = z.output<typeof formularioDePessoaSchema>

export const formularioDePerfilSchema = z.object({
  name: textoObrigatorio(PERFIL.nomeMaximo, 'Informe o nome do perfil.').refine(
    (valor) => valor.length >= 2,
    'Informe o nome do perfil.',
  ),
  description: textoOpcional(PERFIL.descricaoMaxima),
})
export type ValoresDoPerfil = z.input<typeof formularioDePerfilSchema>
export type DadosDoPerfil = z.output<typeof formularioDePerfilSchema> & { permissions: string[] }

// --- API --------------------------------------------------------------------------

export const chaveDaEquipe = (slug: string) => ['painel', 'equipe', slug] as const
export const chaveDasPessoas = (slug: string) => [...chaveDaEquipe(slug), 'pessoas'] as const
export const chaveDosPerfis = (slug: string) => [...chaveDaEquipe(slug), 'perfis'] as const
export const chaveDosConvites = (slug: string) => [...chaveDaEquipe(slug), 'convites'] as const

export function usePessoas(slug: string) {
  return useQuery({
    queryKey: chaveDasPessoas(slug),
    queryFn: () => comSessao<Pessoa[]>('/api/v1/admin/users'),
  })
}

/** Só para quem vê a equipe: sem `users:read`, a API recusa. */
export function useConvites(slug: string, ativo: boolean) {
  return useQuery({
    queryKey: chaveDosConvites(slug),
    queryFn: () => comSessao<Convite[]>('/api/v1/admin/invitations'),
    enabled: ativo,
  })
}

export function usePerfis(slug: string) {
  return useQuery({
    queryKey: chaveDosPerfis(slug),
    queryFn: () => comSessao<Perfil[]>('/api/v1/admin/profiles'),
  })
}

/**
 * Depois de mexer numa pessoa, num convite ou num perfil, as listas da equipe:
 * a das pessoas mostra o nome do perfil, e a dos perfis, quantas pessoas cada
 * um tem. E o uso do plano, que conta as pessoas ativas e os convites.
 */
function marcarEquipe(queryClient: QueryClient, slug: string) {
  void queryClient.invalidateQueries({ queryKey: chaveDaEquipe(slug) })
  void queryClient.invalidateQueries({ queryKey: chaveDoPlano(slug) })
}

export function useConvidar(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dados: DadosDoConvite) =>
      comSessao<EnvioDoConvite>('/api/v1/admin/invitations', { method: 'POST', body: dados }),
    onSuccess: () => {
      marcarEquipe(queryClient, slug)
    },
  })
}

/** Um link novo para o mesmo convite: o anterior deixa de valer, e o prazo recomeça. */
export function useReenviarConvite(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      comSessao<EnvioDoConvite>(`/api/v1/admin/invitations/${id}/resend`, { method: 'POST' }),
    onSuccess: () => {
      marcarEquipe(queryClient, slug)
    },
  })
}

export function useCancelarConvite(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      comSessao<undefined>(`/api/v1/admin/invitations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      marcarEquipe(queryClient, slug)
    },
  })
}

export function useAlterarPessoa(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: { profileId: string } }) =>
      comSessao<Pessoa>(`/api/v1/admin/users/${id}`, { method: 'PATCH', body: dados }),
    onSuccess: () => {
      marcarEquipe(queryClient, slug)
    },
  })
}

/** Desativa ou reativa: a pessoa desativada sai do painel na hora e não entra mais. */
export function useDefinirAtivo(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      comSessao<Pessoa>(`/api/v1/admin/users/${id}/${ativo ? 'reactivate' : 'deactivate'}`, {
        method: 'POST',
      }),
    onSuccess: () => {
      marcarEquipe(queryClient, slug)
    },
  })
}

export function useSalvarPerfil(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dados }: { id?: string | undefined; dados: DadosDoPerfil }) =>
      id
        ? comSessao<Perfil>(`/api/v1/admin/profiles/${id}`, { method: 'PUT', body: dados })
        : comSessao<Perfil>('/api/v1/admin/profiles', { method: 'POST', body: dados }),
    onSuccess: () => {
      marcarEquipe(queryClient, slug)
    },
  })
}

export function useExcluirPerfil(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      comSessao<undefined>(`/api/v1/admin/profiles/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Perfil[]>(chaveDosPerfis(slug), (atuais) =>
        atuais?.filter((p) => p.id !== id),
      )
      marcarEquipe(queryClient, slug)
    },
  })
}
