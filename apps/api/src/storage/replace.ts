import { AppError } from '../lib/errors.js'
import { detectarTipoDeImagem } from './image-type.js'
import { novaChaveDeImagem } from './keys.js'
import { tratarImagem, type UsoDaImagem } from './process-image.js'
import type { StorageService } from './storage-service.js'

export class ImagemInvalidaError extends AppError {
  constructor() {
    super('Envie uma imagem JPEG, PNG ou WebP.', 415, 'UNSUPPORTED_MEDIA_TYPE')
    this.name = 'ImagemInvalidaError'
  }
}

/** O que foi guardado, para a auditoria de quem troca a imagem. */
export interface ImagemGuardada {
  tipo: 'image/webp'
  bytes: number
  largura: number
  altura: number
}

export interface ResultadoDaGravacao<T> {
  resultado: T
  /** A chave que a entidade tinha antes, para ser apagada depois do commit. */
  chaveAntiga: string | null
}

/**
 * Troca a imagem de uma entidade — logo, capa, categoria, produto.
 *
 * Único lugar do projeto que implementa esta sequência, porque a ordem é o que
 * mantém banco e disco coerentes quando algo falha no meio:
 *
 * 1. **Confere o formato e trata a imagem** (`tratarImagem`): sem metadados, de
 *    pé, no tamanho do uso, em WebP. O arquivo enviado nunca é guardado.
 * 2. **Grava o arquivo tratado.** Se falhar, nada mudou.
 * 3. **`gravar` aponta o banco para ele**, na transação e com a auditoria. Se
 *    falhar, o arquivo novo é apagado — sobraria órfão.
 * 4. **Só depois do commit apaga o antigo.** Apagá-lo antes deixaria, num
 *    rollback, o banco apontando para um arquivo que não existe mais.
 *
 * Se o passo 4 falhar, sobra um arquivo sem referência: a falha mais barata
 * possível, que ocupa disco e não quebra nada visível.
 */
export async function trocarImagem<T>(opcoes: {
  service: StorageService
  tenantId: string
  uso: UsoDaImagem
  conteudo: Uint8Array
  gravar: (chaveNova: string, imagem: ImagemGuardada) => Promise<ResultadoDaGravacao<T>>
}): Promise<T> {
  if (!detectarTipoDeImagem(opcoes.conteudo)) throw new ImagemInvalidaError()

  const tratada = await tratarImagem(opcoes.conteudo, opcoes.uso)
  const chaveNova = novaChaveDeImagem(opcoes.tenantId, opcoes.uso)
  await opcoes.service.put(chaveNova, tratada.conteudo, tratada.tipo)

  let gravado: ResultadoDaGravacao<T>
  try {
    gravado = await opcoes.gravar(chaveNova, {
      tipo: tratada.tipo,
      bytes: tratada.conteudo.byteLength,
      largura: tratada.largura,
      altura: tratada.altura,
    })
  } catch (error) {
    await opcoes.service.delete(chaveNova)
    throw error
  }

  if (gravado.chaveAntiga) await opcoes.service.delete(gravado.chaveAntiga)
  return gravado.resultado
}

/**
 * Remove a imagem de uma entidade. Mesma regra: banco primeiro, arquivo só
 * depois do commit.
 */
export async function removerImagem<T>(opcoes: {
  service: StorageService
  remover: () => Promise<ResultadoDaGravacao<T>>
}): Promise<T> {
  const { resultado, chaveAntiga } = await opcoes.remover()
  if (chaveAntiga) await opcoes.service.delete(chaveAntiga)
  return resultado
}
