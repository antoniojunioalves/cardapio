-- FORCE ROW LEVEL SECURITY para as tabelas de cliente final.
--
-- O Drizzle gera o ENABLE, mas não tem suporte ao FORCE. O teste em
-- `tests/rls-guard.test.ts` falha se alguma tabela tenant-scoped escapar.

ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "customer_addresses" FORCE ROW LEVEL SECURITY;
