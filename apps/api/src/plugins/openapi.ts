import { app as product } from '@repo/config'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { FastifyInstance } from 'fastify'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'

import { env, isProduction } from '../config/env.js'

/**
 * Documentação da API gerada a partir dos próprios schemas Zod das rotas.
 *
 * Como o schema é o mesmo que valida a requisição em runtime, a documentação
 * não tem como divergir do comportamento real — que é o problema crônico de
 * qualquer OpenAPI mantido à mão.
 *
 * A interface visual fica desabilitada em produção: expor o mapa completo da
 * API não é uma brecha, mas entrega de graça a um atacante o trabalho de
 * descobrir rotas e formatos. A especificação continua sendo gerada, para
 * quem quiser servi-la atrás de autenticação.
 */
export async function registerOpenApi(instance: FastifyInstance): Promise<void> {
  await instance.register(swagger, {
    openapi: {
      info: {
        title: `API — ${product.name}`,
        description: product.description,
        version: '1.0.0',
      },
      servers: [
        { url: `http://localhost:${String(env.API_PORT)}`, description: 'Desenvolvimento' },
      ],
      tags: [
        { name: 'Infraestrutura', description: 'Sondas de saúde e prontidão' },
        { name: 'Autenticação', description: 'Sessão de usuários administrativos' },
        {
          name: 'Cadastro',
          description: 'Cadastro aberto de estabelecimento e confirmação do e-mail do dono',
        },
        {
          name: 'Configurações',
          description: 'Estabelecimento, horários, entrega e formas de pagamento',
        },
        { name: 'Catálogo', description: 'Categorias e produtos' },
        { name: 'Personalização', description: 'Grupos de opção, adicionais, remoções e combos' },
        { name: 'Pedidos', description: 'Pedidos do estabelecimento e mudança de status' },
        { name: 'Usuários', description: 'As pessoas do painel e o perfil de cada uma' },
        {
          name: 'Perfis',
          description:
            'Os conjuntos de permissões que o estabelecimento monta e dá às pessoas. O ' +
            'proprietário tem sempre todas, e não tem perfil.',
        },
        { name: 'Plano', description: 'Plano do estabelecimento e uso do mês' },
        {
          name: 'Cardápio público',
          description: 'Área sem login, resolvida pelo slug do estabelecimento',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    transform: jsonSchemaTransform,
  })

  if (!isProduction) {
    await instance.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list', deepLinking: true },
    })
  }
}
