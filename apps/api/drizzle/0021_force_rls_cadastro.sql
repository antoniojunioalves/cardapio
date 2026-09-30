-- FORCE ROW LEVEL SECURITY para os links de confirmação de e-mail do cadastro.
--
-- O Drizzle gera o ENABLE, mas não tem suporte ao FORCE. O teste em
-- `tests/rls-guard.test.ts` falha se alguma tabela tenant-scoped escapar.

ALTER TABLE "email_verification_tokens" FORCE ROW LEVEL SECURITY;
