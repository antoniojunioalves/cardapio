import sharp from 'sharp'

import { AppError } from '../lib/errors.js'

/**
 * O tratamento que toda imagem enviada recebe antes de ser guardada.
 *
 * O que sai daqui é **outra** imagem, refeita a partir dos pixels:
 *
 * - **sem metadado nenhum.** Foto de celular carrega a localização GPS de onde
 *   foi tirada, o modelo do aparelho e a data — e o cardápio é público. O
 *   `sharp` não copia metadados para a saída a menos que se peça, e aqui não
 *   se pede: EXIF, XMP, IPTC e perfil de cor ficam para trás;
 * - **de pé.** A câmera grava a foto deitada e anota no EXIF como girá-la;
 *   como o EXIF vai embora, o giro é aplicado aos pixels antes;
 * - **no tamanho do uso.** Uma foto de 12 MP para um cartão de 400 px é peso
 *   morto no 4G de quem abre o cardápio. Nunca aumenta imagem pequena;
 * - **em WebP**, que pesa bem menos que JPEG e PNG e mantém a transparência.
 *
 * Refazer a imagem também descarta o que estiver escondido nela: um arquivo
 * que é ao mesmo tempo JPEG válido e outra coisa sai daqui só como imagem.
 */

export type UsoDaImagem = 'logo' | 'cover' | 'categories' | 'products'

/** O maior lado da imagem guardada, em pixels, para cada uso. A proporção é mantida. */
export const LADO_MAXIMO: Record<UsoDaImagem, number> = {
  logo: 512,
  cover: 1600,
  categories: 800,
  products: 1200,
}

const QUALIDADE = 82

/**
 * Teto de pixels da imagem **de entrada**. O limite de bytes do upload não
 * basta: uma imagem enorme e lisa comprime para poucos KB e, aberta, ocupa
 * gigabytes de memória. 50 MP cobre a câmera de qualquer celular.
 */
export const LIMITE_DE_PIXELS = 50_000_000

/** Uma imagem que demora mais que isto para tratar não é uma foto de cardápio. */
const TEMPO_MAXIMO_EM_SEGUNDOS = 15

export class ImagemIlegivelError extends AppError {
  constructor() {
    super('Não foi possível ler esta imagem. Tente outra foto.', 422, 'UNREADABLE_IMAGE')
    this.name = 'ImagemIlegivelError'
  }
}

export class ImagemGrandeDemaisError extends AppError {
  constructor() {
    super(
      `A imagem tem pixels demais. Envie uma de até ${String(LIMITE_DE_PIXELS / 1_000_000)} megapixels.`,
      422,
      'IMAGE_TOO_LARGE',
    )
    this.name = 'ImagemGrandeDemaisError'
  }
}

export interface ImagemTratada {
  conteudo: Uint8Array
  tipo: 'image/webp'
  largura: number
  altura: number
}

/**
 * Trata a imagem para o uso informado. Quem chama já conferiu, pelos primeiros
 * bytes, que é JPEG, PNG ou WebP (`detectarTipoDeImagem`) — a biblioteca abre
 * outros formatos, SVG inclusive, e é aquela conferência que os mantém fora.
 */
export async function tratarImagem(conteudo: Uint8Array, uso: UsoDaImagem): Promise<ImagemTratada> {
  const lado = LADO_MAXIMO[uso]

  try {
    const { data, info } = await sharp(conteudo, {
      limitInputPixels: LIMITE_DE_PIXELS,
      // Avisos do decodificador passam — foto de celular às vezes tem; arquivo
      // cortado ou corrompido, não.
      failOn: 'error',
    })
      .autoOrient()
      .resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALIDADE })
      .timeout({ seconds: TEMPO_MAXIMO_EM_SEGUNDOS })
      .toBuffer({ resolveWithObject: true })

    return { conteudo: data, tipo: 'image/webp', largura: info.width, altura: info.height }
  } catch (error) {
    if (error instanceof Error && error.message.includes('pixel limit')) {
      throw new ImagemGrandeDemaisError()
    }
    throw new ImagemIlegivelError()
  }
}
