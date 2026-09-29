-- FORCE ROW LEVEL SECURITY para as tabelas do catálogo.
--
-- O Drizzle gera o ENABLE, mas não tem suporte ao FORCE. O teste em
-- `tests/rls-guard.test.ts` falha se alguma tabela tenant-scoped escapar.

ALTER TABLE "categories" FORCE ROW LEVEL SECURITY;
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;
