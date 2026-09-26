# Plano do projeto

**Atualizado em:** 2026-09-26
**Fase atual:** 4 de 15 — concluída, aguardando validação
**Próxima:** Fase 5 — tenant e configurações do estabelecimento

---

## Estado atual

**A API já autentica.** Um usuário administrativo entra com e-mail e senha, recebe um token de
acesso e um refresh rotativo, e as rotas protegidas conferem permissão depois de estabelecer o
contexto de tenant. Toda entrada fica registrada numa auditoria que nem o próprio estabelecimento
consegue reescrever.

Sob isso, o isolamento entre estabelecimentos comprovado por testes — agora estendido aos dados
mais sensíveis do sistema: usuários, papéis, sessões e o próprio log de auditoria.

**Ainda não existe:** configurações do estabelecimento, catálogo, carrinho, pedidos, e nenhuma
tela administrativa no frontend.

---

## Fases

| #   | Fase                                                                                                                | Status       |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------ |
| 0   | Arquitetura e documentação                                                                                          | ✅ Concluída |
| 1   | Monorepo, tooling, Docker, PostgreSQL                                                                               | ✅ Concluída |
| 2   | Base do backend: Drizzle, migrations, `/ready`, rate limiting, OpenAPI                                              | ✅ Concluída |
| 3   | Multi-tenancy: modelo, `TenantContext`, RLS, testes de isolamento, tabelas de plano                                 | ✅ Concluída |
| 4   | Autenticação administrativa, RBAC e `audit_logs` — _auditoria subiu da 15_                                          | ⬜ Próxima   |
| 5   | Tenant e configurações: estabelecimento, horários, entrega, pedido mínimo, pagamentos — _absorveu a antiga fase 13_ | ⬜ Próxima   |
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

## Fase 4 — concluída

### Microtasks

| #   | Tarefa                                                                       | Status |
| --- | ---------------------------------------------------------------------------- | ------ |
| 1   | Schema: `users`, `refresh_tokens`, `user_roles`, `audit_logs` (com RLS)      | ✅     |
| 2   | Schema global: `roles`, `permissions`, `role_permissions`, `platform_admins` | ✅     |
| 3   | Migrations, incluindo o `FORCE` escrito à mão                                | ✅     |
| 4   | Hash de senha com argon2id e equalização de tempo                            | ✅     |
| 5   | Token de acesso JWT e refresh opaco com rotação                              | ✅     |
| 6   | Serviço de sessão: login, refresh com detecção de reuso, logout              | ✅     |
| 7   | `requireAuth()` — autenticação e autorização como cadeia única               | ✅     |
| 8   | Rotas `/api/v1/auth/{login,refresh,logout,me}` com OpenAPI                   | ✅     |
| 9   | `recordAudit()` na mesma transação da alteração                              | ✅     |
| 10  | Seed de papéis, permissões e usuários de demonstração                        | ✅     |
| 11  | Testes: credenciais, rotas, isolamento das novas tabelas                     | ✅     |
| 12  | Documentação, verificação e commits                                          | ✅     |

### O bug que o teste pegou

A revogação em massa da detecção de reuso acontecia **dentro** da transação, e o `throw` que
sinalizava o problema causava rollback — desfazendo em silêncio a revogação e o registro de
auditoria recém-escritos. A defesa contra token roubado se anulava, e o sintoma era o teste de
reuso encontrar as outras sessões ainda válidas.

A detecção virou um valor de retorno: a transação confirma, e só depois o erro é lançado. Vale
como regra geral — **nada que precise persistir pode ser seguido de um `throw` dentro do
`withTenant`.**

### Decisões desta fase

**Super Admin em tabela separada.** Em `users` ele precisaria de `tenant_id` nulo, e a policy
compara `tenant_id = current_tenant` — que com NULL nunca casa. A linha ficaria invisível até
para ela mesma.

**Refresh token não é JWT.** Ele já precisa de consulta ao banco para checar revogação, então a
assinatura não compraria nada e traria junto a superfície de verificação de JWT. É um valor
aleatório opaco, guardado só como hash.

**`audit_logs` é append-only pela estrutura**, não por convenção: só tem policies de select e
insert, e o RLS nega o resto.

**O usuário é recarregado a cada requisição** em vez de confiar só no token. Custa uma consulta
indexada; compra que desativar alguém valha na hora.

### Verificação executada

| Verificação                               | Resultado                                 |
| ----------------------------------------- | ----------------------------------------- |
| `pnpm typecheck` / `lint` / `build`       | zero erro                                 |
| `pnpm test`                               | **91 testes** (87 API + 4 web)            |
| Guarda de RLS ao criar as tabelas novas   | acusou as 4 globais e exigiu declaração   |
| Login, `/me`, refresh e detecção de reuso | conferidos com `curl` no servidor rodando |
| Token `alg: none`                         | recusado                                  |
| Alterar e apagar linha de auditoria       | zero linhas afetadas                      |

---

## Fase 5 — próxima

Escopo pretendido: configurações do estabelecimento, horários de funcionamento com múltiplos
intervalos, taxa de entrega fixa ou por região, retirada no local, pedido mínimo e formas de
pagamento habilitáveis — tudo tenant-scoped, com RLS e auditoria, e as primeiras rotas
administrativas de verdade usando `requireAuth`.

---

## Fases anteriores

**Fase 3** entregou o modelo multi-tenant, o `TenantContext`, o `withTenant` e o teste-guarda de
RLS. Descobriu-se ali que a policy precisa de `nullif` — sem ele um contexto vazio faz `''::uuid`
lançar erro em vez de devolver zero linhas.

**Fase 2** entregou Drizzle, migrations, `/ready` com verificação real e 503, rate limiting e
OpenAPI. Durante ela descobriu-se que o dono de uma tabela consegue remover o RLS dela, o que
levou à separação em duas roles de banco (`cardapio_migrator` com DDL, `cardapio_app` só com
DML) e à correção do ARCHITECTURE.md.

**Fase 1** entregou o monorepo, o tooling e o PostgreSQL no Docker Compose.

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
| Super Admin em tabela própria                       | Com `tenant_id` nulo a policy nunca casaria — linha invisível     |
| Refresh token opaco, não JWT                        | Já consulta o banco para revogação; assinatura não compra nada    |
| `audit_logs` sem policy de update nem delete        | Append-only pela estrutura, não por convenção                     |
| Usuário recarregado a cada requisição               | Desativar alguém passa a valer na hora                            |
| `requireAuth()` devolve a cadeia pronta             | Ordem errada entre autenticar e autorizar falharia em silêncio    |
| argon2id com parâmetros explícitos                  | Um padrão invisível nunca é revisitado                            |
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
