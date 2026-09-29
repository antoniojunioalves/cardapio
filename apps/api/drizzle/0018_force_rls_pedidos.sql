-- FORCE ROW LEVEL SECURITY para as tabelas de pedido.
--
-- O Drizzle gera o ENABLE, mas não tem suporte ao FORCE. O teste em
-- `tests/rls-guard.test.ts` falha se alguma tabela tenant-scoped escapar.

ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
ALTER TABLE "order_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "order_item_options" FORCE ROW LEVEL SECURITY;
ALTER TABLE "order_counters" FORCE ROW LEVEL SECURITY;
