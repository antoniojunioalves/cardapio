import { senhaSchema, textoObrigatorio } from '@repo/shared'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'

import { comSessao, renomearNaSessao, trocarSenha, type UsuarioDoPainel } from './session'

/**
 * "Minha conta": o nome e a senha da própria pessoa. A conta é uma só em todos
 * os estabelecimentos em que ela trabalha, e a mudança vale em todos.
 */

export const formularioDoNomeSchema = z.object({
  name: textoObrigatorio(120, 'Informe o seu nome.').refine(
    (valor) => valor.length >= 2,
    'Informe o seu nome.',
  ),
})
export type ValoresDoNome = z.input<typeof formularioDoNomeSchema>
export type DadosDoNome = z.output<typeof formularioDoNomeSchema>

/** A senha nova segue as regras do cadastro, as mesmas que a API confere. */
export const formularioDaSenhaSchema = z.object({
  atual: z.string().min(1, 'Informe a senha atual.'),
  nova: senhaSchema,
})
export type ValoresDaSenha = z.input<typeof formularioDaSenhaSchema>
export type DadosDaSenha = z.output<typeof formularioDaSenhaSchema>

export const SENHA_EM_BRANCO: ValoresDaSenha = { atual: '', nova: '' }

/** O nome novo vai também para o que o painel guarda da sessão: o menu o mostra na hora. */
export function useRenomearConta() {
  return useMutation({
    mutationFn: (dados: DadosDoNome) =>
      comSessao<UsuarioDoPainel>('/api/v1/auth/account', { method: 'PATCH', body: dados }),
    onSuccess: (usuario) => {
      renomearNaSessao(usuario.name)
    },
  })
}

/** A sessão nova que a troca devolve é guardada por `trocarSenha`. */
export function useTrocarSenha() {
  return useMutation({
    mutationFn: (dados: DadosDaSenha) => trocarSenha(dados.atual, dados.nova),
  })
}
