import { AppError } from '../lib/errors.js'
import { detectarTipoDeImagem, type TipoDeImagem } from './image-type.js'
import type { StorageService } from './storage-service.js'

export class ImagemInvalidaError extends AppError {
  constructor() {
    super('Envie uma imagem JPEG, PNG ou WebP.', 415, 'UNSUPPORTED_MEDIA_TYPE')
    this.name = 'ImagemInvalidaError'
  }
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
 * 1. **Grava o arquivo novo.** Se falhar, nada mudou.
 * 2. **`gravar` aponta o banco para ele**, na transação e com a auditoria. Se
 *    falhar, o arquivo novo é apagado — sobraria órfão.
 * 3. **Só depois do commit apaga o antigo.** Apagá-lo antes deixaria, num
 *    rollback, o banco apontando para um arquivo que não existe mais.
 *
 * Se o passo 3 falhar, sobra um arquivo sem referência: a falha mais barata
 * possível, que ocupa disco e não quebra nada visível.
 */
export async function trocarImagem<T>(opcoes: {
  service: StorageService
  conteudo: Uint8Array
  montarChave: (tipo: TipoDeImagem) => string
  gravar: (chaveNova: string, tipo: TipoDeImagem) => Promise<ResultadoDaGravacao<T>>
}): Promise<T> {
  const tipo = detectarTipoDeImagem(opcoes.conteudo)
  if (!tipo) throw new ImagemInvalidaError()

  const chaveNova = opcoes.montarChave(tipo)
  await opcoes.service.put(chaveNova, opcoes.conteudo, tipo)

  let gravado: ResultadoDaGravacao<T>
  try {
    gravado = await opcoes.gravar(chaveNova, tipo)
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
