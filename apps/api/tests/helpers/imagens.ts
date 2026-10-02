import { randomBytes } from 'node:crypto'

import sharp from 'sharp'

/**
 * Imagens de verdade, pequenas, uma de cada formato aceito. Precisam ser
 * válidas: o upload refaz a imagem a partir dos pixels (`process-image.ts`), e
 * meia dúzia de bytes com a assinatura certa não passa mais.
 */
const quadrado = (lado = 8) =>
  sharp({
    create: { width: lado, height: lado, channels: 3, background: { r: 13, g: 148, b: 136 } },
  })

export const PNG = new Uint8Array(await quadrado().png().toBuffer())
export const JPEG = new Uint8Array(await quadrado().jpeg().toBuffer())
export const WEBP = new Uint8Array(await quadrado().webp().toBuffer())

/** Uma imagem lisa do tamanho pedido, em JPEG — pesa pouco mesmo sendo grande. */
export const jpegDe = (largura: number, altura: number): Promise<Buffer> =>
  sharp({ create: { width: largura, height: altura, channels: 3, background: '#0d9488' } })
    .jpeg()
    .toBuffer()

/** Ruído, que não comprime: uma imagem pequena em pixels e pesada em bytes, como uma foto. */
export const fotoPesada = (): Promise<Buffer> =>
  sharp(randomBytes(400 * 400 * 3), { raw: { width: 400, height: 400, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer()

/** O que o tratamento guardou: formato, tamanho e os metadados que sobraram. */
export const lerImagem = (conteudo: Uint8Array) => sharp(conteudo).metadata()

/** O modelo do aparelho gravado no EXIF da foto de celular — o que não pode sobrar depois. */
export const MODELO_DO_CELULAR = 'Celular do Ze'

/** Se os metadados EXIF apontam para um bloco de GPS (a tag 0x8825, nas duas ordens de byte). */
export const temGps = (exif: Uint8Array | undefined): boolean =>
  exif !== undefined &&
  (Buffer.from(exif).includes(Buffer.from([0x88, 0x25])) ||
    Buffer.from(exif).includes(Buffer.from([0x25, 0x88])))

/**
 * Uma "foto de celular": deitada (a câmera anota no EXIF que é para girar) e
 * com a localização de onde foi tirada.
 */
export const fotoDeCelular = (): Promise<Buffer> =>
  sharp({ create: { width: 40, height: 20, channels: 3, background: '#0d9488' } })
    // Orientação 6: "gire 90° para a direita ao mostrar".
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: 'Fabricante', Model: MODELO_DO_CELULAR },
      IFD3: {
        GPSLatitudeRef: 'S',
        GPSLatitude: '23/1 33/1 0/1',
        GPSLongitudeRef: 'W',
        GPSLongitude: '46/1 38/1 0/1',
      },
    })
    .jpeg()
    .toBuffer()

/** Um PNG com metade transparente, como um logo recortado. */
export const pngTransparente = (): Promise<Buffer> =>
  sharp({
    create: { width: 16, height: 16, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: { create: { width: 8, height: 16, channels: 4, background: '#0d9488' } },
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer()

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
