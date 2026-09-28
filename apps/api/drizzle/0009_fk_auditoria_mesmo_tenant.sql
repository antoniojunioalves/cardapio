-- FK composta do ator da auditoria, escrita à mão.
--
-- Precisa de `ON DELETE SET NULL (actor_user_id)` — anulando só o ator. O
-- `SET NULL` comum numa FK composta anularia também o `tenant_id`, que é
-- obrigatório, e remover um usuário passaria a falhar. O Drizzle não expressa
-- essa forma, então ela vive aqui (PostgreSQL 15+).
--
-- Com o ator nulo — ação do sistema, ou usuário removido —, a FK não é
-- checada (MATCH SIMPLE), que é o comportamento desejado.

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_ator_mesmo_tenant"
  FOREIGN KEY ("tenant_id", "actor_user_id")
  REFERENCES "public"."users" ("tenant_id", "id")
  ON DELETE SET NULL ("actor_user_id");
