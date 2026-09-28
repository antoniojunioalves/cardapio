import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { assertChaveValida, type StorageService } from './storage-service.js'

/**
 * Guarda os arquivos no disco local. Adequado para desenvolvimento e para uma
 * instância única; com mais de uma instância, cada uma teria o seu disco — é
 * aí que entra o provider S3.
 */
export class LocalStorageProvider implements StorageService {
  private readonly raiz: string
  private readonly urlBase: string

  constructor(opcoes: { raiz: string; urlBase: string }) {
    this.raiz = path.resolve(opcoes.raiz)
    this.urlBase = opcoes.urlBase.replace(/\/+$/, '')
  }

  /**
   * Resolve a chave para um caminho absoluto e confere que ele continua dentro
   * da raiz. É a segunda barreira contra path traversal, depois do formato da
   * chave: mesmo que a validação de formato fosse afrouxada, nenhuma escrita
   * sairia deste diretório.
   */
  private caminho(key: string): string {
    assertChaveValida(key)
    const absoluto = path.resolve(this.raiz, key)

    if (!absoluto.startsWith(this.raiz + path.sep)) {
      throw new Error(`chave fora do diretório de storage: ${JSON.stringify(key)}`)
    }

    return absoluto
  }

  /**
   * O `contentType` não é usado aqui: no disco, quem define o tipo servido é a
   * extensão da chave. Fica na assinatura porque o provider S3 precisa dele
   * para gravar o metadado do objeto.
   */
  async put(key: string, conteudo: Uint8Array, _contentType: string): Promise<void> {
    const destino = this.caminho(key)
    await mkdir(path.dirname(destino), { recursive: true })
    // `wx` falha se o arquivo já existir. As chaves carregam um UUID novo a
    // cada upload, então colisão indicaria bug — melhor falhar do que
    // sobrescrever em silêncio a imagem de outra entidade.
    await writeFile(destino, conteudo, { flag: 'wx' })
  }

  async delete(key: string): Promise<void> {
    await rm(this.caminho(key), { force: true })
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.caminho(key))
      return true
    } catch {
      return false
    }
  }

  publicUrl(key: string): string {
    assertChaveValida(key)
    return `${this.urlBase}/${key}`
  }

  get diretorioRaiz(): string {
    return this.raiz
  }
}
