# Plano do projeto

**Atualizado em:** 2026-09-25
**Fase atual:** 2 de 15 — concluída, aguardando validação
**Próxima:** Fase 3 — multi-tenancy, `TenantContext` e RLS

---

## Estado atual

A API conversa com o PostgreSQL. `/ready` reflete o estado real do banco e responde 503 quando
ele está fora; `/health` permanece indiferente a isso, como deve ser. Há limite de requisições,
documentação OpenAPI em `/docs` gerada dos próprios schemas Zod, e o pipeline de migrations
está montado e executado.

O banco tem **duas roles com poderes diferentes**: uma que é dona das tabelas e roda migrations,
outra — usada pela API — que só faz DML e por isso não consegue desligar as policies de RLS que
chegam na Fase 3.

**Ainda não existe:** tabela de domínio, autenticação, tenant, produto, pedido, carrinho.

---

## Fases

| #   | Fase                                                                                                                | Status       |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------ |
| 0   | Arquitetura e documentação                                                                                          | ✅ Concluída |
| 1   | Monorepo, tooling, Docker, PostgreSQL                                                                               | ✅ Concluída |
| 2   | Base do backend: Drizzle, migrations, `/ready` verificando o banco, rate limiting, OpenAPI                          | ✅ Concluída |
| 3   | Multi-tenancy: modelo, `TenantContext`, RLS, testes de isolamento, tabelas de plano                                 | ⬜ Próxima   |
| 4   | Autenticação administrativa, RBAC e `audit_logs` — _auditoria subiu da 15_                                          | ⬜           |
| 5   | Tenant e configurações: estabelecimento, horários, entrega, pedido mínimo, pagamentos — _absorveu a antiga fase 13_ | ⬜           |
| 6   | Storage de imagens: `StorageService` + provider local — _subiu da 14_                                               | ⬜           |
| 7   | Catálogo: categorias, produtos, grupos de opções, adicionais, combos                                                | ⬜           |
| 8   | Cardápio público                                                                                                    | ⬜           |
| 9   | Carrinho                                                                                                            | ⬜           |
| 10  | Customer e checkout                                                                                                 | ⬜           |
| 11  | Pedidos: recálculo no servidor, snapshot, status                                                                    | ⬜           |
| 12  | WhatsApp                                                                                                            | ⬜           |
| 13  | WebSocket e pedidos em tempo real                                                                                   | ⬜           |
| 14  | Limites por plano                                                                                                   | ⬜           |
| 15  | Testes de segurança, hardening e refinamento                                                                        | ⬜           |

Três movimentos em relação à ordem sugerida originalmente, cada um porque algo posterior
dependia do item movido: configurações do estabelecimento para a Fase 5 (o cardápio público
precisa exibir aberto/fechado, taxa e pedido mínimo), storage para a Fase 6 (produto nasce com
imagem) e auditoria para a Fase 4 (o requisito é registrar "desde o início").

---

## Fase 2 — concluída

### Microtasks

| #   | Tarefa                                                                       | Status |
| --- | ---------------------------------------------------------------------------- | ------ |
| 1   | Dependências: Drizzle, pg, rate-limit, swagger, type-provider-zod            | ✅     |
| 2   | Carregamento do `.env` via `--env-file-if-exists` nativo do Node             | ✅     |
| 3   | `env.ts`: `DATABASE_URL` obrigatório, pool, rate limit, conexão de migration | ✅     |
| 4   | `src/db/`: pool, Drizzle, `checkDatabaseConnection()`, `closeDatabase()`     | ✅     |
| 5   | `drizzle.config.ts`, scripts `db:generate` / `db:migrate` e runner           | ✅     |
| 6   | `/ready` com verificação real e 503; `/health` mantido como liveness puro    | ✅     |
| 7   | Shutdown gracioso fechando o pool depois das requisições em curso            | ✅     |
| 8   | Rate limiting, com o 429 no formato padrão de erro                           | ✅     |
| 9   | OpenAPI e `/docs`, gerados dos schemas Zod                                   | ✅     |
| 10  | Banco de testes `cardapio_test` e `pnpm db:reset`                            | ✅     |
| 11  | **Separação em duas roles de banco** — não estava planejado, ver abaixo      | ✅     |
| 12  | Testes, documentação e commits                                               | ✅     |

### A descoberta que mudou o escopo

O plano previa uma role de banco. Ao configurar as migrations, o erro
`permission denied for database cardapio` levou a uma pergunta que valia a pena responder antes
de conceder a permissão: **o dono de uma tabela consegue desligar o RLS dela?**

Consegue:

```sql
ALTER TABLE x NO FORCE ROW LEVEL SECURITY;
ALTER TABLE x DISABLE ROW LEVEL SECURITY;
```

Comprovado em execução. Isso invalida parte do que o ARCHITECTURE.md afirmava na Fase 1 — o
`FORCE ROW LEVEL SECURITY` sujeita o dono às policies **nas consultas**, mas não o impede de
removê-las. Com uma role só, uma injeção de SQL derrubaria o isolamento de todos os tenants.

Daí a separação: `cardapio_migrator` é dona e tem DDL, usada só em migrations;
`cardapio_app` só faz DML e é a que a API usa. Feito agora porque ainda não existe nenhuma
tabela — depois da Fase 3 seria bem mais caro.

### Verificação executada

| Verificação                            | Resultado                                                    |
| -------------------------------------- | ------------------------------------------------------------ |
| `pnpm typecheck` / `lint` / `build`    | 4 / 4 / 3 tarefas, zero erro                                 |
| `pnpm test`                            | **23 testes** (19 API + 4 web), zero aviso                   |
| `pnpm format:check`                    | conforme                                                     |
| `pnpm db:generate`                     | lê o schema sem tocar no banco                               |
| `pnpm db:migrate`                      | aplica; schema `drizzle` criado com dono `cardapio_migrator` |
| API sem `DATABASE_URL`                 | falha na inicialização, com a variável faltante nomeada      |
| `/health` com o banco derrubado        | segue 200 — liveness não depende do banco                    |
| `/ready` com o banco derrubado         | 503 e `connect ECONNREFUSED 127.0.0.1:5432`                  |
| Banco religado                         | `/ready` volta a 200 sozinho; o processo nunca caiu          |
| `cardapio_app` tentando `CREATE TABLE` | `permission denied` — coberto por teste                      |

---

## Fase 3 — próxima

Escopo pretendido:

- Tabela `tenants` e as tabelas de plano (`plans`, `plan_features`, `subscriptions`)
- `TenantContext` e o resolver, com o tenant vindo do usuário autenticado ou do `tenantSlug`
- `withTenant(ctx, …)`: transação com `set_config('app.tenant_id', …, true)`
- Policies de RLS com a forma já validada, usando `nullif`
- Teste-guarda que varre o catálogo e falha se alguma tabela com `tenant_id` estiver sem RLS
- Testes de isolamento: Tenant A não lê nem altera nada de B

---

## Decisões registradas

O raciocínio completo está em [ARCHITECTURE.md](ARCHITECTURE.md).

| Decisão                                             | Resumo                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| Banco único, schema único, `tenant_id`              | Muitos tenants pequenos e homogêneos                              |
| RLS + camada tenant-scoped + teste-guarda           | Duas defesas independentes, mais um portão no CI                  |
| **Duas roles de banco: migrator e app**             | O dono da tabela consegue desligar o RLS; a app não pode ser dona |
| **UUIDv7 gerado no banco** (`uuidv7()` do PG 18)    | Vale para seed e INSERT manual, sem dependência                   |
| **Testes contra PostgreSQL real**                   | RLS não se prova com mock                                         |
| **`/health` não consulta o banco**                  | Senão uma oscilação do banco reinicia processos saudáveis         |
| TypeScript 6.0.3 em vez de 7.0.2                    | `typescript-eslint` não suporta TS 7                              |
| Dinheiro em centavos inteiros                       | Ponto flutuante quebra a checagem de pedido mínimo                |
| Escopo `@repo/` nos pacotes internos                | Renomear o produto não toca em nenhum import                      |
| Compose cobre só o PostgreSQL                       | Containerizar o dev de um monorepo pnpm custa mais do que rende   |
| Um só pacote compartilhado                          | `packages/shared` quando houver conteúdo real                     |
| Dependências instaladas na fase em que forem usadas | `package.json` reflete o que o código importa                     |

---

## Pendências conhecidas

| Item                                                                          | Quando resolve |
| ----------------------------------------------------------------------------- | -------------- |
| Rate limit conta em memória — vira limite por instância se houver mais de uma | Deploy         |
| Sem Dockerfile para API e web                                                 | Deploy         |
| Sem CI                                                                        | A definir      |
| `packages/shared` ainda não existe                                            | Fase 3+        |
