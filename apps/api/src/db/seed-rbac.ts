import { eq } from 'drizzle-orm'

import { db } from './index.js'
import { permissions, rolePermissions, roles } from './schema/index.js'

/**
 * Catálogo de permissões da plataforma.
 *
 * O formato `recurso:acao` é previsível de propósito: permite conferir
 * permissão comparando strings, sem tabela de tradução no meio.
 *
 * Nem todos os recursos existem ainda — produtos e pedidos chegam nas Fases 7
 * e 11. As permissões vêm antes porque são o vocabulário em que os papéis são
 * escritos; criá-las junto com cada recurso espalharia a definição dos papéis
 * por sete fases.
 */
export const PERMISSOES = [
  ['products:read', 'Ver produtos'],
  ['products:create', 'Criar produtos'],
  ['products:update', 'Alterar produtos'],
  ['products:delete', 'Excluir produtos'],
  ['categories:read', 'Ver categorias'],
  ['categories:create', 'Criar categorias'],
  ['categories:update', 'Alterar categorias'],
  ['categories:delete', 'Excluir categorias'],
  ['orders:read', 'Ver pedidos'],
  ['orders:update', 'Atualizar status de pedidos'],
  ['customers:read', 'Ver clientes'],
  ['users:read', 'Ver usuários'],
  ['users:create', 'Criar usuários'],
  ['users:update', 'Alterar usuários'],
  ['users:delete', 'Remover usuários'],
  ['settings:read', 'Ver configurações do estabelecimento'],
  ['settings:update', 'Alterar configurações do estabelecimento'],
  ['audit:read', 'Consultar o registro de auditoria'],
] as const

const TODAS = PERMISSOES.map(([code]) => code)

/**
 * Papéis iniciais.
 *
 * STAFF é o atendente: vê o cardápio e mexe em pedido, não altera preço nem
 * configuração. ADMIN administra tudo menos remover usuários — tirar o acesso
 * de alguém é decisão de dono. OWNER pode tudo.
 */
export const PAPEIS = [
  { code: 'OWNER', name: 'Proprietário', sortOrder: 0, permissions: TODAS },
  {
    code: 'ADMIN',
    name: 'Administrador',
    sortOrder: 10,
    permissions: TODAS.filter((code) => code !== 'users:delete'),
  },
  {
    code: 'STAFF',
    name: 'Atendente',
    sortOrder: 20,
    permissions: [
      'products:read',
      'categories:read',
      'orders:read',
      'orders:update',
      'customers:read',
    ],
  },
] as const

/** Idempotente: pode rodar em toda migração de ambiente sem duplicar nada. */
export async function seedRbac(): Promise<void> {
  const idsDePermissao = new Map<string, string>()

  for (const [code, description] of PERMISSOES) {
    await db.insert(permissions).values({ code, description }).onConflictDoNothing({
      target: permissions.code,
    })
    const [registro] = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.code, code))
      .limit(1)
    if (!registro) throw new Error(`permissão ${code} não foi criada`)
    idsDePermissao.set(code, registro.id)
  }

  for (const papel of PAPEIS) {
    await db
      .insert(roles)
      .values({ code: papel.code, name: papel.name, sortOrder: papel.sortOrder })
      .onConflictDoNothing({ target: roles.code })

    const [registro] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.code, papel.code))
      .limit(1)
    if (!registro) throw new Error(`papel ${papel.code} não foi criado`)

    for (const code of papel.permissions) {
      const permissionId = idsDePermissao.get(code)
      if (!permissionId) throw new Error(`permissão ${code} não encontrada`)
      await db
        .insert(rolePermissions)
        .values({ roleId: registro.id, permissionId })
        .onConflictDoNothing()
    }
  }
}
