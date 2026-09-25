-- FORCE ROW LEVEL SECURITY
--
-- O Drizzle gera o `ENABLE ROW LEVEL SECURITY`, mas não tem suporte ao FORCE.
-- Por isso esta migration é escrita à mão, e separada da gerada: assim ela
-- sobrevive a qualquer `drizzle-kit generate` futuro.
--
-- O que o FORCE acrescenta: sem ele, o DONO da tabela fica isento das policies
-- nas consultas. No nosso caso o dono é a role `cardapio_migrator`, usada só em
-- migrations — então o FORCE garante que nem por essa conexão alguém leia ou
-- escreva linha de outro tenant sem contexto.
--
-- Ele NÃO protege contra a remoção das policies: o dono continua podendo
-- executar `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`. Quem protege disso é a
-- separação de roles — a aplicação não é dona de tabela nenhuma e não tem DDL.
--
-- Toda tabela tenant-scoped criada daqui em diante precisa da linha
-- correspondente aqui ou numa migration equivalente. O teste em
-- `tests/rls-guard.test.ts` falha se alguma escapar.

ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
