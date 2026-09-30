# Plano do projeto

**Atualizado em:** 2026-09-29
**Fase atual:** 14 — concluída, aguardando validação (12, 13 e 14)
**Próxima:** Fase 15 — testes de segurança, hardening e refinamento

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

**O estabelecimento recebe os pedidos ao vivo.** Em `/{tenantSlug}/admin` o lojista entra, e em
`/{tenantSlug}/admin/pedidos` vê os pedidos chegarem sem recarregar — com endereço completo,
itens, pagamento e botões de status —, com alerta sonoro opcional e o número de pedidos novos no
título da aba.

**O plano é respeitado.** O painel avisa a partir de 80% dos pedidos do mês; atingido o limite,
há 10% de tolerância e, depois, o cardápio para de receber pedidos — dizendo só "não está
recebendo pedidos", sem citar o plano. Usuários do painel são criados, alterados, desativados e
reativados pela API, dentro do limite de usuários ativos do plano.

**Ainda não existe:** tela para cardápio, configurações e usuários — o lojista ainda configura
tudo pela API.

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
| 13  | WebSocket e pedidos em tempo real                                                                                   | ✅ Concluída |
| 14  | Limites por plano                                                                                                   | ✅ Concluída |
| 15  | Testes de segurança, hardening e refinamento                                                                        | ⬜           |

Três movimentos em relação à ordem sugerida originalmente, cada um porque algo posterior
dependia do item movido: configurações do estabelecimento para a Fase 5 (o cardápio público
precisa exibir aberto/fechado, taxa e pedido mínimo), storage para a Fase 6 (produto nasce com
imagem) e auditoria para a Fase 4 (o requisito é registrar "desde o início").

---

## Fase 14 — concluída

### Microtasks

| #   | Tarefa                                                                                             | Status |
| --- | -------------------------------------------------------------------------------------------------- | ------ |
| 1   | Regra dos limites, pura (`plans/limits.ts`): aviso a 80%, tolerância de 10%, início do mês no fuso | ✅     |
| 2   | Plano da assinatura ativa, pedidos do mês e usuários ativos (`plans/repository.ts`)                | ✅     |
| 3   | Cardápio com `NAO_RECEBENDO` passada a tolerância; o pedido é recusado pela mesma montagem         | ✅     |
| 4   | `GET /api/v1/admin/plan`: uso do plano para qualquer usuário logado                                | ✅     |
| 5   | Gestão de usuários: listar, criar, alterar, desativar (revogando sessões) e reativar               | ✅     |
| 6   | Limite de usuários ativos na criação e na reativação                                               | ✅     |
| 7   | Web: texto neutro no cardápio bloqueado e aviso do plano no painel                                 | ✅     |
| 8   | Testes: 10 de limites e bloqueio, 12 de usuários na API; 4 no web                                  | ✅     |

### Decisões desta fase

Três decisões do Junio, tomadas antes de implementar:

**Pedidos: tolerância e depois bloqueio.** O painel avisa a partir de 80% do limite; atingido o
limite, ainda há 10% de tolerância (110 no plano Gratuito de 100); passada ela, o cardápio passa
a mostrar "não está recebendo pedidos". Como o pedido é calculado sobre a montagem do cardápio,
ele é recusado pela mesma regra — e o cliente vê o aviso no cardápio antes de montar o carrinho.

**Cancelados contam.** Cancelar não devolve a vaga; senão bastaria cancelar pedidos para nunca
atingir o limite.

**Gestão de usuários entrou nesta fase**, porque o limite de usuários não tinha onde ser aplicado.

E as minhas:

**O cardápio não cita o plano.** O motivo público é `NAO_RECEBENDO`, com o texto "não está
recebendo pedidos pela internet agora" — pela mesma razão de o estabelecimento suspenso responder
como inexistente: a situação comercial dele não é assunto de quem abre o cardápio. O painel, que
o lojista lê, diz tudo.

**O mês é o do calendário, no fuso do estabelecimento**, calculado pelo `Intl` — um teste cobre
a virada de mês em São Paulo e o horário de verão de Nova York.

**Sem assinatura ativa, nada é limitado.** Ainda não há cobrança, e todo estabelecimento do seed
tem assinatura. Recurso desligado no plano vale como limite zero; ligado sem valor, ilimitado.

**Usuário: limite exato, sem tolerância.** É o dono quem cria, e ele pode desativar alguém para
abrir vaga. Só os ativos contam.

**Regras de usuário que permissão não cobre:** o papel `OWNER` não é dado nem tirado pela API;
ninguém muda o próprio papel nem se desativa; só o dono mexe na conta do dono. Desativar e
reativar exigem `users:delete`, que o ADMIN não tem — tirar e devolver acesso é decisão de dono.

**Desativar revoga as sessões.** O token de acesso para de valer na próxima requisição (o usuário
é recarregado a cada uma), e todos os refresh tokens são revogados — segunda barreira, porque a
renovação já recusa usuário inativo. Um teste confere as duas.

**Senha inicial definida pelo dono**, sem convite por e-mail — não há envio de e-mail ainda.

**Sem tela de usuários.** A decisão foi pelas rotas; a tela entra com as demais telas de gestão.

**A corrida no limite fica com a tolerância.** Dois pedidos simultâneos no último lugar podem
passar ambos; a tolerância absorve isso sem uma trava a mais.

### Verificação executada

| Verificação                         | Resultado                                                           |
| ----------------------------------- | ------------------------------------------------------------------- |
| `pnpm typecheck` / `lint` / `build` | zero erro                                                           |
| `pnpm test`                         | **571 testes** (410 API + 148 web + 13 shared)                      |
| Testes sensíveis à regra            | sem o limite de usuários, sem a revogação de sessões: cada um cai   |
| API rodando com o seed              | Gratuito: 1/100 pedidos, teto 110, 1/2 usuários; Premium: ilimitado |
| Conferência visual no navegador     | a fazer na validação                                                |

---

## Fase 15 — próxima

Testes de segurança, hardening e refinamento: revisão das fronteiras (RLS, rotas públicas,
WebSocket), cabeçalhos, limites, dívidas de SECURITY.md que cabem no MVP, e acabamento geral.

---

## Fases anteriores

**Fase 13** entregou os pedidos em tempo real: avisos por `LISTEN`/`NOTIFY` emitidos dentro da
transação (só chegam depois do commit), canal WebSocket por estabelecimento com o token na
primeira mensagem, e o primeiro painel — login, pedidos ao vivo, detalhe com endereço completo,
botões de status e alerta sonoro.

**Fase 12** entregou a mensagem do pedido para o WhatsApp do estabelecimento, montada no servidor
e guardada no pedido, com um botão na confirmação. Endereço escolhido da lista sai mascarado
(completo só depois do OTP, decisão do Junio); digitado, completo; o nome é o digitado.

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

| Item                                                                          | Quando resolve                  |
| ----------------------------------------------------------------------------- | ------------------------------- |
| Rate limit conta em memória — vira limite por instância se houver mais de uma | Deploy                          |
| Sem Dockerfile para API e web                                                 | Deploy                          |
| Sem CI                                                                        | A definir                       |
| Nenhuma rota HTTP expõe tenants ainda — a fase é de fundação                  | Fases 5 e 8                     |
| Contrato do cardápio público copiado no web, fora do `packages/shared`        | Quando o contrato mudar de novo |
| Checkout não lembra os dados no aparelho ao voltar ao cardápio                | ROADMAP                         |
