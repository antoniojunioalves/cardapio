-- As tabelas dos papéis globais (OWNER, ADMIN e STAFF) e do catálogo de
-- permissões no banco. Os usuários já foram passados para os perfis do
-- estabelecimento na migration anterior, e o catálogo das permissões agora
-- mora no código (`@repo/shared`).

DROP TABLE "permissions" CASCADE;--> statement-breakpoint
DROP TABLE "role_permissions" CASCADE;--> statement-breakpoint
DROP TABLE "roles" CASCADE;--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "user_roles" CASCADE;--> statement-breakpoint
DROP TABLE "user_roles" CASCADE;