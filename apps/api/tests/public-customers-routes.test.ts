import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { ClienteIdentificado } from '@repo/shared'

import { buildApp } from '../src/app.js'
import { mascararNumero, primeiroNome, resumoMascarado } from '../src/customers/masking.js'
import { closeDatabase, db } from '../src/db/index.js'
import { auditLogs, customerAddresses, customers, tenants } from '../src/db/schema/index.js'
import { LIMITE_DE_IDENTIFICACOES } from '../src/routes/public-customers.js'
import { tenantContextFromUser } from '../src/tenant/context.js'
import { withTenant } from '../src/tenant/with-tenant.js'
import {
  criarTenantComUsuario,
  removerTenantDeTeste,
  type TenantDeTeste,
} from './helpers/fixtures.js'

let app: FastifyInstance
let lanchonete: TenantDeTeste
let pizzaria: TenantDeTeste
let suspenso: TenantDeTeste
let mariaNaLanchonete = ''

const TELEFONE = '5511987654321'

// Cada requisição sai de um IP diferente: o limite desta rota é por IP, e os
// testes não podem se atrapalhar por causa dele — exceto o que o testa.
let ultimoIp = 0
const identificar = (
  slug: string,
  phone: unknown,
  remoteAddress = `10.0.0.${String(++ultimoIp)}`,
) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/public/${slug}/customers/identify`,
    payload: { phone },
    remoteAddress,
  })

async function criarCliente(
  fixture: TenantDeTeste,
  nome: string,
  enderecos: {
    street: string
    number: string
    complement?: string
    neighborhood: string
    reference?: string
    diasAtras: number
  }[],
): Promise<string> {
  return withTenant(tenantContextFromUser(fixture.tenantId), async (tx) => {
    const [cliente] = await tx
      .insert(customers)
      .values({ tenantId: fixture.tenantId, name: nome, phone: TELEFONE })
      .returning({ id: customers.id })
    if (!cliente) throw new Error('cliente não criado')

    for (const e of enderecos) {
      await tx.insert(customerAddresses).values({
        tenantId: fixture.tenantId,
        customerId: cliente.id,
        street: e.street,
        number: e.number,
        complement: e.complement ?? null,
        neighborhood: e.neighborhood,
        reference: e.reference ?? null,
        lastUsedAt: new Date(Date.now() - e.diasAtras * 86_400_000),
      })
    }
    return cliente.id
  })
}

beforeAll(async () => {
  app = await buildApp()
  await app.ready()

  lanchonete = await criarTenantComUsuario()
  pizzaria = await criarTenantComUsuario()
  suspenso = await criarTenantComUsuario()

  mariaNaLanchonete = await criarCliente(lanchonete, 'Maria Oliveira Santos', [
    { street: 'Avenida Brasil', number: '1200', neighborhood: 'Centro', diasAtras: 5 },
    {
      street: 'Rua dos Ipês',
      number: '450',
      complement: 'apto 12',
      neighborhood: 'Jardim Paulista',
      reference: 'Portão azul',
      diasAtras: 1,
    },
  ])
  await criarCliente(pizzaria, 'Maria O.', [
    { street: 'Rua Vergueiro', number: '88', neighborhood: 'Vila Nova', diasAtras: 0 },
  ])
  await criarCliente(suspenso, 'Maria', [])
  await db.update(tenants).set({ status: 'SUSPENDED' }).where(eq(tenants.id, suspenso.tenantId))
})

afterAll(async () => {
  await app.close()
  for (const fixture of [lanchonete, pizzaria, suspenso]) await removerTenantDeTeste(fixture)
  await closeDatabase()
})

describe('máscara', () => {
  it('mostra só o primeiro dígito do número', () => {
    expect(mascararNumero('450')).toBe('4••')
    expect(mascararNumero('7')).toBe('•')
    expect(mascararNumero(' 12A ')).toBe('1••')
  })

  it('"s/n" fica como está', () => {
    expect(mascararNumero('s/n')).toBe('s/n')
    expect(mascararNumero('SN')).toBe('SN')
  })

  it('o resumo leva rua, número mascarado e bairro', () => {
    expect(
      resumoMascarado({ street: 'Rua das Flores', number: '123', neighborhood: 'Centro' }),
    ).toBe('Rua das Flores, 1•• — Centro')
  })

  it('primeiro nome, sem sobrenome', () => {
    expect(primeiroNome('  Maria   Oliveira Santos ')).toBe('Maria')
  })
})

describe('identificação por telefone', () => {
  it('encontra o cliente em qualquer forma de digitar o telefone', async () => {
    for (const digitado of ['(11) 98765-4321', '11987654321', '+55 11 98765-4321']) {
      const resposta = await identificar(lanchonete.slug, digitado)
      expect(resposta.statusCode, digitado).toBe(200)
      expect(resposta.json<ClienteIdentificado>().cliente?.primeiroNome).toBe('Maria')
    }
  })

  it('devolve os endereços mascarados, o mais recente primeiro', async () => {
    const { cliente } = (await identificar(lanchonete.slug, TELEFONE)).json<ClienteIdentificado>()

    expect(cliente?.enderecos.map((e) => [e.resumo, e.bairro])).toEqual([
      ['Rua dos Ipês, 4•• — Jardim Paulista', 'Jardim Paulista'],
      ['Avenida Brasil, 1••• — Centro', 'Centro'],
    ])
  })

  it('nada que leve até a porta sai na resposta', async () => {
    const resposta = await identificar(lanchonete.slug, TELEFONE)
    expect(resposta.body).not.toContain(mariaNaLanchonete)

    // Os ids ficam de fora da busca: um UUID pode conter "450" por acaso.
    const { cliente } = resposta.json<ClienteIdentificado>()
    const corpo = JSON.stringify({
      ...cliente,
      enderecos: cliente?.enderecos.map(({ resumo, bairro }) => ({ resumo, bairro })),
    })

    for (const proibido of ['450', '1200', 'apto', 'Portão', 'Oliveira', 'Santos', TELEFONE]) {
      expect(corpo, proibido).not.toContain(proibido)
    }
  })

  it('telefone sem cliente responde nulo, sem erro', async () => {
    const resposta = await identificar(lanchonete.slug, '(21) 99999-0000')
    expect(resposta.statusCode).toBe(200)
    expect(resposta.json()).toEqual({ cliente: null })
  })

  it('telefone inválido é recusado com mensagem para a pessoa', async () => {
    const resposta = await identificar(lanchonete.slug, '1234')
    expect(resposta.statusCode).toBe(400)
    expect(resposta.body).toContain('Informe um telefone com DDD')

    expect((await identificar(lanchonete.slug, 5511987654321)).statusCode).toBe(400)
  })

  it('não guarda em cache', async () => {
    const resposta = await identificar(lanchonete.slug, TELEFONE)
    expect(resposta.headers['cache-control']).toBe('no-store')
  })
})

describe('isolamento entre estabelecimentos', () => {
  it('o mesmo telefone é outro cliente em outro estabelecimento', async () => {
    const { cliente } = (await identificar(pizzaria.slug, TELEFONE)).json<ClienteIdentificado>()

    expect(cliente?.enderecos.map((e) => e.resumo)).toEqual(['Rua Vergueiro, 8• — Vila Nova'])
  })

  it('estabelecimento suspenso ou inexistente responde o mesmo 404', async () => {
    const suspensa = await identificar(suspenso.slug, TELEFONE)
    const inexistente = await identificar('nao-existe-nenhum', TELEFONE)

    expect(suspensa.statusCode).toBe(404)
    expect(inexistente.statusCode).toBe(404)
    expect(suspensa.json<{ error: { message: string } }>().error.message).toBe(
      inexistente.json<{ error: { message: string } }>().error.message,
    )
  })

  it('endereço não pode apontar para cliente de outro estabelecimento', async () => {
    await expect(
      withTenant(tenantContextFromUser(pizzaria.tenantId), (tx) =>
        tx.insert(customerAddresses).values({
          tenantId: pizzaria.tenantId,
          customerId: mariaNaLanchonete,
          street: 'Rua',
          number: '1',
          neighborhood: 'Bairro',
        }),
      ),
    ).rejects.toThrow()
  })

  it('o banco recusa telefone fora do formato normalizado', async () => {
    await expect(
      withTenant(tenantContextFromUser(pizzaria.tenantId), (tx) =>
        tx.insert(customers).values({ tenantId: pizzaria.tenantId, name: 'X', phone: '(11) 9876' }),
      ),
    ).rejects.toThrow()
  })
})

describe('auditoria', () => {
  const identificacoes = (fixture: TenantDeTeste) =>
    withTenant(tenantContextFromUser(fixture.tenantId), (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.action, 'customer.identified'),
            eq(auditLogs.tenantId, fixture.tenantId),
          ),
        ),
    )

  it('registra quem foi encontrado e de qual IP', async () => {
    await identificar(pizzaria.slug, TELEFONE, '203.0.113.7')

    const registro = (await identificacoes(pizzaria)).find(
      (r) => (r.metadata as { ip?: string } | null)?.ip === '203.0.113.7',
    )
    expect(registro).toMatchObject({
      entityType: 'customer',
      actorUserId: null,
      metadata: { ip: '203.0.113.7', enderecosExibidos: 1 },
    })
  })

  it('telefone desconhecido não deixa rastro do número', async () => {
    const antes = (await identificacoes(lanchonete)).length
    await identificar(lanchonete.slug, '(31) 99999-1111')
    const depois = await identificacoes(lanchonete)

    expect(depois).toHaveLength(antes)
    expect(JSON.stringify(depois)).not.toContain('31999991111')
  })
})

describe('limite de requisições', () => {
  it(`bloqueia a varredura depois de ${String(LIMITE_DE_IDENTIFICACOES)} consultas por minuto`, async () => {
    const ip = '198.51.100.9'
    for (let i = 0; i < LIMITE_DE_IDENTIFICACOES; i += 1) {
      const telefone = `(11) 9${String(1000_0000 + i)}`
      expect((await identificar(lanchonete.slug, telefone, ip)).statusCode).toBe(200)
    }

    const bloqueada = await identificar(lanchonete.slug, TELEFONE, ip)
    expect(bloqueada.statusCode).toBe(429)
    expect(bloqueada.json()).toMatchObject({ error: { code: 'RATE_LIMIT_EXCEEDED' } })

    // Outro IP continua atendido: o limite é de quem varre, não da rota.
    expect((await identificar(lanchonete.slug, TELEFONE)).statusCode).toBe(200)
  })
})
