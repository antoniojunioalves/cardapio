import { get } from 'react-hook-form'
import { z } from 'zod'

import { formatarPreco, lerReais } from '@/utils/money'

/**
 * Campos que os formulários do painel repetem: o que a pessoa digita entra
 * como texto, e sai no formato que a API espera.
 */

/** Texto livre que pode ficar em branco: em branco, vai `null` para a API. */
export const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo, `Use no máximo ${String(maximo)} caracteres.`)
    .transform((valor) => (valor === '' ? null : valor))

/**
 * O teto de preço da API: R$ 100.000,00. Não é regra de negócio — é a trava
 * contra um zero a mais digitado sem querer.
 */
export const PRECO_MAXIMO_EM_CENTAVOS = 10_000_000

/** Um preço em reais, obrigatório, que sai em centavos. Zero vale: há item grátis. */
export const preco = z.string().transform((valor, ctx) => {
  const texto = valor.trim()
  const centavos = texto === '' ? null : lerReais(texto)
  if (centavos === null) {
    ctx.addIssue({
      code: 'custom',
      message:
        texto === '' ? 'Informe o preço, como 25,90.' : 'Informe um valor em reais, como 25,90.',
    })
    return z.NEVER
  }
  if (centavos > PRECO_MAXIMO_EM_CENTAVOS) {
    ctx.addIssue({
      code: 'custom',
      message: 'O preço passa de R$ 100.000,00. Confira se não sobrou um zero.',
    })
    return z.NEVER
  }
  return centavos
})

/** Minutos, de 0 a um dia. Em branco, vai `null`. */
export const minutosOpcionais = z.string().transform((valor, ctx) => {
  const texto = valor.trim()
  if (texto === '') return null
  if (!/^\d{1,4}$/.test(texto) || Number(texto) > 24 * 60) {
    ctx.addIssue({ code: 'custom', message: 'Informe o tempo em minutos, como 30.' })
    return z.NEVER
  }
  return Number(texto)
})

/** Um valor em reais, como `20,00`, que sai em centavos. Em branco é zero. */
export const reais = z.string().transform((valor, ctx) => {
  const centavos = valor.trim() === '' ? 0 : lerReais(valor.trim())
  if (centavos === null) {
    ctx.addIssue({ code: 'custom', message: 'Informe um valor em reais, como 20,00.' })
    return z.NEVER
  }
  return centavos
})

/** `2000` → `20,00`: o valor em reais como a pessoa o digitaria, sem o "R$". */
export const reaisSemSimbolo = (centavos: number) =>
  formatarPreco(centavos)
    .replace(/R\$\s?/, '')
    .trim()

/**
 * Para o `when` de uma regra entre campos. Por padrão ela só roda com o
 * formulário inteiro válido, e a pessoa só veria o erro depois de corrigir
 * todos os outros; com isto, basta os campos da própria regra estarem válidos.
 */
export function comCamposValidos(
  campos: readonly string[],
  valido: (valor: unknown) => boolean,
): (entrada: { value: unknown }) => boolean {
  return ({ value }) => {
    const valores = value as Record<string, unknown>
    return campos.every((campo) => valido(valores[campo]))
  }
}

/**
 * Para o `onChange` de um campo que participa de uma regra entre campos.
 *
 * O erro de uma regra assim fica num campo só — "cadastre ao menos uma região"
 * fica nas regiões —, e o formulário só confere de novo o campo que mudou.
 * Corrigir pelo outro lado (trocar para taxa fixa) deixaria a mensagem na tela
 * até o próximo "Salvar". Com isto, mexer num campo confere de novo os que
 * dependem dele — mas só se já estiverem com erro, para não cobrar antes da
 * hora o que a pessoa ainda nem preencheu.
 */
export function reconferir<Campo extends string>(
  form: { formState: { errors: object }; trigger: (campos: Campo[]) => Promise<boolean> },
  ...campos: Campo[]
): () => void {
  return () => {
    if (campos.some((campo) => get(form.formState.errors, campo) !== undefined)) {
      void form.trigger(campos)
    }
  }
}

export const minutosValidos = (valor: unknown) => valor === null || typeof valor === 'number'
export const booleano = (valor: unknown) => typeof valor === 'boolean'
