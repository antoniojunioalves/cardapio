import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { detectarTipoDeImagem } from '../src/storage/image-type.js'
import { novaChaveDeImagem } from '../src/storage/index.js'
import { LocalStorageProvider } from '../src/storage/local-provider.js'
import {
  ImagemGrandeDemaisError,
  ImagemIlegivelError,
  LADO_MAXIMO,
  LIMITE_DE_PIXELS,
  tratarImagem,
} from '../src/storage/process-image.js'
import { assertChaveValida } from '../src/storage/storage-service.js'
import {
  fotoDeCelular,
  JPEG,
  jpegDe,
  lerImagem,
  MODELO_DO_CELULAR,
  PNG,
  pngTransparente,
  temGps,
  texto,
  WEBP,
} from './helpers/imagens.js'

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
    const chave = novaChaveDeImagem('01a0d928-2736-732c-99b0-3bbf8ab47876', 'logo')

    // Sempre `.webp`: é o formato em que toda imagem é guardada.
    expect(chave).toMatch(/^tenants\/01a0d928-2736-732c-99b0-3bbf8ab47876\/logo\/[0-9a-f-]+\.webp$/)
    expect(() => {
      assertChaveValida(chave)
    }).not.toThrow()
  })

  it('duas chaves para o mesmo arquivo nunca coincidem', () => {
    const a = novaChaveDeImagem('t', 'logo')
    const b = novaChaveDeImagem('t', 'logo')

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

describe('tratamento da imagem', () => {
  it('a foto de celular sai sem a localização nem dado nenhum do aparelho', async () => {
    const foto = await fotoDeCelular()
    // A amostra precisa ter o que o teste diz que some.
    const antes = await lerImagem(foto)
    expect(temGps(antes.exif)).toBe(true)
    expect(foto.includes(MODELO_DO_CELULAR)).toBe(true)

    const tratada = await tratarImagem(foto, 'products')

    const depois = await lerImagem(tratada.conteudo)
    expect(depois.exif).toBeUndefined()
    expect(depois.xmp).toBeUndefined()
    expect(depois.iptc).toBeUndefined()
    expect(depois.icc).toBeUndefined()
    expect(Buffer.from(tratada.conteudo).includes(MODELO_DO_CELULAR)).toBe(false)
  })

  it('gira a foto conforme a câmera anotou, já que a anotação vai embora', async () => {
    // 40×20 no arquivo, com a orientação "girar 90°": de pé, é 20×40.
    const tratada = await tratarImagem(await fotoDeCelular(), 'products')

    expect({ largura: tratada.largura, altura: tratada.altura }).toEqual({
      largura: 20,
      altura: 40,
    })
    expect((await lerImagem(tratada.conteudo)).orientation).toBeUndefined()
  })

  it('guarda sempre WebP, venha JPEG, PNG ou WebP', async () => {
    for (const amostra of [JPEG, PNG, WEBP]) {
      const tratada = await tratarImagem(amostra, 'logo')

      expect(tratada.tipo).toBe('image/webp')
      expect((await lerImagem(tratada.conteudo)).format).toBe('webp')
    }
  })

  it.each([
    ['logo', 512, 384],
    ['categories', 800, 600],
    ['products', 1200, 900],
    ['cover', 1600, 1200],
  ] as const)('reduz a foto grande ao tamanho do uso: %s', async (uso, largura, altura) => {
    const tratada = await tratarImagem(await jpegDe(4000, 3000), uso)

    expect(LADO_MAXIMO[uso]).toBe(largura)
    // A proporção 4:3 é mantida: nada é cortado nem esticado.
    expect({ largura: tratada.largura, altura: tratada.altura }).toEqual({ largura, altura })
  })

  it('não aumenta a imagem que já é pequena', async () => {
    const tratada = await tratarImagem(await jpegDe(100, 50), 'cover')

    expect({ largura: tratada.largura, altura: tratada.altura }).toEqual({
      largura: 100,
      altura: 50,
    })
  })

  it('o PNG transparente continua transparente', async () => {
    const tratada = await tratarImagem(await pngTransparente(), 'logo')

    const { default: sharp } = await import('sharp')
    const { data, info } = await sharp(tratada.conteudo).raw().toBuffer({ resolveWithObject: true })
    expect(info.channels).toBe(4)
    // Canal alfa do primeiro pixel (lado pintado) e do último da primeira linha (lado vazio).
    expect(data[3]).toBe(255)
    expect(data[(info.width - 1) * 4 + 3]).toBe(0)
  })

  it('recusa imagem com pixels demais, por menor que seja o arquivo', async () => {
    // Lisa, comprime para poucos KB — e aberta ocuparia centenas de MB.
    const enorme = await jpegDe(8000, 7000)
    expect(8000 * 7000).toBeGreaterThan(LIMITE_DE_PIXELS)
    expect(enorme.byteLength).toBeLessThan(1024 * 1024)

    await expect(tratarImagem(enorme, 'products')).rejects.toBeInstanceOf(ImagemGrandeDemaisError)
  })

  it('recusa o arquivo cortado ao meio e o que só tem a assinatura do formato', async () => {
    const inteira = await jpegDe(400, 400)
    const cortada = inteira.subarray(0, Math.floor(inteira.byteLength / 2))
    const soAssinatura = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
    ])

    await expect(tratarImagem(cortada, 'products')).rejects.toBeInstanceOf(ImagemIlegivelError)
    await expect(tratarImagem(soAssinatura, 'products')).rejects.toBeInstanceOf(ImagemIlegivelError)
  })
})
