import {
  completarPermissoes,
  PERFIL,
  PERMISSOES,
  permissoesPorGrupo,
  permissoesQueFaltam,
  senhaSchema,
  textoObrigatorio,
} from '@repo/shared'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { textoOpcional } from './form-fields'
import { chaveDoPlano, type UsoDoPlano } from './plan'
import { comSessao } from './session'

/**
 * A equipe do estabelecimento: as pessoas que entram no painel e os perfis.
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

/** Como a equipe está diante do limite do plano. `null`: o plano não limita as pessoas. */
export function equipeNoPlano(
  uso: UsoDoPlano | undefined,
): { texto: string; noLimite: boolean } | null {
  if (!uso?.plan || uso.users.limit === null) return null
  const { active, limit } = uso.users
  return {
    texto: `${String(active)} de ${String(limit)} ${limit === 1 ? 'pessoa ativa' : 'pessoas ativas'} do plano ${uso.plan.name}.`,
    noLimite: active >= limit,
  }
}

const dataEHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/** "Último acesso em 05/10/2026, 14:32" ou "Ainda não entrou no painel". */
export const ultimoAcesso = (pessoa: Pick<Pessoa, 'lastLoginAt'>) =>
  pessoa.lastLoginAt
    ? `Último acesso em ${dataEHora.format(new Date(pessoa.lastLoginAt))}`
    : 'Ainda não entrou no painel'

// --- Formulários ------------------------------------------------------------------

const nome = textoObrigatorio(120, 'Informe o nome.').refine(
  (valor) => valor.length >= 2,
  'Informe o nome.',
)

/** Cadastrar uma pessoa: o e-mail é o login, e a senha inicial segue as regras do cadastro. */
export const formularioDePessoaNovaSchema = z.object({
  name: nome,
  email: z.email('Informe um e-mail válido, como voce@exemplo.com.').max(254),
  password: senhaSchema,
  profileId: z.string().min(1, 'Escolha um perfil.'),
})
export type ValoresDaPessoaNova = z.input<typeof formularioDePessoaNovaSchema>
export type DadosDaPessoaNova = z.output<typeof formularioDePessoaNovaSchema>

export const PESSOA_NOVA: ValoresDaPessoaNova = { name: '', email: '', password: '', profileId: '' }

/** Editar uma pessoa: o nome e o perfil. O e-mail e a senha não mudam por aqui. */
export const formularioDePessoaSchema = z.object({
  name: nome,
  // Em branco no proprietário, que não tem perfil.
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

export function usePessoas(slug: string) {
  return useQuery({
    queryKey: chaveDasPessoas(slug),
    queryFn: () => comSessao<Pessoa[]>('/api/v1/admin/users'),
  })
}

export function usePerfis(slug: string) {
  return useQuery({
    queryKey: chaveDosPerfis(slug),
    queryFn: () => comSessao<Perfil[]>('/api/v1/admin/profiles'),
  })
}

/**
 * Depois de mexer numa pessoa ou num perfil, as duas listas: a das pessoas
 * mostra o nome do perfil, e a dos perfis, quantas pessoas cada um tem. E o
 * uso do plano, que conta as pessoas ativas.
 */
function marcarEquipe(queryClient: QueryClient, slug: string) {
  void queryClient.invalidateQueries({ queryKey: chaveDaEquipe(slug) })
  void queryClient.invalidateQueries({ queryKey: chaveDoPlano(slug) })
}

export function useCriarPessoa(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dados: DadosDaPessoaNova) =>
      comSessao<Pessoa>('/api/v1/admin/users', { method: 'POST', body: dados }),
    onSuccess: () => {
      marcarEquipe(queryClient, slug)
    },
  })
}

export function useAlterarPessoa(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: { name: string; profileId?: string } }) =>
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
