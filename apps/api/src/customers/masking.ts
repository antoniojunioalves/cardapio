/**
 * O que a identificação por telefone pode revelar, sem banco nem framework.
 *
 * Telefone não prova identidade: quem digitar o número de outra pessoa recebe
 * esta resposta. Então ela revela só o bastante para o próprio cliente
 * reconhecer o seu endereço — a rua e o bairro, com o número mascarado — e
 * nada que leve até a porta: número, complemento, referência. É o primeiro
 * passo da quitação registrada no ROADMAP; o segundo é o OTP.
 */

/** `123` → `1••`. `s/n` fica como está: não há o que esconder. */
export function mascararNumero(numero: string): string {
  const limpo = numero.trim()
  if (/^s\/?n$/i.test(limpo)) return limpo
  if (limpo.length <= 1) return '•'
  return limpo.charAt(0) + '•'.repeat(limpo.length - 1)
}

/** `Rua das Flores, 1•• — Centro`. Complemento, cidade e referência ficam de fora. */
export function resumoMascarado(endereco: {
  street: string
  number: string
  neighborhood: string
}): string {
  return `${endereco.street}, ${mascararNumero(endereco.number)} — ${endereco.neighborhood}`
}

/** `João da Silva` → `João`. O sobrenome não sai. */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? ''
}
