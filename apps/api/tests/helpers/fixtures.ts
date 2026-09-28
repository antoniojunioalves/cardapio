import { eq, inArray } from 'drizzle-orm'

import { hashPassword } from '../../src/auth/password.js'
import { db } from '../../src/db/index.js'
import {
  permissions,
  rolePermissions,
  roles,
  tenants,
  userRoles,
  users,
} from '../../src/db/schema/index.js'
import { tenantContextFromUser } from '../../src/tenant/context.js'
import { withTenant } from '../../src/tenant/with-tenant.js'

export const SENHA_PADRAO = 'senha-de-teste-123'

export interface TenantDeTeste {
  tenantId: string
  slug: string
  userId: string
  email: string
  roleId: string
  permissionIds: string[]
}

function sufixo(): string {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Cria um estabelecimento com um usuário administrativo e um papel próprio.
 *
 * Papéis e permissões são globais, então cada chamada cria os seus com códigos
 * únicos — sem isso, testes rodando sobre o mesmo banco disputariam as mesmas
 * linhas e passariam ou falhariam conforme a ordem de execução.
 */
export async function criarTenantComUsuario(
  opcoes: {
    permissoes?: readonly string[]
    /**
     * Usa os códigos de permissão exatamente como informados, em vez de
     * sufixá-los. Necessário para testar rotas reais, que conferem
     * `settings:read` e não `settings:read#abc123`.
     *
     * Permissões reais são globais e compartilhadas entre os testes, então
     * são criadas com `onConflictDoNothing` e **não** removidas na limpeza.
     */
    permissoesReais?: boolean
    ativo?: boolean
    senha?: string
  } = {},
): Promise<TenantDeTeste> {
  const id = sufixo()
  const solicitadas = opcoes.permissoes ?? ['products:read']
  const codigosDePermissao = opcoes.permissoesReais
    ? [...solicitadas]
    : solicitadas.map((codigo) => `${codigo}#${id}`)

  const [tenant] = await db
    .insert(tenants)
    .values({ slug: `teste-${id}`, name: `Estabelecimento ${id}` })
    .returning({ id: tenants.id, slug: tenants.slug })
  if (!tenant) throw new Error('falha ao criar tenant de teste')

  const [papel] = await db
    .insert(roles)
    .values({ code: `TESTE_${id.toUpperCase()}`, name: 'Papel de teste' })
    .returning({ id: roles.id })
  if (!papel) throw new Error('falha ao criar papel de teste')

  const permissionIds: string[] = []
  for (const code of codigosDePermissao) {
    await db.insert(permissions).values({ code }).onConflictDoNothing({
      target: permissions.code,
    })

    const [permissao] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.code, code))
      .limit(1)
    if (!permissao) throw new Error(`falha ao criar a permissão ${code}`)

    // Só as sufixadas são removidas depois; as reais são catálogo compartilhado.
    if (!opcoes.permissoesReais) permissionIds.push(permissao.id)

    await db.insert(rolePermissions).values({ roleId: papel.id, permissionId: permissao.id })
  }

  const email = `usuario-${id}@exemplo.com`
  const passwordHash = await hashPassword(opcoes.senha ?? SENHA_PADRAO)

  const userId = await withTenant(tenantContextFromUser(tenant.id), async (tx) => {
    const [usuario] = await tx
      .insert(users)
      .values({
        tenantId: tenant.id,
        name: `Usuário ${id}`,
        email,
        passwordHash,
        isActive: opcoes.ativo ?? true,
      })
      .returning({ id: users.id })
    if (!usuario) throw new Error('falha ao criar usuário de teste')

    await tx.insert(userRoles).values({
      tenantId: tenant.id,
      userId: usuario.id,
      roleId: papel.id,
    })

    return usuario.id
  })

  return {
    tenantId: tenant.id,
    slug: tenant.slug,
    userId,
    email,
    roleId: papel.id,
    permissionIds,
  }
}

/** Remove tudo que `criarTenantComUsuario` criou. Tenant em cascata leva o resto. */
export async function removerTenantDeTeste(fixture: TenantDeTeste): Promise<void> {
  await db.delete(tenants).where(eq(tenants.id, fixture.tenantId))
  await db.delete(roles).where(eq(roles.id, fixture.roleId))
  if (fixture.permissionIds.length > 0) {
    await db.delete(permissions).where(inArray(permissions.id, fixture.permissionIds))
  }
}

/** O código real da permissão criada, com o sufixo único do fixture. */
export function permissaoDe(fixture: TenantDeTeste, codigo: string): string {
  const sufixoDoTenant = fixture.slug.replace('teste-', '')
  return `${codigo}#${sufixoDoTenant}`
}
