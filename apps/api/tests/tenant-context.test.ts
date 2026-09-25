import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { closeDatabase, db } from '../src/db/index.js'
import { tenants } from '../src/db/schema/index.js'
import { tenantContextFromPublicSlug, tenantContextFromUser } from '../src/tenant/context.js'
import { findTenantById, findTenantBySlug } from '../src/tenant/repository.js'

const sufixo = Math.random().toString(36).slice(2, 10)
const slug = `contexto-${sufixo}`
let tenantId = ''

beforeAll(async () => {
  const [tenant] = await db
    .insert(tenants)
    .values({ slug, name: 'Estabelecimento de Contexto' })
    .returning({ id: tenants.id })

  if (!tenant) throw new Error('falha ao preparar o tenant')
  tenantId = tenant.id
})

afterAll(async () => {
  if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId))
  await closeDatabase()
})

describe('TenantContext', () => {
  it('registra que o tenant veio do usuário autenticado', () => {
    expect(tenantContextFromUser(tenantId)).toEqual({
      tenantId,
      source: 'authenticated-user',
    })
  })

  it('registra que o tenant veio do slug público', () => {
    expect(tenantContextFromPublicSlug(tenantId)).toEqual({
      tenantId,
      source: 'public-slug',
    })
  })
})

describe('resolução do tenant', () => {
  it('encontra o estabelecimento pelo slug da URL pública', async () => {
    const tenant = await findTenantBySlug(slug)

    expect(tenant).toMatchObject({
      id: tenantId,
      slug,
      name: 'Estabelecimento de Contexto',
      status: 'ACTIVE',
    })
  })

  it('traz o fuso do estabelecimento, sem o qual não há como decidir se está aberto', async () => {
    const tenant = await findTenantBySlug(slug)

    expect(tenant?.timezone).toBe('America/Sao_Paulo')
  })

  it('devolve nulo para slug inexistente, em vez de lançar', async () => {
    expect(await findTenantBySlug(`nao-existe-${sufixo}`)).toBeNull()
  })

  it('encontra pelo id, para montar o contexto de um usuário autenticado', async () => {
    expect(await findTenantById(tenantId)).toMatchObject({ id: tenantId, slug })
  })

  it('devolve o status em vez de filtrar, deixando a decisão para quem chama', async () => {
    await db.update(tenants).set({ status: 'SUSPENDED' }).where(eq(tenants.id, tenantId))

    // O cardápio público vai recusar um estabelecimento suspenso; a área
    // administrativa precisa deixar o dono entrar para ver o motivo. Filtrar
    // aqui tiraria essa escolha de quem chama.
    expect((await findTenantBySlug(slug))?.status).toBe('SUSPENDED')

    await db.update(tenants).set({ status: 'ACTIVE' }).where(eq(tenants.id, tenantId))
  })
})

describe('formato do slug', () => {
  it('o banco recusa slug fora do formato de URL', async () => {
    await expect(
      db.insert(tenants).values({ slug: 'Slug Com Espaço', name: 'Inválido' }),
    ).rejects.toThrow()
  })

  it('o banco recusa slug duplicado', async () => {
    await expect(db.insert(tenants).values({ slug, name: 'Duplicado' })).rejects.toThrow()
  })
})
