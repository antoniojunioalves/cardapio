-- FORCE ROW LEVEL SECURITY para as tabelas da Fase 4.
--
-- O Drizzle gera o ENABLE, mas não tem suporte ao FORCE — daí esta migration
-- escrita à mão. Sem o FORCE, o dono das tabelas (a role de migration) fica
-- isento das policies nas consultas.
--
-- Toda tabela tenant-scoped nova precisa da linha correspondente aqui ou numa
-- migration equivalente. O teste em `tests/rls-guard.test.ts` falha se alguma
-- escapar.

ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
ALTER TABLE "user_roles" FORCE ROW LEVEL SECURITY;
ALTER TABLE "refresh_tokens" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
