import path from 'node:path'

import { EXEMPLOS, VARIAVEIS, type ExemploDeRota } from './exemplos.js'

/**
 * Gera a coleção do Postman a partir da descrição OpenAPI da própria API.
 *
 * As rotas, os parâmetros e as descrições vêm das rotas registradas — a mesma
 * fonte do `/docs` —, então rota nova entra sozinha na coleção. O que a
 * descrição não sabe (corpos de exemplo com valores que fazem sentido, e os
 * scripts que guardam o token e os ids) vem de `exemplos.ts`.
 *
 * Regra pura: recebe o documento, devolve a coleção. Quem escreve o arquivo é
 * `gerar.ts` (`pnpm postman`); quem confere que ele está em dia é
 * `tests/postman.test.ts`.
 */

export const ARQUIVO_DA_COLECAO = path.resolve(
  import.meta.dirname,
  '../../postman/api.postman_collection.json',
)

/**
 * Fixo de propósito: ao importar de novo, o Postman reconhece a coleção e
 * oferece substituí-la, em vez de criar uma cópia a cada importação.
 */
export const ID_DA_COLECAO = '6f1d2c9e-8a47-4b5e-9c3d-2e7f41a0b8d5'

// --- O pedaço da OpenAPI que a coleção usa ------------------------------------

interface ParametroOpenApi {
  in: string
  name: string
  required?: boolean
  description?: string
}

interface OperacaoOpenApi {
  tags?: string[]
  summary?: string
  description?: string
  parameters?: ParametroOpenApi[]
  requestBody?: { content?: Record<string, unknown> }
  security?: unknown[]
}

export interface DocumentoOpenApi {
  info: { title: string }
  tags?: { name: string; description?: string }[]
  paths: Record<string, Record<string, OperacaoOpenApi | undefined>>
}

// --- Formato da coleção (Postman Collection v2.1) -----------------------------

interface ScriptPostman {
  listen: 'prerequest' | 'test'
  script: { type: 'text/javascript'; exec: string[] }
}

interface RequisicaoPostman {
  name: string
  event?: ScriptPostman[]
  request: {
    method: string
    auth?: { type: 'noauth' }
    header: { key: string; value: string }[]
    body?:
      | { mode: 'raw'; raw: string; options: { raw: { language: 'json' } } }
      | { mode: 'formdata'; formdata: { key: string; type: 'file'; src: string[] }[] }
    url: {
      raw: string
      host: string[]
      path: string[]
      query?: { key: string; value: string; disabled?: boolean; description?: string }[]
      variable?: { key: string; value: string }[]
    }
    description: string
  }
}

interface PastaPostman {
  name: string
  description?: string
  item: RequisicaoPostman[]
}

export interface ColecaoPostman {
  info: { _postman_id: string; name: string; description: string; schema: string }
  auth: { type: 'bearer'; bearer: { key: string; value: string; type: string }[] }
  variable: { key: string; value: string; description: string }[]
  item: PastaPostman[]
}

// --- Geração -------------------------------------------------------------------

const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const

/**
 * A variável do id de cada recurso, pelo segmento que vem antes do parâmetro:
 * `/products/:id` usa `{{productId}}`. Recurso novo com `:id` precisa entrar
 * aqui — sem isso, `gerarColecao` falha dizendo qual.
 */
const VARIAVEL_DO_RECURSO: Record<string, string> = {
  categories: 'categoryId',
  products: 'productId',
  'option-groups': 'optionGroupId',
  orders: 'orderId',
  users: 'userId',
}

const DESCRICAO_DA_COLECAO = [
  'Gerada por `pnpm postman` a partir das rotas da API — **não edite à mão**: a próxima geração',
  'desfaz. Corpos de exemplo e scripts ficam em `apps/api/src/postman/exemplos.ts`.',
  '',
  '**Para começar:** `pnpm db:up` e `pnpm dev`, e rode **Autenticação → Autentica um usuário',
  'administrativo**. O login usa só `email` e `password` das variáveis da coleção — por padrão,',
  'o dono da Lanchonete do Zé, do seed. Ele guarda o token em `accessToken`, que as rotas do',
  'painel já usam, e o endereço do estabelecimento em `tenantSlug`.',
  '',
  '**Ids:** as listagens guardam o primeiro id (`categoryId`, `productId`…) e as criações guardam',
  'o id criado. As rotas seguintes já apontam para ele.',
  '',
  '**Pedido público:** rode antes o cardápio do estabelecimento, que escolhe um produto e calcula',
  'o total. O estabelecimento precisa estar aberto — a `padaria-pao-quente` abre das 08:00 às 18:00.',
  '',
  '**Cadastro:** cadastrar troca `tenantSlug`, `email`, `password` e `accessToken` para o',
  'estabelecimento criado; confirmar o e-mail busca o link no Mailpit sozinho.',
  '',
  '**Tempo real** não cabe numa coleção: no Postman, New → WebSocket, conecte em',
  '`ws://localhost:3333/api/v1/admin/orders/stream` e envie',
  '`{"type": "auth", "token": "<accessToken>"}`.',
].join('\n')

/** `POST` e `/api/v1/admin/products/{id}` viram `POST /api/v1/admin/products/:id`. */
export function chaveDaRota(metodo: string, caminhoOpenApi: string): string {
  return `${metodo.toUpperCase()} ${caminhoOpenApi.replace(/\{(\w+)\}/g, ':$1')}`
}

/** O corpo do exemplo como vai para o Postman: `"{{json:x}}"` sai sem aspas. */
export function corpoCru(corpo: unknown): string {
  return JSON.stringify(corpo, null, 2).replace(/"\{\{json:([\w$]+)\}\}"/g, '{{$1}}')
}

function valorDoParametro(segmentos: string[], nome: string, exemplo?: ExemploDeRota): string {
  const doExemplo = exemplo?.caminho?.[nome]
  if (doExemplo) return doExemplo
  if (nome === 'tenantSlug') return '{{tenantSlug}}'

  const recurso = segmentos[segmentos.indexOf(`:${nome}`) - 1]
  const variavel = recurso ? VARIAVEL_DO_RECURSO[recurso] : undefined
  if (!variavel) {
    throw new Error(
      `O parâmetro :${nome} de /${segmentos.join('/')} não tem variável no Postman. ` +
        'Acrescente o recurso em VARIAVEL_DO_RECURSO (src/postman/colecao.ts).',
    )
  }
  return `{{${variavel}}}`
}

function descricaoDaRequisicao(operacao: OperacaoOpenApi, exemplo?: ExemploDeRota): string {
  return [
    operacao.description,
    exemplo?.arquivo &&
      `Escolha a imagem no campo \`${exemplo.arquivo}\` da aba Body (JPEG, PNG ou WebP).`,
    exemplo?.nota,
  ]
    .filter(Boolean)
    .join('\n\n')
}

function requisicao(metodo: string, caminho: string, operacao: OperacaoOpenApi): RequisicaoPostman {
  const exemplo = EXEMPLOS[chaveDaRota(metodo, caminho)]
  const segmentos = chaveDaRota(metodo, caminho).split(' ')[1]?.split('/').filter(Boolean) ?? []
  const parametros = operacao.parameters ?? []

  const variaveis = parametros
    .filter((p) => p.in === 'path')
    .map((p) => ({ key: p.name, value: valorDoParametro(segmentos, p.name, exemplo) }))

  const query = parametros
    .filter((p) => p.in === 'query')
    .map((p) => ({
      key: p.name,
      value: exemplo?.query?.[p.name] ?? '',
      ...(p.required ? {} : { disabled: true }),
      ...(p.description ? { description: p.description } : {}),
    }))

  const queryLigada = query.filter((q) => !q.disabled).map((q) => `${q.key}=${q.value}`)
  const raw = `{{baseUrl}}/${segmentos.join('/')}${queryLigada.length ? `?${queryLigada.join('&')}` : ''}`

  const eventos: ScriptPostman[] = []
  if (exemplo?.antes) {
    eventos.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: exemplo.antes } })
  }
  if (exemplo?.depois) {
    eventos.push({ listen: 'test', script: { type: 'text/javascript', exec: exemplo.depois } })
  }

  const corpoJson = exemplo?.corpo !== undefined

  return {
    name: operacao.summary ?? chaveDaRota(metodo, caminho),
    ...(eventos.length > 0 ? { event: eventos } : {}),
    request: {
      method: metodo.toUpperCase(),
      // Sem segurança declarada, a rota é pública: nada de token. As do painel
      // herdam o bearer da coleção.
      ...(operacao.security?.length ? {} : { auth: { type: 'noauth' as const } }),
      header: corpoJson ? [{ key: 'Content-Type', value: 'application/json' }] : [],
      ...(exemplo?.arquivo
        ? {
            body: {
              mode: 'formdata' as const,
              formdata: [{ key: exemplo.arquivo, type: 'file' as const, src: [] }],
            },
          }
        : corpoJson
          ? {
              body: {
                mode: 'raw' as const,
                raw: corpoCru(exemplo.corpo),
                options: { raw: { language: 'json' as const } },
              },
            }
          : {}),
      url: {
        raw,
        host: ['{{baseUrl}}'],
        path: segmentos,
        ...(query.length > 0 ? { query } : {}),
        ...(variaveis.length > 0 ? { variable: variaveis } : {}),
      },
      description: descricaoDaRequisicao(operacao, exemplo),
    },
  }
}

export function gerarColecao(documento: DocumentoOpenApi): ColecaoPostman {
  const pastas = new Map<string, RequisicaoPostman[]>()

  for (const [caminho, operacoes] of Object.entries(documento.paths)) {
    for (const metodo of METODOS) {
      const operacao = operacoes[metodo]
      if (!operacao) continue
      const pasta = operacao.tags?.[0] ?? 'Sem grupo'
      pastas.set(pasta, [...(pastas.get(pasta) ?? []), requisicao(metodo, caminho, operacao)])
    }
  }

  // Na ordem em que os grupos são declarados na OpenAPI; os não declarados, depois.
  const declaradas = (documento.tags ?? []).map((t) => t.name)
  const ordem = [...declaradas, ...[...pastas.keys()].filter((p) => !declaradas.includes(p))]

  return {
    info: {
      _postman_id: ID_DA_COLECAO,
      name: documento.info.title,
      description: DESCRICAO_DA_COLECAO,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] },
    variable: VARIAVEIS.map((v) => ({ key: v.chave, value: v.valor, description: v.descricao })),
    item: ordem.flatMap((nome) => {
      const itens = pastas.get(nome)
      if (!itens) return []
      const descricao = documento.tags?.find((t) => t.name === nome)?.description
      return [{ name: nome, ...(descricao ? { description: descricao } : {}), item: itens }]
    }),
  }
}
