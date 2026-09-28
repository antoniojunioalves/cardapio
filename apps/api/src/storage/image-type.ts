/**
 * Detecta o tipo de uma imagem pelos primeiros bytes do conteúdo.
 *
 * Extensão do arquivo e `Content-Type` do upload são ignorados de propósito:
 * os dois são escolhidos por quem envia. Um HTML renomeado para `foto.png`
 * passaria por qualquer checagem baseada neles e seria servido a partir do
 * nosso domínio.
 *
 * Só três formatos são aceitos, e nenhum deles executa código. **SVG fica de
 * fora** porque é XML e pode carregar `<script>`: servido pelo nosso domínio,
 * vira XSS armazenado. GIF fica de fora por não ter uso num cardápio.
 */

export type TipoDeImagem = 'image/jpeg' | 'image/png' | 'image/webp'

export const EXTENSAO: Record<TipoDeImagem, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const comeca = (bytes: Uint8Array, assinatura: readonly number[], deslocamento = 0): boolean =>
  assinatura.every((byte, i) => bytes[deslocamento + i] === byte)

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const
const JPEG = [0xff, 0xd8, 0xff] as const
const RIFF = [0x52, 0x49, 0x46, 0x46] as const // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50] as const // "WEBP", no deslocamento 8

/** Devolve o tipo detectado, ou `null` se não for um dos formatos aceitos. */
export function detectarTipoDeImagem(bytes: Uint8Array): TipoDeImagem | null {
  if (comeca(bytes, PNG)) return 'image/png'
  if (comeca(bytes, JPEG)) return 'image/jpeg'
  if (comeca(bytes, RIFF) && comeca(bytes, WEBP, 8)) return 'image/webp'
  return null
}
