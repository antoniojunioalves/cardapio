# Plano do projeto

**Atualizado em:** 2026-09-28
**Fase atual:** 7a — concluída, aguardando validação
**Próxima:** Fase 7b — opções, adicionais e combos

---

## Estado atual

**O estabelecimento já tem cardápio.** Categorias e produtos com imagem, preço em centavos,
disponibilidade e ordem, administrados por rotas com permissão e auditoria. Troca de preço e de
disponibilidade geram registros próprios, com o antes e o depois.

Nesta fase apareceu uma falha de isolamento que o RLS não cobria — a checagem de chave
estrangeira roda por fora dele — e ela foi corrigida no catálogo e em três tabelas antigas.

**Ainda não existe:** opções, adicionais, combos, cardápio público, carrinho, pedidos, e
nenhuma tela administrativa no frontend.

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

## Fase 7a — concluída

### Microtasks

| #   | Tarefa                                                                          | Status |
| --- | ------------------------------------------------------------------------------- | ------ |
| 1   | Comprovar que a checagem de FK roda por fora do RLS                             | ✅     |
| 2   | **Correção:** FKs compostas em `user_roles`, `refresh_tokens` e `audit_logs`    | ✅     |
| 3   | Teste-guarda de FK entre tabelas tenant-scoped — escrito antes da correção      | ✅     |
| 4   | Schema `categories` e `products`, com FK composta desde o início                | ✅     |
| 5   | `trocarImagem` extraído: uma implementação para logo, capa, categoria e produto | ✅     |
| 6   | Serviço com 404, 409 e auditoria específica de preço e disponibilidade          | ✅     |
| 7   | 15 rotas administrativas, incluindo imagem e reordenação                        | ✅     |
| 8   | Seed com cardápio de demonstração, com um item esgotado                         | ✅     |
| 9   | Testes: 28 de rota, 14 de isolamento, 4 de referência entre tenants             | ✅     |
| 10  | Documentação, verificação, commits e clone limpo                                | ✅     |

### A descoberta da fase

**A checagem de chave estrangeira do PostgreSQL roda por fora do RLS.** O Tenant A não enxergava
a categoria do Tenant B, mas uma FK simples aceitava que ele criasse um produto apontando para
ela. O RLS protege o que se lê e o que se grava; não protege para onde uma referência aponta.

A correção é a FK composta, `(tenant_id, category_id) → categories(tenant_id, id)`. Ao procurar
o mesmo padrão no que já existia, o catálogo do PostgreSQL mostrou três FKs com a mesma falha,
das Fases 3 e 4. Não eram exploráveis — o id vinha sempre do servidor —, mas eram o formato exato
de um IDOR. Corrigidas em commit separado, `fix(db)`, para revisão à parte.

Dois detalhes vieram junto. O `drizzle-kit` gerou a migration com as FKs **antes** da restrição
única que elas referenciam, e ela teve de ser reordenada à mão. E a FK da auditoria precisou de
`ON DELETE SET NULL (actor_user_id)`, que o Drizzle não expressa: o `SET NULL` comum anularia
também o `tenant_id` e a remoção de um usuário falharia.

### Decisões desta fase

**Excluir categoria com produtos é recusado**, com a contagem na mensagem, em vez de levá-los
junto. A FK com `RESTRICT` é a segunda barreira.

**Reordenação exige a lista completa.** Uma parcial deixaria as ausentes intercaladas; e a mesma
regra recusa id de outro estabelecimento.

**Preço com casas decimais é recusado.** O campo é em centavos; aceitar `25.9` esconderia o erro
de quem achou que era em reais. Teto de R$ 100 mil contra um zero a mais.

**Nome de categoria único sem diferenciar maiúsculas**, por índice em `lower(name)`.

**Id de outro estabelecimento responde 404**, nunca 403 — o 403 confirmaria que o id existe.

### Verificação executada

| Verificação                           | Resultado                                 |
| ------------------------------------- | ----------------------------------------- |
| `pnpm typecheck` / `lint` / `build`   | zero erro                                 |
| `pnpm test`                           | **247 testes** (243 API + 4 web)          |
| Guarda de FK antes da correção        | acusou exatamente as três FKs             |
| INSERT direto de A com categoria de B | recusado pela FK composta                 |
| Imagem para produto inexistente       | 404, e nenhum arquivo sobra no disco      |
| Troca de preço ao vivo                | `{"de": 2590, "para": 2790}` na auditoria |
| Excluir categoria com 3 produtos      | 409, "A categoria tem 3 produto(s)"       |

---

## Fase 7b — próxima

Grupos de opções com mínimo, máximo e obrigatoriedade; opções com alteração de preço;
adicionais; remoções ("sem cebola"); e combos compostos de produtos. Todos com FK composta desde o
início, e com o cuidado de que um combo não aponte para produto de outro estabelecimento.

---

## Fases anteriores

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
