# Plano do projeto

**Atualizado em:** 2026-09-29
**Fase atual:** 12 — concluída, aguardando validação
**Próxima:** Fase 13 — WebSocket e pedidos em tempo real

---

## Estado atual

**O cliente final já vê o cardápio.** Em `/{tenantSlug}` — `/lanchonete-do-ze` — a página
mobile-first mostra o estabelecimento, se está aberto e quando abre, as condições de entrega,
busca, categorias e produtos com esgotados e combos. Os dados vêm de
`GET /api/v1/public/{tenantSlug}/menu`.

**O cliente já monta o pedido.** Tocar num produto abre a janela dele: opções respeitando mínimo e
máximo, quantidade e observação. O carrinho fica guardado no navegador, um por estabelecimento,
com o indicador embaixo da tela e a prévia do subtotal e do pedido mínimo.

**O cliente já preenche o checkout.** Em `/{tenantSlug}/checkout`: telefone — que, se já
conhecido, traz o primeiro nome e os endereços **mascarados** —, nome, entrega ou retirada,
endereço, região, forma de pagamento, troco e observações, com a prévia da taxa e do total. O
formulário valida com os mesmos schemas da API (`packages/shared`).

**O pedido é enviado e recalculado no servidor.** `POST /api/v1/public/{tenantSlug}/orders`
recebe só ids, quantidades e escolhas; preço, taxa, total, disponibilidade e horário são
calculados de novo sobre a mesma montagem do cardápio público. O pedido guarda uma cópia de tudo,
ganha número sequencial por estabelecimento, e o cliente vê a confirmação. O status avança pelas
rotas do painel (`/api/v1/admin/orders`), com auditoria.

**O pedido chega ao WhatsApp do estabelecimento.** A confirmação oferece "Enviar pedido pelo
WhatsApp", com a mensagem pronta — número, itens, opções, valores, entrega, pagamento e cliente —,
montada no servidor. Endereço escolhido da lista sai mascarado; digitado na hora, completo.

**Ainda não existe:** os pedidos chegando em tempo real (Fase 13) e qualquer tela administrativa —
o lojista ainda usa a API para ver o endereço completo de um endereço salvo.

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
| 10  | Customer e checkout                                                                                                 | ✅ Concluída |
| 11  | Pedidos: recálculo no servidor, snapshot, status                                                                    | ✅ Concluída |
| 12  | WhatsApp                                                                                                            | ✅ Concluída |
| 13  | WebSocket e pedidos em tempo real                                                                                   | ⬜           |
| 14  | Limites por plano                                                                                                   | ⬜           |
| 15  | Testes de segurança, hardening e refinamento                                                                        | ⬜           |

Três movimentos em relação à ordem sugerida originalmente, cada um porque algo posterior
dependia do item movido: configurações do estabelecimento para a Fase 5 (o cardápio público
precisa exibir aberto/fechado, taxa e pedido mínimo), storage para a Fase 6 (produto nasce com
imagem) e auditoria para a Fase 4 (o requisito é registrar "desde o início").

---

## Fase 12 — concluída

### Microtasks

| #   | Tarefa                                                                                  | Status |
| --- | --------------------------------------------------------------------------------------- | ------ |
| 1   | Mensagem montada no servidor, módulo puro (`orders/whatsapp.ts`), e o link `wa.me`      | ✅     |
| 2   | Endereço salvo mascarado na mensagem; digitado, completo; nome como o cliente digitou   | ✅     |
| 3   | Mensagem guardada no pedido (`whatsapp_message`), para o reenvio devolver o mesmo texto | ✅     |
| 4   | Resposta do pedido com `whatsapp: { url, message }`; `url` nulo sem WhatsApp cadastrado | ✅     |
| 5   | Confirmação com "Enviar pedido pelo WhatsApp"; sem WhatsApp, o telefone de contato      | ✅     |
| 6   | Testes: 6 da mensagem, 2 novos e 3 ajustados nas rotas, 2 de tela                       | ✅     |

### Decisões desta fase

**Endereço salvo sai mascarado na mensagem; completo só depois do OTP** — decisão do Junio. A
mensagem sai do celular de quem fez o pedido: com o endereço completo, quem digitou o telefone de
outra pessoa o receberia no próprio WhatsApp. Endereço digitado na hora sai completo, porque foi
a pessoa quem o informou. O estabelecimento vê o endereço completo no pedido — por enquanto pela
API; a tela vem com a Fase 13. Registrado no ROADMAP, no item do OTP.

**O nome na mensagem é o digitado.** Quando o cliente usa o primeiro nome preenchido pela
identificação, o pedido grava o nome completo (Fase 11), mas a mensagem leva só o que foi
digitado — senão o sobrenome vazaria por aqui.

**A mensagem é montada no servidor e guardada no pedido.** Um formato só, calculado sobre o que
foi gravado. Guardar o texto faz o reenvio com a mesma chave devolver a mesma mensagem: ela
depende de coisas que o pedido não guarda, como o endereço ter vindo da lista ou digitado.

**Um botão, não a abertura automática.** O navegador bloqueia janelas abertas depois de esperar a
rede; o toque precisa ser da pessoa. O link abre em outra aba com `noopener`.

**O pedido já está registrado antes do WhatsApp.** A mensagem avisa o estabelecimento; não é ela
que cria o pedido. Sem WhatsApp cadastrado, a confirmação diz isso e mostra o telefone de contato.

### Verificação executada

| Verificação                         | Resultado                                            |
| ----------------------------------- | ---------------------------------------------------- |
| `pnpm typecheck` / `lint` / `build` | zero erro                                            |
| `pnpm test`                         | **520 testes** (379 API + 128 web + 13 shared)       |
| Teste sensível à regra              | endereço salvo saindo completo derruba o teste certo |
| Mensagem no WhatsApp de verdade     | a fazer na validação                                 |

---

## Fase 13 — próxima

WebSocket e pedidos em tempo real: o pedido novo aparece no painel do estabelecimento sem
recarregar a página. É onde nasce a primeira tela administrativa — e onde o CORS precisa passar a
liberar `PATCH`, `PUT` e `DELETE`.

---

## Fases anteriores

**Fase 11** entregou o pedido recalculado no servidor, sobre a mesma montagem do cardápio que o
cliente recebe: recusa com todos os problemas, 409 quando o total difere do visto, envio
idempotente, número sequencial por estabelecimento, cópia de tudo no pedido e status que só
avança, com auditoria. Na validação, o nome passou a vir preenchido com o primeiro nome, e o
pedido o completa com o nome guardado.

**Fase 10** entregou o cliente final e o checkout: identificação por telefone que devolve só o
primeiro nome e endereços mascarados, com limite próprio e auditoria; CEP como primeiro campo do
endereço; e o `packages/shared`, com os schemas que o formulário e a API aplicam igual. Na
validação, um grupo de rádios sem nada marcado chegava como `null` e escondia os erros do
endereço.

**Fase 9** entregou a escolha de opções e o carrinho no navegador, um por estabelecimento. O item
guarda escolhas e nunca preço: o carrinho é conferido contra o cardápio atual a cada exibição, e o
que vem do `localStorage` passa por uma limpeza antes de ser usado.

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

| Decisão                                             | Resumo                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| Banco único, schema único, `tenant_id`              | Muitos tenants pequenos e homogêneos                                 |
| RLS + camada tenant-scoped + teste-guarda           | Duas defesas independentes, mais um portão no CI                     |
| Duas roles de banco: migrator e app                 | O dono da tabela consegue desligar o RLS; a app não pode ser dona    |
| `TenantContext` sem construtor genérico             | Não há como criar contexto a partir de dado do cliente               |
| `tenants` sem RLS, com repositório estreito         | A resolução do slug antecede o contexto                              |
| Guarda exige declarar tabelas globais               | Pega a tabela que deveria ter `tenant_id` e não tem                  |
| Super Admin em tabela própria                       | Com `tenant_id` nulo a policy nunca casaria — linha invisível        |
| Refresh token opaco, não JWT                        | Já consulta o banco para revogação; assinatura não compra nada       |
| `audit_logs` sem policy de update nem delete        | Append-only pela estrutura, não por convenção                        |
| Usuário recarregado a cada requisição               | Desativar alguém passa a valer na hora                               |
| `requireAuth()` devolve a cadeia pronta             | Ordem errada entre autenticar e autorizar falharia em silêncio       |
| argon2id com parâmetros explícitos                  | Um padrão invisível nunca é revisitado                               |
| Substituição em vez de CRUD em horários e regiões   | É como a grade semanal é editada de verdade                          |
| `closesAt = opensAt` proibido                       | Ambiguidade tornaria a travessia de meia-noite indecidível           |
| Região inativa conta como inexistente               | Desativar precisa impedir pedido, não só esconder                    |
| Domínio separado de banco e framework               | Casos de borda cobertos em milissegundos                             |
| `DRIZZLE_CONFIG` compartilhado                      | Instância sem `casing` falha de um jeito que parece outro problema   |
| Banco guarda chave de storage, não URL              | Trocar de provider não exige reescrever linhas                       |
| Tipo de imagem detectado pelos bytes                | Extensão e `Content-Type` são escolhidos por quem envia              |
| Arquivo antigo apagado só depois do commit          | Rollback não deixa referência para arquivo inexistente               |
| UUIDv7 gerado no banco (`uuidv7()` do PG 18)        | Vale para seed e INSERT manual, sem dependência                      |
| Testes contra PostgreSQL real                       | RLS não se prova com mock                                            |
| `/health` não consulta o banco                      | Senão uma oscilação do banco reinicia processos saudáveis            |
| TypeScript 6.0.3 em vez de 7.0.2                    | `typescript-eslint` não suporta TS 7                                 |
| Dinheiro em centavos inteiros                       | Ponto flutuante quebra a checagem de pedido mínimo                   |
| Escopo `@repo/` nos pacotes internos                | Renomear o produto não toca em nenhum import                         |
| Compose cobre só o PostgreSQL                       | Containerizar o dev de um monorepo pnpm custa mais do que rende      |
| Dependências instaladas na fase em que forem usadas | `package.json` reflete o que o código importa                        |
| Identificação devolve endereço mascarado            | Telefone não prova identidade; o pedido referencia o endereço por id |
| Cliente por estabelecimento                         | O dado serve a quem o coletou                                        |

---

## Pendências conhecidas

| Item                                                                                                          | Quando resolve                  |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Rate limit conta em memória — vira limite por instância se houver mais de uma                                 | Deploy                          |
| Sem Dockerfile para API e web                                                                                 | Deploy                          |
| Sem CI                                                                                                        | A definir                       |
| Nenhuma rota HTTP expõe tenants ainda — a fase é de fundação                                                  | Fases 5 e 8                     |
| Contrato do cardápio público copiado no web, fora do `packages/shared`                                        | Quando o contrato mudar de novo |
| Checkout não lembra os dados no aparelho ao voltar ao cardápio                                                | ROADMAP                         |
| CORS libera só GET, HEAD e POST (padrão do `@fastify/cors` 11) — o painel vai precisar de PATCH, PUT e DELETE | Quando o painel ganhar tela     |
