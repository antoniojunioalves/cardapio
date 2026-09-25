# Plano do projeto

**Atualizado em:** 2026-09-25
**Fase atual:** 1 de 15 — concluída, aguardando validação
**Próxima:** Fase 2 — base do backend com Drizzle e migrations

---

## Estado atual

O monorepo está de pé e funcionando. `pnpm dev` sobe API e frontend; `pnpm verify` passa em
typecheck, lint, testes e build. O PostgreSQL 18 sobe pelo Docker Compose com a role de
aplicação já criada sem privilégio de contornar RLS.

**Ainda não existe:** tabela, migration, autenticação, tenant, produto, pedido, carrinho. O
frontend tem uma página só, que serve para verificar visualmente que a base funciona.

---

## Fases

A ordem sugerida originalmente foi ajustada em três pontos, cada um porque algo posterior
dependia do item movido. As mudanças estão marcadas.

| #   | Fase                                                                                                                | Status       |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------ |
| 0   | Arquitetura e documentação                                                                                          | ✅ Concluída |
| 1   | Monorepo, tooling, Docker, PostgreSQL                                                                               | ✅ Concluída |
| 2   | Base do backend: Drizzle, migrations, `/ready` verificando o banco, rate limiting, OpenAPI                          | ⬜ Próxima   |
| 3   | Multi-tenancy: modelo, `TenantContext`, RLS, testes de isolamento, tabelas de plano                                 | ⬜           |
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

### Por que a ordem mudou

**Configurações do estabelecimento subiram para a Fase 5.** Horários, taxa de entrega, pedido
mínimo e formas de pagamento eram a fase 13 no plano original, mas o cardápio público precisa
exibir "aberto/fechado", taxa e pedido mínimo. Mantendo a ordem antiga, o cardápio público seria
construído duas vezes.

**Storage subiu para a Fase 6.** Produto nasce com imagem. Construir o catálogo sem upload e
voltar depois significa revisitar formulário, modelo e interface.

**Auditoria subiu para a Fase 4.** O requisito é registrar "desde o início". A tabela e o helper
nascem junto da primeira ação administrativa, e cada fase seguinte registra as suas — em vez de
instrumentar tudo retroativamente no fim, quando o custo é maior e o esquecimento é certo.

---

## Fase 1 — concluída

### Microtasks

| #   | Tarefa                                                                           | Status |
| --- | -------------------------------------------------------------------------------- | ------ |
| 1   | `git init`, `.gitignore`, `.nvmrc`                                               | ✅     |
| 2   | Raiz: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, Prettier              | ✅     |
| 3   | `packages/config`: identidade do produto + bases de tsconfig e eslint            | ✅     |
| 4   | `apps/api`: Fastify, env com Zod, pino, erros padronizados, `/health` e `/ready` | ✅     |
| 5   | `apps/web`: Vite, React, Tailwind, tokens de tema, página de verificação         | ✅     |
| 6   | `docker-compose.yml` com PostgreSQL 18 e role sem `BYPASSRLS`                    | ✅     |
| 7   | `.env.example`                                                                   | ✅     |
| 8   | Sete documentos na raiz + `docs/`                                                | ✅     |
| 9   | Validação: install, typecheck, lint, test, build, execução real                  | ✅     |
| 10  | Commits                                                                          | ✅     |

### Verificação executada

| Verificação                  | Resultado                                                      |
| ---------------------------- | -------------------------------------------------------------- |
| `pnpm install`               | sem conflito de peer                                           |
| `pnpm typecheck`             | 4 tarefas, zero erro                                           |
| `pnpm lint`                  | 4 tarefas, zero erro — e comprovadamente ativo                 |
| `pnpm test`                  | 8 testes, zero aviso                                           |
| `pnpm build`                 | 3 tarefas; bundle web 225 kB / 70 kB comprimido                |
| API em execução              | `/health`, `/ready`, 404 padronizado, request-id, helmet, CORS |
| `pnpm dev`                   | ambos os processos sobem e respondem                           |
| `docker compose up postgres` | saudável em ~6s, role de aplicação criada                      |
| Isolamento por RLS           | comprovado em banco real                                       |

O lint foi verificado plantando um arquivo com violações; `no-floating-promises` acusou, o que
só ocorre com análise de tipos ativa. O arquivo foi removido.

---

## Fase 2 — próxima

Ainda não detalhada em microtasks; o plano é escrito ao entrar na fase, com o estado real em mãos.

Escopo pretendido:

- Drizzle ORM e drizzle-kit configurados contra o PostgreSQL do compose
- Primeira migration, ainda sem tabela de domínio
- `/ready` verificando a conexão de verdade, em vez de `checks: {}`
- `@fastify/rate-limit`
- OpenAPI com `@fastify/swagger` e `fastify-type-provider-zod`, expondo `/docs`
- Pool de conexões e encerramento gracioso incluindo o banco

Questão em aberto para decidir na Fase 2: gerar UUIDv7 no banco, com o `uuidv7()` nativo do
PostgreSQL 18, ou na aplicação. Gerar na aplicação permite conhecer o id antes do insert, o que
ajuda em log e evento; gerar no banco dispensa uma dependência.

---

## Decisões registradas

O raciocínio completo está em [ARCHITECTURE.md](ARCHITECTURE.md#10-decisões-registradas).

| Decisão                                             | Resumo                                                          |
| --------------------------------------------------- | --------------------------------------------------------------- |
| Banco único, schema único, `tenant_id`              | Muitos tenants pequenos e homogêneos                            |
| RLS + camada tenant-scoped + teste-guarda           | Duas defesas independentes, mais um portão no CI                |
| TypeScript 6.0.3 em vez de 7.0.2                    | `typescript-eslint` não suporta TS 7                            |
| Dinheiro em centavos inteiros                       | Ponto flutuante quebra a checagem de pedido mínimo              |
| Escopo `@repo/` nos pacotes internos                | Renomear o produto não toca em nenhum import                    |
| Compose cobre só o PostgreSQL                       | Containerizar o dev de um monorepo pnpm custa mais do que rende |
| Um só pacote compartilhado                          | `packages/shared` quando houver conteúdo real                   |
| Dependências instaladas na fase em que forem usadas | `package.json` reflete o que o código importa                   |

---

## Pendências conhecidas

| Item                                                   | Quando resolve |
| ------------------------------------------------------ | -------------- |
| `/ready` devolve `checks: {}` — nada a verificar ainda | Fase 2         |
| Sem rate limiting                                      | Fase 2         |
| Sem OpenAPI                                            | Fase 2         |
| Sem Dockerfile para API e web                          | Fase de deploy |
| Sem CI                                                 | A definir      |
