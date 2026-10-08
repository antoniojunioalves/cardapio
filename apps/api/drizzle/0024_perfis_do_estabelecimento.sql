-- Perfis do estabelecimento: conjuntos de permissões, com nome, que o dono
-- monta e dá a cada pessoa. Substituem os três papéis globais (OWNER, ADMIN e
-- STAFF), que eram iguais em todo estabelecimento e não se ajustavam.
--
-- Esta migration cria as tabelas, dá a cada estabelecimento que já existe os
-- quatro perfis prontos e passa cada usuário do papel que tinha para o perfil
-- correspondente. A seguinte apaga as tabelas dos papéis.

CREATE TABLE "profile_permissions" (
	"tenant_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"permission" varchar(64) NOT NULL,
	CONSTRAINT "profile_permissions_profile_id_permission_pk" PRIMARY KEY("profile_id","permission")
);
--> statement-breakpoint
ALTER TABLE "profile_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"description" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_tenant_id_id" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "profile_permissions" ADD CONSTRAINT "profile_permissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_permissions" ADD CONSTRAINT "profile_permissions_perfil_mesmo_tenant" FOREIGN KEY ("tenant_id","profile_id") REFERENCES "public"."profiles"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_permissions_tenant_idx" ON "profile_permissions" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_nome_unico" ON "profiles" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_perfil_mesmo_tenant" FOREIGN KEY ("tenant_id","profile_id") REFERENCES "public"."profiles"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_um_dono_por_tenant" ON "users" USING btree ("tenant_id") WHERE "users"."is_owner";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_dono_sem_perfil" CHECK (NOT ("users"."is_owner" AND "users"."profile_id" IS NOT NULL));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "profile_permissions" AS PERMISSIVE FOR ALL TO public USING ("profile_permissions"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("profile_permissions"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "profiles" AS PERMISSIVE FOR ALL TO public USING ("profiles"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("profiles"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint

-- O Drizzle gera o ENABLE, mas não tem suporte ao FORCE. O teste em
-- `tests/rls-guard.test.ts` falha se alguma tabela tenant-scoped escapar.
ALTER TABLE "profiles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profile_permissions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Os estabelecimentos que já existem. Um de cada vez, com o contexto dele
-- definido: `users`, `user_roles` e as tabelas novas têm RLS forçado, e a
-- migration é atendida pelas mesmas policies que a aplicação — não há atalho
-- por fora do isolamento.
--
-- As listas de permissões são as de `PERFIS_PRONTOS` (`@repo/shared`) no dia
-- desta migration, congeladas aqui: um estabelecimento novo recebe as do
-- código; os de antes ficam com estas, e o dono as ajusta.
--
-- De papel para perfil: OWNER vira o proprietário (`is_owner`), ADMIN vai para
-- "Administrador" e STAFF para "Atendente" — que continua atualizando e
-- cancelando pedidos, e passa a poder marcar o que esgotou.
DO $$
DECLARE
  estabelecimento record;
  administrador uuid;
  gerente uuid;
  atendente uuid;
  cozinha uuid;
BEGIN
  FOR estabelecimento IN SELECT id FROM tenants LOOP
    PERFORM set_config('app.tenant_id', estabelecimento.id::text, true);

    INSERT INTO profiles (tenant_id, name, description)
    VALUES (estabelecimento.id, 'Administrador', 'Cuida de tudo, menos desativar pessoas.')
    RETURNING id INTO administrador;

    INSERT INTO profiles (tenant_id, name, description)
    VALUES (
      estabelecimento.id,
      'Gerente do cardápio',
      'Monta o cardápio inteiro: produtos, preços, categorias, opcionais e combos.'
    )
    RETURNING id INTO gerente;

    INSERT INTO profiles (tenant_id, name, description)
    VALUES (
      estabelecimento.id,
      'Atendente',
      'Acompanha e atualiza os pedidos, e marca o que esgotou.'
    )
    RETURNING id INTO atendente;

    INSERT INTO profiles (tenant_id, name, description)
    VALUES (estabelecimento.id, 'Cozinha', 'Vê os pedidos, muda o status e marca o que esgotou.')
    RETURNING id INTO cozinha;

    INSERT INTO profile_permissions (tenant_id, profile_id, permission)
    SELECT estabelecimento.id, administrador, unnest(ARRAY[
      'orders:read', 'orders:update', 'orders:cancel', 'orders:pause', 'customers:read',
      'products:read', 'products:availability', 'products:price', 'products:update',
      'products:create', 'products:delete',
      'categories:create', 'categories:update', 'categories:delete',
      'settings:read', 'settings:update',
      'users:read', 'users:create', 'users:update', 'profiles:manage', 'audit:read'
    ]);

    INSERT INTO profile_permissions (tenant_id, profile_id, permission)
    SELECT estabelecimento.id, gerente, unnest(ARRAY[
      'products:read', 'products:availability', 'products:price', 'products:update',
      'products:create', 'products:delete',
      'categories:create', 'categories:update', 'categories:delete'
    ]);

    INSERT INTO profile_permissions (tenant_id, profile_id, permission)
    SELECT estabelecimento.id, atendente, unnest(ARRAY[
      'orders:read', 'orders:update', 'orders:cancel', 'customers:read',
      'products:read', 'products:availability'
    ]);

    INSERT INTO profile_permissions (tenant_id, profile_id, permission)
    SELECT estabelecimento.id, cozinha, unnest(ARRAY[
      'orders:read', 'orders:update', 'products:read', 'products:availability'
    ]);

    UPDATE users
    SET is_owner = true
    WHERE id IN (
      SELECT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.code = 'OWNER'
    );

    UPDATE users
    SET profile_id = administrador
    WHERE NOT is_owner AND id IN (
      SELECT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.code = 'ADMIN'
    );

    UPDATE users
    SET profile_id = atendente
    WHERE NOT is_owner AND profile_id IS NULL AND id IN (
      SELECT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.code = 'STAFF'
    );
  END LOOP;

  -- O contexto não sobra para o resto da migration.
  PERFORM set_config('app.tenant_id', '', true);
END $$;
