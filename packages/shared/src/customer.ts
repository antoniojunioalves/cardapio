import { z } from 'zod'

import { normalizarTelefone } from './phone.js'
import { normalizarCep } from './postal-code.js'

/**
 * Cliente final e endereço, validados igual no formulário e na API.
 *
 * O formulário usa estes schemas para guiar quem preenche; a API usa os
 * mesmos para recusar. As mensagens são para a pessoa, não para o
 * desenvolvedor: "Informe o bairro.", não "String must contain at least 1
 * character(s)".
 */

/** Aceita o telefone como a pessoa digitou e entrega só dígitos, com o país. */
export const telefoneSchema = z.string().transform((valor, ctx) => {
  const normalizado = normalizarTelefone(valor)
  if (!normalizado) {
    ctx.addIssue({
      code: 'custom',
      message: 'Informe um telefone com DDD, como (11) 98765-4321.',
    })
    return z.NEVER
  }
  return normalizado
})

/** Aceita o CEP com ou sem hífen e entrega só os 8 dígitos. */
export const cepSchema = z.string().transform((valor, ctx) => {
  if (valor.trim() === '') {
    ctx.addIssue({ code: 'custom', message: 'Informe o CEP.' })
    return z.NEVER
  }
  const normalizado = normalizarCep(valor)
  if (!normalizado) {
    ctx.addIssue({ code: 'custom', message: 'Informe um CEP com 8 dígitos, como 01310-100.' })
    return z.NEVER
  }
  return normalizado
})

const limite = (maximo: number) => `Use no máximo ${String(maximo)} caracteres.`

export const textoObrigatorio = (maximo: number, mensagem: string) =>
  z.string().trim().min(1, mensagem).max(maximo, limite(maximo))

/** Campo que pode ficar em branco: vazio vira `null`, para não gravar `''`. */
export const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo, limite(maximo))
    .nullish()
    .transform((valor) => (valor ? valor : null))

export const nomeDoClienteSchema = textoObrigatorio(120, 'Informe seu nome.').refine(
  (nome) => nome.length >= 2,
  'Informe seu nome.',
)

export const enderecoSchema = z.object({
  /** Primeiro campo do endereço: é por ele que a busca nos Correios vai preencher o resto. */
  postalCode: cepSchema,
  street: textoObrigatorio(120, 'Informe a rua.'),
  number: textoObrigatorio(20, 'Informe o número, ou "s/n".'),
  complement: textoOpcional(80),
  neighborhood: textoObrigatorio(80, 'Informe o bairro.'),
  city: textoOpcional(80),
  /** "Portão azul, ao lado da padaria" — o que ajuda o entregador. */
  reference: textoOpcional(120),
})

export type Endereco = z.output<typeof enderecoSchema>

/** Corpo de `POST /api/v1/public/{tenantSlug}/customers/identify`. */
export const identificarClienteSchema = z.object({ phone: telefoneSchema })

/**
 * Endereço salvo, como a identificação por telefone devolve: **mascarado**.
 *
 * O endereço completo nunca volta por essa rota — quem digitar o telefone de
 * outra pessoa veria onde ela mora. O cliente escolhe o endereço pelo id, e o
 * servidor completa o pedido com o endereço inteiro.
 */
export const enderecoSalvoSchema = z.object({
  id: z.uuid(),
  /** `Rua das Flores, 1•• — Centro`. */
  resumo: z.string(),
  bairro: z.string(),
})

/** Resposta da identificação. `cliente` nulo: telefone sem pedido anterior aqui. */
export const clienteIdentificadoSchema = z.object({
  cliente: z
    .object({
      /** Só o primeiro nome, para cumprimentar — o nome inteiro não sai. */
      primeiroNome: z.string(),
      enderecos: z.array(enderecoSalvoSchema),
    })
    .nullable(),
})

export type EnderecoSalvo = z.output<typeof enderecoSalvoSchema>
export type ClienteIdentificado = z.output<typeof clienteIdentificadoSchema>
