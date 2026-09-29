# Plano do projeto

**Atualizado em:** 2026-09-28
**Fase atual:** 8a — concluída, aguardando validação
**Próxima:** Fase 8b — página do cardápio público

---

## Estado atual

**O cardápio público existe na API.** `GET /api/v1/public/{tenantSlug}/menu` devolve, sem login, o
estabelecimento, se está aberto agora, as condições de entrega, as formas de pagamento e o
cardápio com grupos de opção e combos — com a disponibilidade já calculada.

**Ainda não existe:** nenhuma tela para o cliente final, carrinho e pedidos. A Fase 8b é a
primeira em que o cliente final verá alguma coisa.

---

## Fases

| #   | Fase                                                                                                                | Status       |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------ |
| 0   | Arquitetura e documentação                                                                                          | ✅ Concluída |
| 1   | Monorepo, tooling, Docker, PostgreSQL                                                                               | ✅ Concluída |
| 2   | Base do backend: Drizzle, migrations, `/ready`, rate limiting, OpenAPI                                              | ✅ Concluída |
| 3   | Multi-tenancy: modelo, `TenantContext`, RLS, testes de isolamento, tabelas de plano                                 | ✅ Concluída |
| 4   | Autenticação administrativa, RBAC e `audit_logs` — _auditoria subiu da 15_                                          | ✅ Concluída |
| 5   | Tenant e configurações: estabelecimento, horários, entrega, pedido mínimo, pagamentos — _absorveu a antiga fase 13_ | ✅ Concluída |
| 6   | Storage de imagens: `StorageService` + provider local — _subiu da 14_                                               | ✅ Concluída |
| 7a  | Catálogo: categorias e produtos                                                                                     | ✅ Concluída |
| 7b  | Catálogo: grupos de opção, adicionais, remoções e combos                                                            | ✅ Concluída |
| 8a  | Cardápio público — API                                                                                              | ✅ Concluída |
| 8b  | Cardápio público — página no frontend                                                                               | ⬜ Próxima   |
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

## Fase 8a — concluída

A Fase 8 foi dividida em duas a pedido do Junio: **8a**, a API pública, e **8b**, a página.

### Microtasks

| #   | Tarefa                                                                                  | Status |
| --- | --------------------------------------------------------------------------------------- | ------ |
| 1   | Regra pura de disponibilidade: produto, componente do combo, grupo obrigatório esgotado | ✅     |
| 2   | Leitura do cardápio em cinco consultas fixas, sem uma por produto                       | ✅     |
| 3   | Resolução pelo slug: inexistente, suspenso e formato impossível respondem o mesmo 404   | ✅     |
| 4   | Resposta montada campo a campo, com schema de resposta como segunda barreira            | ✅     |
| 5   | `GET /api/v1/public/{tenantSlug}/menu`, sem login, com `Cache-Control: no-cache`        | ✅     |
| 6   | Testes: 10 da regra de disponibilidade, 24 da rota                                      | ✅     |
| 7   | ROADMAP: preço de combo parametrizável (fixo, percentual ou valor) por estabelecimento  | ✅     |

### Duas divergências do escopo original, deliberadas

**Adicionais e remoções são grupos de opção**, e não uma tabela `product_addons`. A estrutura é a
mesma — lista de escolhas com preço e limite de seleções —, e uma tabela à parte daria ao cálculo
do pedido duas regras em vez de uma.

**Uma rota só**, com cabeçalho, status, entrega, pagamento e cardápio. É o que a página precisa
para desenhar a primeira tela; dividir em várias chamadas atrasaria a primeira pintura no celular.

**Suspenso responde igual a inexistente.** "Suspenso" revelaria a situação comercial de um cliente
da plataforma a qualquer um que digitasse o endereço.

**Disponibilidade calculada no servidor, em três níveis:** o produto esgotado; o combo com um
componente esgotado; e o produto cujo grupo obrigatório não tem mais opções suficientes — "todos os
tamanhos acabaram". Adicional opcional esgotado não tira o lanche do cardápio. Produto
indisponível **aparece marcado**, em vez de sumir, para o cliente não achar que o cardápio mudou.

**Categoria inativa some com os produtos; categoria ativa sem produto também some.**

**WhatsApp e telefone de contato são públicos**, porque o pedido será enviado para esse número. O
e-mail de contato e a pausa manual (`isAcceptingOrders`) não saem — a pausa aparece como status
`PAUSADO`.

**Sem cache.** Aberto/fechado e esgotado mudam de um minuto para o outro; guardar a resposta
mostraria a lanchonete aberta depois de fechar. Cache de borda com invalidação está no ROADMAP.

### Verificação executada

| Verificação                         | Resultado                                              |
| ----------------------------------- | ------------------------------------------------------ |
| `pnpm typecheck` / `lint` / `build` | zero erro                                              |
| `pnpm test`                         | **318 testes** (314 API + 4 web)                       |
| Cardápio do seed pela rota real     | 4 categorias, combo com avulso R$ 46,90, suco esgotado |
| Slug inexistente                    | 404                                                    |

---

## Fase 8b — próxima

A página do cardápio em `/{tenantSlug}`, mobile-first: cabeçalho com logo, capa e status
aberto/fechado, taxa e pedido mínimo, busca, categorias horizontais e cartões de produto com
disponibilidade. Primeira fase com roteamento no frontend e com o tema do estabelecimento aplicado.
Seleção de opções e carrinho ficam para a Fase 9.

---

## Fases anteriores

**Fase 7b** entregou grupos de opção reutilizáveis — tamanho, adicionais e remoções num modelo
só — e combos como produtos do tipo `COMBO`, divergindo de propósito do escopo original. Grupo
que exigiria mais escolhas do que tem opções é recusado, porque tornaria o produto impossível de
pedir.

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
