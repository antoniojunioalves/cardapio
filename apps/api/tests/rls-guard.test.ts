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
  payment_methods:
    'catálogo de formas de pagamento da plataforma; o que cada estabelecimento aceita fica em tenant_payment_methods',
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

/**
 * Policies que NÃO filtram por `app.tenant_id`, com o comando e o motivo de
 * cada uma.
 *
 * Policies permissivas se somam: uma a mais numa tabela é uma porta a mais.
 * A guarda acima só conta se existe policy; esta olha o que cada uma libera.
 * Uma policy nova que não dependa do tenant, ou uma destas mudando de "só
 * leitura" para outra coisa, falha aqui e aparece na revisão.
 */
const POLICIES_FORA_DO_TENANT: Record<string, { comando: string; motivo: string }> = {
  'users.login_por_email': {
    comando: 'SELECT',
    motivo:
      'o login pede só e-mail e senha: lê a linha do e-mail que está entrando, para achar o ' +
      'estabelecimento antes de existir contexto de tenant (`auth/login-lookup.ts`)',
  },
}

interface PolicyInfo {
  [coluna: string]: unknown
  policy: string
  comando: string
  expressoes: string
}

describe('guarda das policies', () => {
  async function inspecionarPolicies(): Promise<PolicyInfo[]> {
    const resultado = await db.execute<PolicyInfo>(sql`
      SELECT
        c.relname || '.' || p.polname AS policy,
        CASE p.polcmd
          WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE'
          WHEN 'd' THEN 'DELETE' ELSE 'ALL'
        END AS comando,
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
          coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') AS expressoes
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
      ORDER BY 1
    `)

    return resultado.rows
  }

  it('toda policy filtra pelo tenant, menos as declaradas de propósito', async () => {
    const policies = await inspecionarPolicies()
    expect(policies.length).toBeGreaterThan(0)

    const foraDoTenant = policies
      .filter((p) => !p.expressoes.includes('app.tenant_id'))
      .map((p) => ({ policy: p.policy, comando: p.comando }))

    expect(
      foraDoTenant,
      `Policies que não filtram por app.tenant_id precisam estar em POLICIES_FORA_DO_TENANT, ` +
        `com o mesmo comando e o motivo.`,
    ).toEqual(
      Object.entries(POLICIES_FORA_DO_TENANT).map(([policy, { comando }]) => ({ policy, comando })),
    )
  })
})

interface ChaveEstrangeira {
  [coluna: string]: unknown
  tabela: string
  referencia: string
  colunas: string[]
  colunas_referenciadas: string[]
}

/**
 * A checagem de chave estrangeira do PostgreSQL roda por fora do RLS.
 *
 * Comprovado em execução: o Tenant A não enxerga a categoria do Tenant B, mas
 * uma FK simples `category_id → categories(id)` aceita que A crie um produto
 * apontando para ela, bastando saber o UUID. O RLS protege o que se lê e o
 * que se grava; não protege para onde uma referência aponta.
 *
 * A correção é a FK incluir o tenant dos dois lados —
 * `(tenant_id, category_id) → categories(tenant_id, id)` — e aí o banco exige
 * que filho e pai sejam do mesmo estabelecimento.
 */
describe('guarda de referências entre tenants', () => {
  it('toda FK entre tabelas tenant-scoped inclui o tenant_id dos dois lados', async () => {
    const resultado = await db.execute<ChaveEstrangeira>(sql`
      WITH tenant_scoped AS (
        SELECT c.oid FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND EXISTS (
            SELECT 1 FROM pg_attribute a
            WHERE a.attrelid = c.oid AND a.attname = 'tenant_id'
              AND a.attnum > 0 AND NOT a.attisdropped
          )
      )
      SELECT
        con.conrelid::regclass::text  AS tabela,
        con.confrelid::regclass::text AS referencia,
        ARRAY(
          SELECT a.attname::text FROM unnest(con.conkey) k
          JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k
        ) AS colunas,
        ARRAY(
          SELECT a.attname::text FROM unnest(con.confkey) k
          JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k
        ) AS colunas_referenciadas
      FROM pg_constraint con
      WHERE con.contype = 'f'
        AND con.conrelid  IN (SELECT oid FROM tenant_scoped)
        AND con.confrelid IN (SELECT oid FROM tenant_scoped)
        AND con.confrelid <> (SELECT oid FROM pg_class WHERE relname = 'tenants')
      ORDER BY 1, 2
    `)

    const vulneraveis = resultado.rows.filter(
      (fk) => !fk.colunas.includes('tenant_id') || !fk.colunas_referenciadas.includes('tenant_id'),
    )

    expect(
      vulneraveis.map((fk) => `${fk.tabela}(${fk.colunas.join(', ')}) → ${fk.referencia}`),
      `Estas chaves estrangeiras permitem apontar para uma linha de outro estabelecimento:\n\n` +
        `Use uma FK composta: foreignKey({ columns: [t.tenantId, t.xxxId], ` +
        `foreignColumns: [alvo.tenantId, alvo.id] }), com unique(tenantId, id) no alvo.`,
    ).toEqual([])
  })
})
