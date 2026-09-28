-- FORCE ROW LEVEL SECURITY para as tabelas de personalização e combo.
--
-- O Drizzle gera o ENABLE, mas não tem suporte ao FORCE. O teste em
-- `tests/rls-guard.test.ts` falha se alguma tabela tenant-scoped escapar.

ALTER TABLE "option_groups" FORCE ROW LEVEL SECURITY;
ALTER TABLE "options" FORCE ROW LEVEL SECURITY;
ALTER TABLE "product_option_groups" FORCE ROW LEVEL SECURITY;
ALTER TABLE "combo_items" FORCE ROW LEVEL SECURITY;
