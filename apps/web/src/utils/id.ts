/**
 * Um UUID v4 aleatório.
 *
 * Não usa `crypto.randomUUID`: ele só existe em contexto seguro, e o Vite
 * aberto pelo IP da rede no celular (http) não é. `getRandomValues` existe em
 * qualquer contexto e é criptograficamente forte.
 */
export function novoUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  // Versão 4 e variante RFC 4122.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
