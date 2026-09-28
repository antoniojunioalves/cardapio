# Plano do projeto

**Atualizado em:** 2026-09-28
**Fase atual:** 5 de 15 — concluída, aguardando validação
**Próxima:** Fase 6 — storage de imagens

---

## Estado atual

**O estabelecimento já é configurável.** Horários de funcionamento com vários intervalos por dia
e travessia de meia-noite, taxa de entrega fixa ou por região, retirada no local, pedido mínimo
e formas de pagamento — tudo por rotas administrativas que exigem permissão e registram
auditoria. A API responde se o estabelecimento está aberto **agora**, no fuso dele.

Sob isso: autenticação com argon2id e JWT, RBAC por permissão, e o isolamento entre
estabelecimentos comprovado por testes em todas as 10 tabelas tenant-scoped.

**Ainda não existe:** catálogo, carrinho, pedidos, e nenhuma tela administrativa no frontend.

---

## Fases

| #   | Fase                                                                                                                | Status       |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------ |
| 0   | Arquitetura e documentação                                                                                          | ✅ Concluída |
| 1   | Monorepo, tooling, Docker, PostgreSQL                                                                               | ✅ Concluída |
| 2   | Base do backend: Drizzle, migrations, `/ready`, rate limiting, OpenAPI                                              | ✅ Concluída |
| 3   | Multi-tenancy: modelo, `TenantContext`, RLS, testes de isolamento, tabelas de plano                                 | ✅ Concluída |
| 4   | Autenticação administrativa, RBAC e `audit_logs` — _auditoria subiu da 15_                                          | ⬜ Próxima   |
| 5   | Tenant e configurações: estabelecimento, horários, entrega, pedido mínimo, pagamentos — _absorveu a antiga fase 13_ | ✅ Concluída |
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

## Fase 5 — concluída

### Microtasks

| #   | Tarefa                                                                                                         | Status |
| --- | -------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Schema: `tenant_settings`, `business_hours`, `delivery_settings`, `delivery_regions`, `tenant_payment_methods` | ✅     |
| 2   | Catálogo global `payment_methods`, no padrão de `roles`/`user_roles`                                           | ✅     |
| 3   | Migrations, incluindo o `FORCE` escrito à mão                                                                  | ✅     |
| 4   | Domínio de horários: fuso do tenant e travessia de meia-noite                                                  | ✅     |
| 5   | Domínio de entrega: taxa fixa, por região, retirada e pedido mínimo                                            | ✅     |
| 6   | Repositório e serviço, com auditoria na mesma transação                                                        | ✅     |
| 7   | Nove rotas administrativas com `requireAuth` e OpenAPI                                                         | ✅     |
| 8   | Seed com horários, regiões e pagamentos de demonstração                                                        | ✅     |
| 9   | Testes: 22 de horários, 12 de entrega, 26 de rota, 10 de isolamento                                            | ✅     |
| 10  | Documentação, verificação e commits                                                                            | ✅     |

### O bug que o teste pegou

O `globalSetup` dos testes criava a sua própria instância do Drizzle sem o `casing`, e o insert
saiu com `"sortOrder"` em vez de `sort_order`. O erro — `column "sortOrder" does not exist` —
parece problema de migration, não de configuração do cliente.

Virou `DRIZZLE_CONFIG`, um módulo sem dependência nenhuma que as quatro instâncias do projeto
compartilham. É o tipo de erro que se repete até a configuração ter um lugar só.

### Decisões desta fase

**Substituição em vez de CRUD** para horários e regiões: é assim que essas telas são editadas de
verdade — abre-se a grade, mexe-se em várias linhas, salva-se uma vez.

**`closesAt = opensAt` é proibido no banco.** Seria ambíguo entre "vinte e quatro horas" e
"intervalo vazio", e sem resolver isso a regra de travessia de meia-noite deixa de ser decidível.

**Região inativa é tratada como inexistente** no cálculo de taxa. Desativar precisa impedir
pedido novo, e não só sumir da lista.

**Configuração de entrega e regiões salvam juntas**, numa transação. Separadas, haveria um
instante com modo `BY_REGION` e nenhuma região — visível para quem consultasse o cardápio.

**O domínio não conhece banco nem framework.** `opening-hours.ts` recebe intervalos, fuso e
instante; por isso tem 22 testes que rodam em milissegundos.

### Verificação executada

| Verificação                                     | Resultado                            |
| ----------------------------------------------- | ------------------------------------ |
| `pnpm typecheck` / `lint` / `build`             | zero erro                            |
| `pnpm test`                                     | **161 testes** (157 API + 4 web)     |
| Guarda de RLS sobre as 5 tabelas novas          | todas com RLS habilitado e forçado   |
| Horário atravessando a meia-noite               | aberto às 01:00 do dia seguinte      |
| Mesmo instante em São Paulo e Manaus            | resultados diferentes, como deve ser |
| `GET /admin/status` com o seed                  | fechado, próxima abertura em 1 dia   |
| Pausa manual                                    | vence o horário cadastrado           |
| Horários sobrepostos / entrega sem região ativa | recusados com 400                    |

---

## Fase 6 — próxima

Escopo pretendido: `StorageService` com provider local, upload de imagens com validação de tipo
e tamanho, e a preparação para um provider S3 sem que o domínio conheça o sistema de arquivos.

---

## Fases anteriores

**Fase 4** entregou autenticação com argon2id e JWT, refresh rotativo com detecção de reuso,
RBAC por permissão e auditoria append-only. O bug daquela fase virou regra: nada que precise
persistir pode ser seguido de um `throw` dentro do `withTenant`, porque a exceção causa rollback.

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

| Decisão                                             | Resumo                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| Banco único, schema único, `tenant_id`              | Muitos tenants pequenos e homogêneos                               |
| RLS + camada tenant-scoped + teste-guarda           | Duas defesas independentes, mais um portão no CI                   |
| Duas roles de banco: migrator e app                 | O dono da tabela consegue desligar o RLS; a app não pode ser dona  |
| `TenantContext` sem construtor genérico             | Não há como criar contexto a partir de dado do cliente             |
| `tenants` sem RLS, com repositório estreito         | A resolução do slug antecede o contexto                            |
| Guarda exige declarar tabelas globais               | Pega a tabela que deveria ter `tenant_id` e não tem                |
| Super Admin em tabela própria                       | Com `tenant_id` nulo a policy nunca casaria — linha invisível      |
| Refresh token opaco, não JWT                        | Já consulta o banco para revogação; assinatura não compra nada     |
| `audit_logs` sem policy de update nem delete        | Append-only pela estrutura, não por convenção                      |
| Usuário recarregado a cada requisição               | Desativar alguém passa a valer na hora                             |
| `requireAuth()` devolve a cadeia pronta             | Ordem errada entre autenticar e autorizar falharia em silêncio     |
| argon2id com parâmetros explícitos                  | Um padrão invisível nunca é revisitado                             |
| Substituição em vez de CRUD em horários e regiões   | É como a grade semanal é editada de verdade                        |
| `closesAt = opensAt` proibido                       | Ambiguidade tornaria a travessia de meia-noite indecidível         |
| Região inativa conta como inexistente               | Desativar precisa impedir pedido, não só esconder                  |
| Domínio separado de banco e framework               | Casos de borda cobertos em milissegundos                           |
| `DRIZZLE_CONFIG` compartilhado                      | Instância sem `casing` falha de um jeito que parece outro problema |
| UUIDv7 gerado no banco (`uuidv7()` do PG 18)        | Vale para seed e INSERT manual, sem dependência                    |
| Testes contra PostgreSQL real                       | RLS não se prova com mock                                          |
| `/health` não consulta o banco                      | Senão uma oscilação do banco reinicia processos saudáveis          |
| TypeScript 6.0.3 em vez de 7.0.2                    | `typescript-eslint` não suporta TS 7                               |
| Dinheiro em centavos inteiros                       | Ponto flutuante quebra a checagem de pedido mínimo                 |
| Escopo `@repo/` nos pacotes internos                | Renomear o produto não toca em nenhum import                       |
| Compose cobre só o PostgreSQL                       | Containerizar o dev de um monorepo pnpm custa mais do que rende    |
| Dependências instaladas na fase em que forem usadas | `package.json` reflete o que o código importa                      |

---

## Pendências conhecidas

| Item                                                                          | Quando resolve                                |
| ----------------------------------------------------------------------------- | --------------------------------------------- |
| Rate limit conta em memória — vira limite por instância se houver mais de uma | Deploy                                        |
| Sem Dockerfile para API e web                                                 | Deploy                                        |
| Sem CI                                                                        | A definir                                     |
| Nenhuma rota HTTP expõe tenants ainda — a fase é de fundação                  | Fases 5 e 8                                   |
| `packages/shared` ainda não existe                                            | Quando houver schema Zod usado nos dois lados |
