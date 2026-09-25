# Plano do projeto

**Atualizado em:** 2026-09-25
**Fase atual:** 3 de 15 — concluída, aguardando validação
**Próxima:** Fase 4 — autenticação administrativa, RBAC e auditoria

---

## Estado atual

**O isolamento entre estabelecimentos está implementado e comprovado.** Um tenant não lê nem
altera dado de outro — nem sabendo o identificador exato da linha, nem esquecendo o `WHERE`, nem
em requisições concorrentes. As tabelas de tenant, planos e assinaturas existem, com migrations
aplicadas, e há um seed de demonstração.

Sob isso: monorepo com API e frontend, PostgreSQL com duas roles de poderes distintos,
documentação OpenAPI em `/docs`, limite de requisições e sondas que refletem o estado real do
banco.

**Ainda não existe:** autenticação, usuários, catálogo, carrinho, pedidos.

---

## Fases

| #   | Fase                                                                                                                | Status       |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------ |
| 0   | Arquitetura e documentação                                                                                          | ✅ Concluída |
| 1   | Monorepo, tooling, Docker, PostgreSQL                                                                               | ✅ Concluída |
| 2   | Base do backend: Drizzle, migrations, `/ready`, rate limiting, OpenAPI                                              | ✅ Concluída |
| 3   | Multi-tenancy: modelo, `TenantContext`, RLS, testes de isolamento, tabelas de plano                                 | ✅ Concluída |
| 4   | Autenticação administrativa, RBAC e `audit_logs` — _auditoria subiu da 15_                                          | ⬜ Próxima   |
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

## Fase 3 — concluída

### Microtasks

| #   | Tarefa                                                            | Status |
| --- | ----------------------------------------------------------------- | ------ |
| 1   | Schema: `tenants`, `plans`, `plan_features`, `subscriptions`      | ✅     |
| 2   | Primeira migration gerada, com RLS e policy                       | ✅     |
| 3   | Migration escrita à mão para o `FORCE ROW LEVEL SECURITY`         | ✅     |
| 4   | `TenantContext` com construtores que nomeiam a origem             | ✅     |
| 5   | `withTenant()` — transação com `set_config` local                 | ✅     |
| 6   | Repositório de resolução: `findTenantBySlug`, `findTenantById`    | ✅     |
| 7   | Teste-guarda de RLS varrendo o catálogo do PostgreSQL             | ✅     |
| 8   | Testes de isolamento entre tenants                                | ✅     |
| 9   | Seed de demonstração, idempotente                                 | ✅     |
| 10  | Migração automática do banco de testes no `globalSetup` do Vitest | ✅     |
| 11  | Documentação, verificação e commits                               | ✅     |

### Decisões desta fase

**A tabela `tenants` não tem RLS.** Ela é o registro que traduz slug em tenant, e essa tradução
antecede o contexto — é ela que o estabelece. Uma policy `id = current_tenant` tornaria o
cardápio público irresolvível. O que ocupa o lugar do RLS é o formato do repositório: consultas
estreitas e nomeadas, sem listagem genérica. Consequência registrada: nada sensível entra nessa
tabela; vai para `tenant_settings` na Fase 5.

**O teste-guarda cobre os dois lados.** Verificar "toda tabela com `tenant_id` tem RLS" não
consegue enxergar uma tabela que _deveria_ ter `tenant_id` e não tem. Por isso o guarda também
exige que toda tabela **sem** `tenant_id` esteja declarada como global, com motivo. Criar tabela
nova passa a obrigar uma escolha explícita.

**`limitValue` nulo significa ilimitado**, e não zero — zero é um limite válido ("este plano não
permite nenhum") e precisava de representação distinta.

**O código do plano é `varchar`, não enum.** Criar FREE, STARTER, ADVANCED, PREMIUM ou CUSTOM
vira um INSERT, e não uma migration.

### Verificação executada

| Verificação                                               | Resultado                                  |
| --------------------------------------------------------- | ------------------------------------------ |
| `pnpm typecheck` / `lint` / `build`                       | 4 / 4 / 3 tarefas, zero erro               |
| `pnpm test`                                               | **48 testes** (44 API + 4 web)             |
| `pnpm db:migrate`                                         | 4 tabelas; `subscriptions` com RLS forçado |
| `pnpm db:seed` duas vezes                                 | idempotente, sem duplicar                  |
| App tentando `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` | `must be owner of table`                   |
| Conferência manual no psql como a role da aplicação       | isolamento confirmado                      |

O lint pegou um descarte de `error.cause` no setup de testes (regra `preserve-caught-error`) e o
typecheck pegou um tipo sem index signature que os testes não veriam — ambos corrigidos.

---

## Fases anteriores

**Fase 2** entregou Drizzle, migrations, `/ready` com verificação real e 503, rate limiting e
OpenAPI. Durante ela descobriu-se que o dono de uma tabela consegue remover o RLS dela, o que
levou à separação em duas roles de banco (`cardapio_migrator` com DDL, `cardapio_app` só com
DML) e à correção do ARCHITECTURE.md.

**Fase 1** entregou o monorepo, o tooling e o PostgreSQL no Docker Compose.

---

## Fase 4 — próxima

Escopo pretendido:

- Tabelas `users`, `roles`, `permissions`, `user_roles` — tenant-scoped, com RLS
- Hash de senha, JWT de acesso curto e refresh token
- Middleware de autenticação que produz o `TenantContext` a partir do usuário
- Autorização por permissão, verificada **depois** do contexto de tenant
- `audit_logs` e o helper de registro, usados daqui em diante por todas as fases
- Conceito de Super Admin, com a estrutura mínima
- Testes de isolamento para usuários e de autorização por papel

---

## Decisões registradas

O raciocínio completo está em [ARCHITECTURE.md](ARCHITECTURE.md).

| Decisão                                             | Resumo                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| Banco único, schema único, `tenant_id`              | Muitos tenants pequenos e homogêneos                              |
| RLS + camada tenant-scoped + teste-guarda           | Duas defesas independentes, mais um portão no CI                  |
| Duas roles de banco: migrator e app                 | O dono da tabela consegue desligar o RLS; a app não pode ser dona |
| `TenantContext` sem construtor genérico             | Não há como criar contexto a partir de dado do cliente            |
| `tenants` sem RLS, com repositório estreito         | A resolução do slug antecede o contexto                           |
| Guarda exige declarar tabelas globais               | Pega a tabela que deveria ter `tenant_id` e não tem               |
| UUIDv7 gerado no banco (`uuidv7()` do PG 18)        | Vale para seed e INSERT manual, sem dependência                   |
| Testes contra PostgreSQL real                       | RLS não se prova com mock                                         |
| `/health` não consulta o banco                      | Senão uma oscilação do banco reinicia processos saudáveis         |
| TypeScript 6.0.3 em vez de 7.0.2                    | `typescript-eslint` não suporta TS 7                              |
| Dinheiro em centavos inteiros                       | Ponto flutuante quebra a checagem de pedido mínimo                |
| Escopo `@repo/` nos pacotes internos                | Renomear o produto não toca em nenhum import                      |
| Compose cobre só o PostgreSQL                       | Containerizar o dev de um monorepo pnpm custa mais do que rende   |
| Dependências instaladas na fase em que forem usadas | `package.json` reflete o que o código importa                     |

---

## Pendências conhecidas

| Item                                                                          | Quando resolve                                |
| ----------------------------------------------------------------------------- | --------------------------------------------- |
| Rate limit conta em memória — vira limite por instância se houver mais de uma | Deploy                                        |
| Sem Dockerfile para API e web                                                 | Deploy                                        |
| Sem CI                                                                        | A definir                                     |
| Nenhuma rota HTTP expõe tenants ainda — a fase é de fundação                  | Fases 5 e 8                                   |
| `packages/shared` ainda não existe                                            | Quando houver schema Zod usado nos dois lados |
