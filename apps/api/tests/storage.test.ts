import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { detectarTipoDeImagem } from '../src/storage/image-type.js'
import { novaChaveDeImagem } from '../src/storage/index.js'
import { LocalStorageProvider } from '../src/storage/local-provider.js'
import { assertChaveValida } from '../src/storage/storage-service.js'
import { JPEG, PNG, texto, WEBP } from './helpers/imagens.js'

describe('detecção do tipo pelo conteúdo', () => {
  it('reconhece PNG, JPEG e WebP', () => {
    expect(detectarTipoDeImagem(PNG)).toBe('image/png')
    expect(detectarTipoDeImagem(JPEG)).toBe('image/jpeg')
    expect(detectarTipoDeImagem(WEBP)).toBe('image/webp')
  })

  it('recusa SVG, que pode carregar script', () => {
    const svg = texto('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

    expect(detectarTipoDeImagem(svg)).toBeNull()
  })

  it('recusa HTML, independentemente do nome que o arquivo tenha', () => {
    expect(detectarTipoDeImagem(texto('<!doctype html><script>roubar()</script>'))).toBeNull()
  })

  it('recusa RIFF que não é WebP — um WAV, por exemplo', () => {
    const wav = Uint8Array.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WAVE')])

    expect(detectarTipoDeImagem(wav)).toBeNull()
  })

  it('recusa arquivo vazio e arquivo truncado', () => {
    expect(detectarTipoDeImagem(new Uint8Array())).toBeNull()
    expect(detectarTipoDeImagem(PNG.slice(0, 4))).toBeNull()
  })
})

describe('formato da chave', () => {
  it('aceita a chave que o servidor monta', () => {
    const chave = novaChaveDeImagem('01a0d928-2736-732c-99b0-3bbf8ab47876', 'logo', 'image/png')

    expect(chave).toMatch(/^tenants\/01a0d928-2736-732c-99b0-3bbf8ab47876\/logo\/[0-9a-f-]+\.png$/)
    expect(() => {
      assertChaveValida(chave)
    }).not.toThrow()
  })

  it('duas chaves para o mesmo arquivo nunca coincidem', () => {
    const a = novaChaveDeImagem('t', 'logo', 'image/png')
    const b = novaChaveDeImagem('t', 'logo', 'image/png')

    expect(a).not.toBe(b)
  })

  it.each([
    '../../etc/passwd',
    'tenants/../../segredo.txt',
    '/etc/passwd.txt',
    'tenants/a/.env',
    'tenants/a b/foto.png',
    'tenants/a/foto',
    '',
  ])('recusa %j', (chave) => {
    expect(() => {
      assertChaveValida(chave)
    }).toThrow()
  })
})

describe('provider local', () => {
  let raiz = ''
  let provider: LocalStorageProvider

  beforeAll(async () => {
    raiz = await mkdtemp(path.join(tmpdir(), 'cardapio-storage-'))
    provider = new LocalStorageProvider({ raiz, urlBase: 'http://cdn.exemplo/uploads/' })
  })

  afterAll(async () => {
    await rm(raiz, { recursive: true, force: true })
  })

  it('grava, confirma a existência e devolve o conteúdo intacto', async () => {
    await provider.put('tenants/a/logo/um.png', PNG, 'image/png')

    expect(await provider.exists('tenants/a/logo/um.png')).toBe(true)
    expect(new Uint8Array(await readFile(path.join(raiz, 'tenants/a/logo/um.png')))).toEqual(PNG)
  })

  it('não sobrescreve um arquivo existente', async () => {
    await provider.put('tenants/a/logo/dois.png', PNG, 'image/png')

    // Chaves carregam UUID novo a cada upload; colisão seria bug, e é melhor
    // falhar do que trocar em silêncio a imagem de outra entidade.
    await expect(provider.put('tenants/a/logo/dois.png', JPEG, 'image/jpeg')).rejects.toThrow()
  })

  it('apaga, e apagar de novo não é erro', async () => {
    await provider.put('tenants/a/logo/tres.png', PNG, 'image/png')
    await provider.delete('tenants/a/logo/tres.png')

    expect(await provider.exists('tenants/a/logo/tres.png')).toBe(false)
    await expect(provider.delete('tenants/a/logo/tres.png')).resolves.toBeUndefined()
  })

  it('recusa escrever fora do diretório raiz', async () => {
    await expect(provider.put('../fora.png', PNG, 'image/png')).rejects.toThrow()
  })

  it('monta a URL pública sem barra duplicada', () => {
    expect(provider.publicUrl('tenants/a/logo/um.png')).toBe(
      'http://cdn.exemplo/uploads/tenants/a/logo/um.png',
    )
  })
})
