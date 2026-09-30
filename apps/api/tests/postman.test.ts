import { readFile } from 'node:fs/promises'

import type { FastifyInstance, RouteOptions } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { closeDatabase } from '../src/db/index.js'
import {
  ARQUIVO_DA_COLECAO,
  chaveDaRota,
  corpoCru,
  gerarColecao,
  type ColecaoPostman,
  type DocumentoOpenApi,
} from '../src/postman/colecao.js'
import { EXEMPLOS, VALORES_PARA_VALIDAR, VARIAVEIS } from '../src/postman/exemplos.js'

/**
 * A coleção do Postman acompanha as rotas.
 *
 * Criou ou mudou uma rota? `pnpm postman` regenera o arquivo — e este teste
 * não deixa esquecer, nem deixa um exemplo de corpo que a própria rota
 * recusaria.
 */

interface Validador {
  safeParse: (valor: unknown) => {
    success: boolean
    error?: { issues: { path: PropertyKey[]; message: string }[] }
  }
}

const validador = (schema: unknown): Validador | undefined =>
  schema && typeof (schema as Validador).safeParse === 'function'
    ? (schema as Validador)
    : undefined

let app: FastifyInstance
let documento: DocumentoOpenApi
let colecao: ColecaoPostman
const schemas = new Map<string, { corpo?: Validador; query?: Validador }>()

/** Troca as variáveis do Postman pelos valores de teste; variável sem valor é erro. */
function substituir(texto: string): string {
  return texto.replace(/\{\{([\w$]+)\}\}/g, (_, nome: string) => {
    const valor = VALORES_PARA_VALIDAR[nome]
    if (valor === undefined) {
      throw new Error(`{{${nome}}} não tem valor em VALORES_PARA_VALIDAR (src/postman/exemplos.ts)`)
    }
    return valor
  })
}

const problemas = (resultado: ReturnType<Validador['safeParse']>) =>
  resultado.error?.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`).join('; ')

beforeAll(async () => {
  app = await buildApp({
    rateLimit: false,
    tempoReal: false,
    aoRegistrarRota: (rota: RouteOptions) => {
      const metodos = Array.isArray(rota.method) ? rota.method : [rota.method]
      for (const metodo of metodos) {
        const schema = rota.schema as { body?: unknown; querystring?: unknown } | undefined
        const corpo = validador(schema?.body)
        const query = validador(schema?.querystring)
        schemas.set(`${metodo} ${rota.url}`, {
          ...(corpo ? { corpo } : {}),
          ...(query ? { query } : {}),
        })
      }
    },
  })
  await app.ready()
  documento = app.swagger() as unknown as DocumentoOpenApi
  colecao = gerarColecao(documento)
})

afterAll(async () => {
  await app.close()
  await closeDatabase()
})

const rotasDaApi = () =>
  Object.entries(documento.paths).flatMap(([caminho, operacoes]) =>
    Object.keys(operacoes).map((metodo) => chaveDaRota(metodo, caminho)),
  )

describe('coleção do Postman', () => {
  it('o arquivo do repositório é o que `pnpm postman` gera hoje', async () => {
    const noRepositorio: unknown = JSON.parse(await readFile(ARQUIVO_DA_COLECAO, 'utf8'))
    expect(
      noRepositorio,
      'A coleção do Postman está desatualizada: rode `pnpm postman` e faça o commit de apps/api/postman/',
    ).toEqual(JSON.parse(JSON.stringify(colecao)))
  })

  it('toda rota da API está na coleção, uma vez', () => {
    const requisicoes = colecao.item.flatMap((pasta) => pasta.item)
    expect(requisicoes).toHaveLength(rotasDaApi().length)
  })

  it('toda rota com corpo obrigatório tem exemplo em exemplos.ts', () => {
    const semExemplo = rotasDaApi().filter((chave) => {
      const corpo = schemas.get(chave)?.corpo
      return corpo && !corpo.safeParse(undefined).success && EXEMPLOS[chave]?.corpo === undefined
    })
    expect(semExemplo, 'rotas sem corpo de exemplo em src/postman/exemplos.ts').toEqual([])
  })

  it('não sobra exemplo de rota que não existe mais', () => {
    const rotas = new Set(rotasDaApi())
    expect(Object.keys(EXEMPLOS).filter((chave) => !rotas.has(chave))).toEqual([])
  })

  it('todo corpo de exemplo passa na validação da própria rota', () => {
    const recusados = Object.entries(EXEMPLOS).flatMap(([chave, exemplo]) => {
      if (exemplo.corpo === undefined) return []
      const corpo = schemas.get(chave)?.corpo
      if (!corpo) return [`${chave}: a rota não recebe corpo JSON`]
      const resultado = corpo.safeParse(JSON.parse(substituir(corpoCru(exemplo.corpo))))
      return resultado.success ? [] : [`${chave}: ${problemas(resultado) ?? ''}`]
    })
    expect(recusados).toEqual([])
  })

  it('toda query de exemplo passa na validação da própria rota', () => {
    const recusadas = Object.entries(EXEMPLOS).flatMap(([chave, exemplo]) => {
      if (!exemplo.query) return []
      const query = schemas.get(chave)?.query
      if (!query) return [`${chave}: a rota não recebe query`]
      const valores = Object.fromEntries(
        Object.entries(exemplo.query).map(([nome, valor]) => [nome, substituir(valor)]),
      )
      const resultado = query.safeParse(valores)
      return resultado.success ? [] : [`${chave}: ${problemas(resultado) ?? ''}`]
    })
    expect(recusadas).toEqual([])
  })

  it('toda variável usada na coleção está declarada nela', () => {
    const declaradas = new Set(VARIAVEIS.map((v) => v.chave))
    const usadas = new Set(
      [...JSON.stringify(colecao).matchAll(/\{\{([\w$]+)\}\}/g)].map((m) => m[1] ?? ''),
    )
    const scripts = JSON.stringify(colecao.item)
    for (const [, nome] of scripts.matchAll(/collectionVariables\.(?:get|set)\('(\w+)'/g)) {
      usadas.add(nome ?? '')
    }
    // `$guid`, `$timestamp`: variáveis dinâmicas do próprio Postman.
    const faltando = [...usadas].filter((nome) => !nome.startsWith('$') && !declaradas.has(nome))
    expect(faltando, 'variáveis sem declaração em VARIAVEIS').toEqual([])
  })

  it('toda pasta tem descrição: o grupo está declarado na OpenAPI', () => {
    expect(colecao.item.filter((pasta) => !pasta.description).map((p) => p.name)).toEqual([])
  })

  it('rota pública vai sem token; rota do painel usa o token do login', () => {
    const requisicoes = colecao.item.flatMap((pasta) => pasta.item)
    const porNome = (nome: string) => requisicoes.find((r) => r.name === nome)?.request

    expect(porNome('Envia um pedido')?.auth).toEqual({ type: 'noauth' })
    expect(porNome('Cria uma categoria')?.auth).toBeUndefined()
    expect(colecao.auth.bearer[0]?.value).toBe('{{accessToken}}')
  })
})
