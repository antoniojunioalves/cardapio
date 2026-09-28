/**
 * Amostras mínimas de cada formato: só a assinatura e alguns bytes, que é
 * tudo que a detecção de tipo examina.
 */
export const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
export const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46])
export const WEBP = Uint8Array.from([
  ...Buffer.from('RIFF'),
  0x24,
  0,
  0,
  0,
  ...Buffer.from('WEBP'),
  ...Buffer.from('VP8 '),
])

export const texto = (s: string): Uint8Array => Uint8Array.from(Buffer.from(s))

/** Monta um corpo multipart/form-data com um arquivo no campo "file". */
export function corpoMultipart(
  conteudo: Uint8Array,
  opcoes: { nome?: string; contentType?: string; campo?: string } = {},
): { payload: Buffer; headers: Record<string, string> } {
  const fronteira = `----cardapio${Math.random().toString(36).slice(2)}`
  const cabecalho = Buffer.from(
    `--${fronteira}\r\n` +
      `Content-Disposition: form-data; name="${opcoes.campo ?? 'file'}"; filename="${opcoes.nome ?? 'foto.png'}"\r\n` +
      `Content-Type: ${opcoes.contentType ?? 'image/png'}\r\n\r\n`,
  )
  const rodape = Buffer.from(`\r\n--${fronteira}--\r\n`)

  return {
    payload: Buffer.concat([cabecalho, Buffer.from(conteudo), rodape]),
    headers: { 'content-type': `multipart/form-data; boundary=${fronteira}` },
  }
}
