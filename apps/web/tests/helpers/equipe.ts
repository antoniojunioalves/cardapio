import { PERFIS_PRONTOS, TODAS_AS_PERMISSOES } from '@repo/shared'

import type { UsoDoPlano } from '../../src/features/admin/plan'
import { useSessaoStore } from '../../src/features/admin/session'
import type { Perfil, Pessoa } from '../../src/features/admin/team'
import { ADMIN, sessao } from './cardapio-admin'
import { abrirComLocal, mockarRotas, type Resposta } from './pagina'

/**
 * A equipe do painel nos testes: os perfis prontos, quatro pessoas e uma API
 * simulada que guarda o que recebe. Quem está logado é sempre o Zé (`id: 'u'`);
 * o que muda de um teste para o outro é o que ele é — o proprietário, ou
 * alguém com um dos perfis.
 */

const perfilPronto = (id: string, nome: string): Omit<Perfil, 'users'> => {
  const pronto = PERFIS_PRONTOS.find((p) => p.nome === nome)
  if (!pronto) throw new Error(`perfil pronto ${nome} não existe`)
  return {
    id,
    name: pronto.nome,
    description: pronto.descricao,
    permissions: [...pronto.permissoes],
  }
}

/** Sem `users`: quantas pessoas têm cada perfil a API simulada conta, como a de verdade. */
export type PerfilGuardado = Omit<Perfil, 'users'>

export const PERFIS: PerfilGuardado[] = [
  perfilPronto('pf-admin', 'Administrador'),
  perfilPronto('pf-atendente', 'Atendente'),
  perfilPronto('pf-cozinha', 'Cozinha'),
  perfilPronto('pf-gerente', 'Gerente do cardápio'),
]

export const pessoa = (dados: Partial<Pessoa> & Pick<Pessoa, 'id' | 'name'>): Pessoa => ({
  email: `${dados.id}@exemplo.com`,
  isOwner: false,
  profile: null,
  isActive: true,
  lastLoginAt: null,
  createdAt: '2026-09-01T12:00:00.000Z',
  ...dados,
})

const comPerfil = (id: string) => {
  const perfil = PERFIS.find((p) => p.id === id)
  return perfil ? { id: perfil.id, name: perfil.name } : null
}

/** O Zé é o proprietário; a Ana administra; a Bia atende; o Caio, da cozinha, está desativado. */
export const PESSOAS: Pessoa[] = [
  pessoa({ id: 'u', name: 'Zé', email: 'ze@exemplo.com', isOwner: true }),
  pessoa({ id: 'p-ana', name: 'Ana', profile: comPerfil('pf-admin') }),
  pessoa({
    id: 'p-bia',
    name: 'Bia',
    profile: comPerfil('pf-atendente'),
    lastLoginAt: '2026-10-05T17:32:00.000Z',
  }),
  pessoa({ id: 'p-caio', name: 'Caio', profile: comPerfil('pf-cozinha'), isActive: false }),
]

/** O proprietário: todas as permissões, sem perfil. */
export const PROPRIETARIO = sessao([...TODAS_AS_PERMISSOES])

/** O Zé com um dos perfis, no lugar de proprietário — e as pessoas, com ele assim. */
export function comoPerfil(perfilId: string) {
  const perfil = PERFIS.find((p) => p.id === perfilId)
  if (!perfil) throw new Error(`perfil ${perfilId} não existe`)
  return {
    sessao: sessao([...perfil.permissions]),
    pessoas: [
      pessoa({ id: 'p-dona', name: 'Dona Maria', isOwner: true }),
      ...PESSOAS.map((p) =>
        p.id === 'u' ? { ...p, isOwner: false, profile: { id: perfil.id, name: perfil.name } } : p,
      ),
    ],
  }
}

export function usoDaEquipe(ativas: number, limite: number | null): UsoDoPlano {
  return {
    plan: { code: 'FREE', name: 'Grátis' },
    orders: { used: 0, limit: 100, ceiling: 110, state: 'LIVRE' },
    users: { active: ativas, limit: limite },
    products: { used: 0, limit: null },
    categories: { used: 0, limit: null },
  }
}

export interface ApiDaEquipe {
  pessoas?: Pessoa[]
  perfis?: PerfilGuardado[]
  plano?: UsoDoPlano
  /** Respostas forçadas, por `MÉTODO /caminho` depois de `/admin`: `'POST /users'`. */
  forcar?: Record<string, Resposta>
}

export interface Envio {
  metodo: string
  caminho: string
  corpo: unknown
}

/**
 * Uma API da equipe que guarda o que recebe: cadastrar, alterar, desativar e
 * excluir mudam o que as leituras seguintes devolvem. Devolve o que foi
 * enviado, sem as leituras.
 */
export function simularEquipe(api: ApiDaEquipe = {}) {
  let pessoas = structuredClone(api.pessoas ?? PESSOAS)
  let perfis = structuredClone(api.perfis ?? PERFIS)
  let novos = 0
  const enviados: Envio[] = []
  const ok = (corpo: unknown): Resposta => ({ status: 200, corpo })
  const completo = (perfil: PerfilGuardado): Perfil => ({
    ...perfil,
    users: pessoas.filter((p) => p.profile?.id === perfil.id).length,
  })
  const doPerfil = (id: unknown) => {
    const perfil = perfis.find((p) => p.id === id)
    return perfil ? { id: perfil.id, name: perfil.name } : null
  }

  const responder = (url: string, metodo: string, corpo: unknown): Resposta => {
    const caminho = /\/api\/v1\/admin(\/.*)$/.exec(url)?.[1] ?? url
    if (metodo !== 'GET') enviados.push({ metodo, caminho, corpo })
    const forcada = api.forcar?.[`${metodo} ${caminho}`]
    if (forcada) return forcada

    const dados = (corpo ?? {}) as Record<string, unknown>
    const [, recurso, id, acao] = caminho.split('/')

    if (caminho === '/plan') return ok(api.plano ?? usoDaEquipe(3, null))
    if (caminho === '/setup-checklist') return ok({ ready: true, steps: [] })
    if (caminho === '/orders/summary') return ok({ new: 0, inProgress: 0, completedToday: 0 })

    if (recurso === 'users') {
      if (metodo === 'GET') return ok(pessoas)
      if (metodo === 'POST' && !id) {
        const criada = pessoa({
          id: `p-nova-${String(++novos)}`,
          name: dados.name as string,
          email: dados.email as string,
          profile: doPerfil(dados.profileId),
        })
        pessoas.push(criada)
        return { status: 201, corpo: criada }
      }
      if (metodo === 'PATCH') {
        pessoas = pessoas.map((p) =>
          p.id === id
            ? {
                ...p,
                ...(typeof dados.name === 'string' && { name: dados.name }),
                ...(dados.profileId !== undefined && { profile: doPerfil(dados.profileId) }),
              }
            : p,
        )
        return ok(pessoas.find((p) => p.id === id))
      }
      if (metodo === 'POST') {
        pessoas = pessoas.map((p) => (p.id === id ? { ...p, isActive: acao === 'reactivate' } : p))
        return ok(pessoas.find((p) => p.id === id))
      }
    }

    if (recurso === 'profiles') {
      if (metodo === 'GET') return ok(perfis.map(completo))
      if (metodo === 'POST') {
        const criado = {
          id: `pf-novo-${String(++novos)}`,
          name: dados.name as string,
          description: (dados.description as string | null | undefined) ?? null,
          permissions: dados.permissions as string[],
        }
        perfis.push(criado)
        return { status: 201, corpo: completo(criado) }
      }
      if (metodo === 'PUT') {
        perfis = perfis.map((p) =>
          p.id === id
            ? {
                ...p,
                name: dados.name as string,
                description: (dados.description as string | null | undefined) ?? null,
                permissions: dados.permissions as string[],
              }
            : p,
        )
        const salvo = perfis.find((p) => p.id === id)
        return salvo ? ok(completo(salvo)) : { status: 404, corpo: { error: {} } }
      }
      if (metodo === 'DELETE') {
        perfis = perfis.filter((p) => p.id !== id)
        return { status: 204, corpo: undefined }
      }
    }
    return ok({})
  }

  // Cada resposta é uma cópia, como a que chega pela rede.
  mockarRotas((url, metodo, corpo) => {
    const resposta = responder(url, metodo, corpo)
    return resposta === 'falha-de-rede'
      ? resposta
      : { status: resposta.status, corpo: structuredClone(resposta.corpo) }
  })
  return enviados
}

/** O painel num endereço da equipe (`/equipe…`), com a API simulada. */
export function abrirNaEquipe(caminho: string, api: ApiDaEquipe = {}, comSessao = PROPRIETARIO) {
  const enviados = simularEquipe(api)
  useSessaoStore.getState().guardar(comSessao)
  abrirComLocal(`${ADMIN}/equipe${caminho}`)
  return enviados
}
