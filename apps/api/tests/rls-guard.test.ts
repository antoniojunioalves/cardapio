import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { closeDatabase, db } from '../src/db/index.js'

afterAll(async () => {
  await closeDatabase()
})

/**
 * Tabelas que legitimamente NÃO têm `tenant_id`, com o motivo de cada uma.
 *
 * Esta lista existe para fechar um buraco que o teste de RLS sozinho não
 * fecha: ele cobre tabelas que TÊM `tenant_id` e esqueceram o RLS, mas não
 * consegue ver uma tabela que DEVERIA ter `tenant_id` e não tem. Com a lista,
 * criar uma tabela nova obriga a escolher explicitamente entre "é global" e
 * "é de tenant" — e a escolha errada aparece na revisão do código.
 */
const TABELAS_GLOBAIS: Record<string, string> = {
  tenants: 'é o próprio registro de tenants; a resolução do slug antecede o contexto',
  plans: 'catálogo de planos da plataforma, igual para todos',
  plan_features: 'recursos e limites de um plano, não de um estabelecimento',
  roles: 'OWNER, ADMIN e STAFF significam o mesmo em todo estabelecimento',
  permissions: 'catálogo de permissões da plataforma',
  role_permissions: 'liga papel a permissão; ambos globais',
  platform_admins:
    'super admin não pertence a tenant nenhum — com tenant_id nulo a policy nunca casaria e a linha ficaria invisível até para ela mesma',
}

interface TabelaInfo {
  // O `db.execute<T>` do Drizzle exige que a linha seja indexável por string.
  [coluna: string]: unknown
  tabela: string
  tem_tenant_id: boolean
  rls_habilitado: boolean
  rls_forcado: boolean
  policies: number
}

async function inspecionarTabelas(): Promise<TabelaInfo[]> {
  const resultado = await db.execute<TabelaInfo>(sql`
    SELECT
      c.relname AS tabela,
      EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid
          AND a.attname = 'tenant_id'
          AND a.attnum > 0
          AND NOT a.attisdropped
      ) AS tem_tenant_id,
      c.relrowsecurity      AS rls_habilitado,
      c.relforcerowsecurity AS rls_forcado,
      (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::int AS policies
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `)

  return resultado.rows
}

describe('guarda de Row-Level Security', () => {
  it('encontra tabelas para inspecionar', async () => {
    // Sem esta verificação, todas as asserções abaixo passariam de graça caso a
    // consulta parasse de encontrar qualquer tabela — uma guarda que passa por
    // não olhar nada é pior do que nenhuma guarda.
    const tabelas = await inspecionarTabelas()
    expect(tabelas.length).toBeGreaterThan(0)
  })

  it('toda tabela com tenant_id tem RLS habilitado, forçado e com policy', async () => {
    const tabelas = await inspecionarTabelas()
    const tenantScoped = tabelas.filter((t) => t.tem_tenant_id)

    expect(tenantScoped.length).toBeGreaterThan(0)

    const desprotegidas = tenantScoped.filter(
      (t) => !t.rls_habilitado || !t.rls_forcado || t.policies < 1,
    )

    expect(
      desprotegidas,
      `Estas tabelas têm tenant_id mas não estão protegidas:\n` +
        desprotegidas
          .map(
            (t) =>
              `  ${t.tabela}: habilitado=${String(t.rls_habilitado)} ` +
              `forçado=${String(t.rls_forcado)} policies=${String(t.policies)}`,
          )
          .join('\n') +
        `\n\nToda tabela tenant-scoped precisa de .enableRLS() com pgPolicy no schema ` +
        `e de um ALTER TABLE ... FORCE ROW LEVEL SECURITY na migration.`,
    ).toEqual([])
  })

  it('toda tabela sem tenant_id está declarada como global de propósito', async () => {
    const tabelas = await inspecionarTabelas()

    const naoDeclaradas = tabelas
      .filter((t) => !t.tem_tenant_id)
      .map((t) => t.tabela)
      .filter((nome) => !(nome in TABELAS_GLOBAIS))

    expect(
      naoDeclaradas,
      `Estas tabelas não têm tenant_id e não estão na lista de tabelas globais:\n` +
        naoDeclaradas.map((nome) => `  ${nome}`).join('\n') +
        `\n\nSe guardam dado de estabelecimento, falta a coluna tenant_id e o RLS. ` +
        `Se são da plataforma, declare em TABELAS_GLOBAIS com o motivo.`,
    ).toEqual([])
  })
})
