-- FORCE ROW LEVEL SECURITY para as tabelas da Fase 5.
--
-- O Drizzle gera o ENABLE, mas não tem suporte ao FORCE. Toda tabela
-- tenant-scoped nova precisa da linha correspondente aqui; o teste em
-- `tests/rls-guard.test.ts` falha se alguma escapar.

ALTER TABLE "tenant_settings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "business_hours" FORCE ROW LEVEL SECURITY;
ALTER TABLE "delivery_settings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "delivery_regions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "tenant_payment_methods" FORCE ROW LEVEL SECURITY;
