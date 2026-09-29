# Plano do projeto

**Atualizado em:** 2026-09-29
**Fase atual:** 9 — concluída, aguardando validação
**Próxima:** Fase 10 — customer e checkout

---

## Estado atual

**O cliente final já vê o cardápio.** Em `/{tenantSlug}` — `/lanchonete-do-ze` — a página
mobile-first mostra o estabelecimento, se está aberto e quando abre, as condições de entrega,
busca, categorias e produtos com esgotados e combos. Os dados vêm de
`GET /api/v1/public/{tenantSlug}/menu`.

**O cliente já monta o pedido.** Tocar num produto abre a janela dele: opções respeitando mínimo e
máximo, quantidade e observação. O carrinho fica guardado no navegador, um por estabelecimento,
com o indicador embaixo da tela e a prévia do subtotal e do pedido mínimo.

**Ainda não existe:** checkout e pedidos; e nenhuma tela administrativa — o lojista ainda
configura tudo pela API.

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
| 8b  | Cardápio público — página no frontend                                                                               | ✅ Concluída |
| 9   | Carrinho                                                                                                            | ✅ Concluída |
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

## Fase 9 — concluída

### Microtasks

| #   | Tarefa                                                                                 | Status |
| --- | -------------------------------------------------------------------------------------- | ------ |
| 1   | Zustand 5.0.15                                                                         | ✅     |
| 2   | Regra pura de escolha: rádio ou caixa, mínimo, máximo, esgotada, preço de exibição     | ✅     |
| 3   | Carrinho puro: item sem preço, conferência contra o cardápio atual, subtotal, mínimo   | ✅     |
| 4   | Store por estabelecimento com persistência e limpeza do que vem do `localStorage`      | ✅     |
| 5   | `Sheet` e `QuantityStepper` genéricos em `components/`                                 | ✅     |
| 6   | Janela do produto: grupos, "Falta escolher", quantidade, observação, botão com o preço | ✅     |
| 7   | Barra "Ver carrinho" e painel do carrinho: linhas, problemas, mínimo, fechado          | ✅     |
| 8   | Produto e carrinho abertos na URL (`?produto=`, `?carrinho`)                           | ✅     |
| 9   | Testes: 19 de regra, 9 da store, 14 do fluxo na tela                                   | ✅     |

### Decisões desta fase

**O item do carrinho não guarda preço.** Guarda produto, opções, quantidade e observação; o preço
é recalculado contra o cardápio atual — que recarrega a cada minuto — toda vez que o carrinho
aparece. Um preço guardado no navegador envelheceria quando o lojista o mudasse. O nome é
guardado só para avisar quando o produto sai do cardápio.

**O carrinho confere cada item contra o cardápio atual.** Produto que saiu, esgotou, opção que
esgotou ou grupo obrigatório criado depois aparecem marcados, com "Remover", e ficam fora do
subtotal. É a mesma pergunta que o servidor vai fazer na Fase 11; aqui é só para avisar antes.

**Um carrinho por estabelecimento**, com o slug como chave local. O estabelecimento do pedido
será decidido pelo servidor, nunca por essa chave.

**O que vem do `localStorage` é tratado como dado externo.** Item com formato errado é descartado
sozinho; quantidade volta para 1–50 e observação para 140 caracteres; JSON corrompido vira
carrinho vazio. O navegador é de quem o usa.

**Obrigatório de uma escolha é rádio; o resto é caixa de marcar.** Num grupo opcional de uma
escolha o cliente precisa poder desmarcar. Com o máximo atingido, as opções restantes ficam
desabilitadas; opção esgotada aparece, mas não se marca.

**Nada vem pré-selecionado**, nem o tamanho de acréscimo zero: escolher por omissão é o jeito
mais comum de o cliente receber o que não pediu.

**O mesmo produto com as mesmas escolhas e a mesma observação soma quantidade** em vez de virar
outra linha; a ordem em que as opções foram tocadas não importa.

**Produto e carrinho abertos moram na URL.** O "voltar" do celular fecha a janela em vez de sair
do cardápio, e o link de um produto pode ser compartilhado. Aberta pela página, a janela fecha
voltando no histórico; aberta por link, só perde o parâmetro.

**Estabelecimento fechado não impede montar o carrinho** — o painel avisa. Se o envio é recusado
fechado é decisão do checkout (Fase 10), com o servidor dando a palavra final.

**O painel não tem botão de finalizar**: ele entra com o checkout, na Fase 10. A taxa de entrega
também — depende do endereço.

**Id do item não usa `crypto.randomUUID`**, que só existe em contexto seguro: o Vite aberto pelo
IP da rede no celular, em http, não é.

### Verificação executada

| Verificação                         | Resultado                                                |
| ----------------------------------- | -------------------------------------------------------- |
| `pnpm typecheck` / `lint` / `build` | zero erro                                                |
| `pnpm test`                         | **394 testes** (314 API + 80 web)                        |
| Teste sensível à regra              | tirar a trava do grupo obrigatório derruba o teste certo |
| Classes novas no CSS do build       | todas geradas                                            |
| Conferência visual no navegador     | a fazer na validação                                     |

---

## Fase 10 — próxima

O checkout: telefone, nome, endereço (ou retirada), região de entrega, forma de pagamento e
observações, com a identificação do cliente por telefone e a dívida registrada em SECURITY.md.
É onde entra o botão de finalizar do carrinho.

---

## Fases anteriores

**Fase 8b** entregou a página do cardápio público em `/{tenantSlug}`, mobile-first, sem nenhuma
regra de negócio no navegador e recarregando a cada minuto. Na validação a faixa de categorias
não ficava presa ao rolar: estava num `<div>` da própria altura, e `sticky` só prende enquanto o
pai está na tela.

**Fase 8a** entregou a API do cardápio público: uma rota sem login que resolve o slug, com
estabelecimento suspenso respondendo o mesmo 404 de um inexistente, resposta montada campo a
campo e disponibilidade calculada no servidor — combo com componente esgotado e grupo
obrigatório sem opções ficam indisponíveis.

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
