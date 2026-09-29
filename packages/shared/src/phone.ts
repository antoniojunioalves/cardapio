/**
 * Telefone brasileiro.
 *
 * O formato guardado é só dígitos, com o código do país: `5511987654321`. É o
 * que o link do WhatsApp espera, e é a chave com que o cliente é encontrado —
 * `(11) 98765-4321`, `11 987654321` e `+55 11 98765-4321` precisam cair no
 * mesmo cliente.
 */

/**
 * Os DDDs em uso. Uma lista, e não uma faixa: `20`, `23`, `25`, `26`, `29`,
 * `30`, `36`, `39`, `50`, `52`, `56`–`60`, `70`, `72`, `76`, `78`, `80` e `90`
 * não existem, e um número com eles é erro de digitação.
 */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
])

/**
 * Normaliza o que a pessoa digitou, ou devolve `null` se não for um telefone.
 *
 * Com 10 ou 11 dígitos é número nacional (DDD + número); com 12 ou 13 e
 * começando por 55, já veio com o país. O tamanho desfaz a ambiguidade: `55` é
 * também um DDD, do interior do Rio Grande do Sul.
 *
 * Celular tem 9 dígitos começando por 9; fixo, 8 dígitos começando de 2 a 5.
 */
export function normalizarTelefone(entrada: string): string | null {
  const digitos = entrada.replace(/\D/g, '')

  let nacional: string
  if (digitos.length === 10 || digitos.length === 11) nacional = digitos
  else if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
    nacional = digitos.slice(2)
  } else return null

  const ddd = Number(nacional.slice(0, 2))
  const numero = nacional.slice(2)
  if (!DDDS.has(ddd)) return null

  const celular = numero.length === 9 && numero.startsWith('9')
  const fixo = numero.length === 8 && /^[2-5]/.test(numero)
  if (!celular && !fixo) return null

  return `55${nacional}`
}

/** `5511987654321` → `(11) 98765-4321`. Recebe o formato normalizado. */
export function formatarTelefone(normalizado: string): string {
  const nacional = normalizado.startsWith('55') ? normalizado.slice(2) : normalizado
  const ddd = nacional.slice(0, 2)
  const numero = nacional.slice(2)
  const corte = numero.length - 4
  return `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`
}

/**
 * Aplica a máscara enquanto a pessoa digita: `1198` → `(11) 98`.
 *
 * Só apresentação — quem decide se o número vale é `normalizarTelefone`.
 */
export function mascararTelefoneDigitado(entrada: string): string {
  const d = entrada.replace(/\D/g, '').slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  const ddd = d.slice(0, 2)
  const numero = d.slice(2)
  // Fixo tem 8 dígitos (4-4); celular, 9 (5-4).
  const corte = numero.length > 8 ? 5 : 4
  if (numero.length <= corte) return `(${ddd}) ${numero}`
  return `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`
}
