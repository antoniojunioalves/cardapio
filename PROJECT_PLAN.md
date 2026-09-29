# Plano do projeto

**Atualizado em:** 2026-09-28
**Fase atual:** 7b — concluída, aguardando validação
**Próxima:** Fase 8 — cardápio público

---

## Estado atual

**O catálogo está completo na API.** Categorias, produtos com imagem, grupos de opção — tamanho,
adicionais, remoções — reutilizáveis entre produtos, e combos com cálculo de quanto os itens
custariam separados. Tudo com permissão, auditoria e isolamento comprovado, inclusive nas
referências entre tabelas.

**Ainda não existe:** cardápio público, carrinho, pedidos, e nenhuma tela no frontend. A Fase 8 é
a primeira em que o cliente final verá alguma coisa.

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

## Fase 7b — concluída

### Microtasks

| #   | Tarefa                                                                              | Status |
| --- | ----------------------------------------------------------------------------------- | ------ |
| 1   | Tipo de produto `SIMPLE`/`COMBO`, imutável                                          | ✅     |
| 2   | `option_groups`, `options`, `product_option_groups`, `combo_items`, com FK composta | ✅     |
| 3   | Regra pura de coerência do grupo: mínimo não pode exceder as opções                 | ✅     |
| 4   | Edição de grupo com opções: altera, cria e remove numa transação                    | ✅     |
| 5   | Ligação ordenada de grupos a produtos                                               | ✅     |
| 6   | Composição de combo, com preço avulso e disponibilidade dos componentes             | ✅     |
| 7   | Exclusões recusadas: grupo em uso e produto que é componente                        | ✅     |
| 8   | Nove rotas sob a tag Personalização                                                 | ✅     |
| 9   | Seed com adicionais, remoções, tamanho, borda e um combo                            | ✅     |
| 10  | Testes: 7 de domínio, 21 de rota, 11 de isolamento                                  | ✅     |

### Duas divergências do escopo original, deliberadas

**Adicionais e remoções são grupos de opção**, e não uma tabela `product_addons`. A estrutura é a
mesma — lista de escolhas com preço e limite de seleções —, e uma tabela à parte daria ao cálculo
do pedido duas regras em vez de uma.

**Combo é um produto do tipo `COMBO`**, e não uma tabela `combos`. No cardápio ele se comporta
como produto, e uma tabela à parte obrigaria carrinho e pedido a tratar dois tipos de item.

### Decisões desta fase

**Grupos reutilizáveis**: "Adicionais" é ligado a vários produtos, e trocar o preço do bacon é uma
edição só.

**Acréscimo nunca negativo**: o preço base é o do menor tamanho. Elimina total negativo.

**"Obrigatório" derivado** de `minSelections >= 1`, nunca gravado.

**Grupo que exige mais escolhas do que tem opções é recusado**: tornaria o produto impossível de
pedir.

### Verificação executada

| Verificação                                     | Resultado                           |
| ----------------------------------------------- | ----------------------------------- |
| `pnpm typecheck` / `lint` / `build`             | zero erro                           |
| `pnpm test`                                     | **284 testes** (280 API + 4 web)    |
| Guardas de RLS e de FK sobre as 4 tabelas novas | passam                              |
| Combo do seed pela API                          | avulso R$ 46,90, combo R$ 39,90     |
| Excluir o X-Salada, componente do combo         | 409, "faz parte de: Combo X-Salada" |
| PATCH com `type`                                | 400 por campo não reconhecido       |

---

## Fase 8 — próxima

O cardápio público em `/{tenantSlug}`: a primeira tela para o cliente final. Uma rota pública da
API que resolve o slug e devolve estabelecimento, status de aberto/fechado, taxa, pedido mínimo e
o cardápio com grupos e combos; e, no frontend, a página mobile-first com cabeçalho, busca,
categorias horizontais e cartões de produto.

---

## Fases anteriores

**Fase 7a** entregou categorias e produtos. Descobriu-se ali que a checagem de chave
estrangeira do PostgreSQL roda por fora do RLS; desde então toda FK entre tabelas tenant-scoped é
composta, e o teste-guarda recusa as que não forem. Três FKs antigas foram corrigidas.

**Fase 6** entregou o storage de imagens atrás de uma interface trocável, com o tipo detectado
pelos bytes e SVG recusado. A regra `storage/` no `.gitignore` ignorava o próprio código-fonte,
e foi percebida só porque o diretório não apareceu no `git status`; desde então cada fase fecha
com um clone limpo.

**Fase 5** entregou as configurações do estabelecimento: horários com travessia de meia-noite,
entrega fixa ou por região, pedido mínimo e formas de pagamento. O bug daquela fase gerou o
`DRIZZLE_CONFIG`: uma instância do Drizzle sem `casing` emite `"sortOrder"` em vez de
`sort_order`, com um erro que parece de migration.

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
| Banco guarda chave de storage, não URL              | Trocar de provider não exige reescrever linhas                     |
| Tipo de imagem detectado pelos bytes                | Extensão e `Content-Type` são escolhidos por quem envia            |
| Arquivo antigo apagado só depois do commit          | Rollback não deixa referência para arquivo inexistente             |
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
