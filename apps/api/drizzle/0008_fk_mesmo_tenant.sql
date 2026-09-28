-- Chaves estrangeiras compostas entre tabelas tenant-scoped.
--
-- A checagem de FK do PostgreSQL roda por fora do RLS: uma FK simples
-- `user_id → users(id)` aceitava referência a usuário de outro estabelecimento.
-- Com `(tenant_id, user_id) → users(tenant_id, id)`, o banco exige que a
-- referência fique no mesmo estabelecimento.
--
-- A ordem foi ajustada à mão: o drizzle-kit gerou as FKs antes da restrição
-- única que elas referenciam, o que falharia. O estado final é idêntico ao do
-- snapshot.

ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_id" UNIQUE("tenant_id","id");
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_mesmo_tenant" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_mesmo_tenant" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
