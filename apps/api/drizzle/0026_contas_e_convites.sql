-- Uma conta por pessoa da equipe (`accounts`), com um vínculo em cada
-- estabelecimento (`users`), e os convites para a equipe (`invitations`).
--
-- Até aqui o e-mail e a senha moravam em `users`, únicos na plataforma: quem
-- trabalhou num estabelecimento não entrava na equipe de outro. Agora a pessoa
-- é a conta, e `users` é o que ela é em cada estabelecimento.
--
-- Esta migration cria as tabelas e passa os dados: cada usuário que existe
-- vira uma conta com o mesmo id. A seguinte tira de `users` o que foi para a
-- conta.

CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" varchar(254) NOT NULL,
	"name" varchar(120) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_email" UNIQUE("email"),
	CONSTRAINT "accounts_email_minusculo" CHECK ("accounts"."email" = lower("accounts"."email"))
);
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" varchar(254) NOT NULL,
	"profile_id" uuid NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash" UNIQUE("token_hash"),
	CONSTRAINT "invitations_um_por_email" UNIQUE("tenant_id","email"),
	CONSTRAINT "invitations_email_minusculo" CHECK ("invitations"."email" = lower("invitations"."email"))
);
--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_id" uuid;--> statement-breakpoint

-- Os usuários que existem viram contas, um estabelecimento de cada vez, com o
-- contexto dele definido: `users` tem RLS forçado, e a migration é atendida
-- pelas mesmas policies que a aplicação. `accounts` ainda não tem o RLS
-- forçado — só ganha no fim desta migration —, então a dona da tabela grava
-- nela sem contexto de conta.
--
-- A conta leva o id do usuário: não há o que casar depois, e cada vínculo
-- aponta para a conta que tem o mesmo id que ele. Nenhum e-mail se repete —
-- `users_email` o garantia na plataforma inteira —, então não há conta a fundir.
DO $$
DECLARE
  estabelecimento record;
BEGIN
  FOR estabelecimento IN SELECT id FROM tenants LOOP
    PERFORM set_config('app.tenant_id', estabelecimento.id::text, true);

    INSERT INTO accounts (id, email, name, password_hash, email_verified_at, created_at, updated_at)
    SELECT id, email, name, password_hash, email_verified_at, created_at, updated_at FROM users;

    UPDATE users SET account_id = id;
  END LOOP;

  -- O contexto não sobra para o resto da migration.
  PERFORM set_config('app.tenant_id', '', true);
END $$;--> statement-breakpoint

ALTER TABLE "users" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_perfil_mesmo_tenant" FOREIGN KEY ("tenant_id","profile_id") REFERENCES "public"."profiles"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_autor_mesmo_tenant" FOREIGN KEY ("tenant_id","invited_by_user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitations_tenant_idx" ON "invitations" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_account_idx" ON "users" USING btree ("account_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_conta_por_tenant" UNIQUE("tenant_id","account_id");--> statement-breakpoint
CREATE POLICY "vinculos_da_conta" ON "users" AS PERMISSIVE FOR SELECT TO public USING ("users"."account_id" = nullif(current_setting('app.account_id', true), '')::uuid AND nullif(current_setting('app.tenant_id', true), '') IS NULL);--> statement-breakpoint
CREATE POLICY "conta_por_email" ON "accounts" AS PERMISSIVE FOR SELECT TO public USING ("accounts"."email" = nullif(current_setting('app.account_email', true), ''));--> statement-breakpoint
CREATE POLICY "conta_nova" ON "accounts" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("accounts"."email" = nullif(current_setting('app.account_email', true), ''));--> statement-breakpoint
CREATE POLICY "conta_propria" ON "accounts" AS PERMISSIVE FOR ALL TO public USING ("accounts"."id" = nullif(current_setting('app.account_id', true), '')::uuid) WITH CHECK ("accounts"."id" = nullif(current_setting('app.account_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "contas_da_equipe" ON "accounts" AS PERMISSIVE FOR SELECT TO public USING (exists (select 1 from users where users.account_id = "accounts"."id"));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invitations" AS PERMISSIVE FOR ALL TO public USING ("invitations"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("invitations"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint

-- O Drizzle gera o ENABLE, mas não tem suporte ao FORCE. O teste em
-- `tests/rls-guard.test.ts` falha se alguma tabela escapar.
ALTER TABLE "accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;
