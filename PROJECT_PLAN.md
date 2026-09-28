# Plano do projeto

**Atualizado em:** 2026-09-28
**Fase atual:** 6 de 15 — concluída, aguardando validação
**Próxima:** Fase 7 — catálogo

---

## Estado atual

**Já dá para enviar o logo e a capa do estabelecimento.** O arquivo é validado pelo conteúdo — um
HTML ou SVG disfarçado de `.png` é recusado —, gravado num storage atrás de uma interface
trocável, e servido com os cabeçalhos certos para o frontend usar de outra origem.

Sob isso: configurações do estabelecimento com horários e entrega, autenticação com RBAC, e o
isolamento entre estabelecimentos comprovado em todas as 10 tabelas tenant-scoped.

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

## Fase 6 — concluída

### Microtasks

| #   | Tarefa                                                                  | Status |
| --- | ----------------------------------------------------------------------- | ------ |
| 1   | Interface `StorageService` e `LocalStorageProvider`                     | ✅     |
| 2   | Detecção do tipo de imagem pelos bytes, recusando SVG                   | ✅     |
| 3   | Chaves montadas pelo servidor; formato fixo e conferência contra a raiz | ✅     |
| 4   | Colunas `logo_key`/`cover_key` no lugar de `logo_url`/`cover_url`       | ✅     |
| 5   | Upload com limite aplicado durante o recebimento                        | ✅     |
| 6   | Troca e remoção de logo e capa, com auditoria                           | ✅     |
| 7   | Entrega em `/uploads/` com CORP `cross-origin` e cache imutável         | ✅     |
| 8   | Testes: 19 de storage, 20 de rota                                       | ✅     |
| 9   | Documentação, verificação e commits                                     | ✅     |

### Decisões desta fase

**O banco guarda a chave, não a URL.** A URL é calculada na leitura; gravá-la congelaria o
provider e o domínio de hoje em todas as linhas.

**O tipo vem dos bytes.** Extensão e `Content-Type` são escolhidos por quem envia.

**Na troca de imagem, o arquivo antigo só é apagado depois do commit.** Antes, um rollback
deixaria o banco apontando para um arquivo inexistente.

**`Cross-Origin-Resource-Policy: cross-origin` só em `/uploads/`.** O resto da API continua
`same-origin`. Sem essa exceção, o `<img>` do frontend quebraria em silêncio.

**Troca de coluna em dois passos.** Adicionar e remover na mesma geração faz o `drizzle-kit`
perguntar interativamente se é renomeação, o que trava num terminal sem interação. As colunas
antigas nunca tinham sido preenchidas, então removê-las não perdeu dado.

**Upload de imagem de produto fica para a Fase 7**, junto com o produto. Um endpoint genérico de
upload agora seria especulativo, e geraria arquivos sem dono.

### Verificação executada

| Verificação                           | Resultado                                           |
| ------------------------------------- | --------------------------------------------------- |
| `pnpm typecheck` / `lint` / `build`   | zero erro                                           |
| `pnpm test`                           | **200 testes** (196 API + 4 web)                    |
| PNG real enviado e baixado com `curl` | conteúdo idêntico, `image/png`, CORP e cache certos |
| SVG com extensão `.png`               | recusado com 415                                    |
| Arquivo acima de 5 MB                 | recusado com 413                                    |
| Troca de imagem                       | a anterior sai do disco                             |
| `/uploads/../../package.json`         | não entregue                                        |

---

## Fase 7 — próxima

Escopo pretendido: categorias, produtos com imagem, grupos de opções com mínimo e máximo,
adicionais com preço e combos — tudo tenant-scoped, com RLS, auditoria e testes de isolamento.
É a maior fase de domínio até aqui, e deve ser dividida em duas: categorias e produtos
primeiro; opções, adicionais e combos depois.

---

## Fases anteriores

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
