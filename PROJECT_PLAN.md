# Plano do projeto

**Atualizado em:** 2026-09-29
**Fase atual:** 10 — concluída, aguardando validação
**Próxima:** Fase 11 — pedidos

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

**Ainda não existe:** o envio do pedido — o botão confere tudo e para aí, até a Fase 11 —; e
nenhuma tela administrativa — o lojista ainda configura tudo pela API.

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

## Fase 10 — concluída

### Microtasks

| #   | Tarefa                                                                                             | Status |
| --- | -------------------------------------------------------------------------------------------------- | ------ |
| 1   | `packages/shared`: telefone brasileiro, schemas de endereço e da identificação                     | ✅     |
| 2   | Tabelas `customers` e `customer_addresses`: RLS forçado, FK composta, telefone normalizado         | ✅     |
| 3   | Resolução pública do slug extraída para `tenant/public.ts`, usada pelo cardápio e pelo cliente     | ✅     |
| 4   | `POST /public/{slug}/customers/identify`: primeiro nome e endereços mascarados, auditado           | ✅     |
| 5   | Limite de 10 identificações por minuto por IP                                                      | ✅     |
| 6   | Seed: a mesma cliente em dois estabelecimentos, com dados diferentes                               | ✅     |
| 7   | React Hook Form + Zod; `TextField` genérico com erro acessível                                     | ✅     |
| 8   | Página `/{slug}/checkout`: dados, modalidade, endereço salvo ou novo, região, pagamento, troco     | ✅     |
| 9   | Prévia de taxa e total; impedimentos: fechado, mínimo, itens com problema; "Continuar" no carrinho | ✅     |
| 10  | Testes: 13 do shared, 18 da API, 16 de regra e 18 de tela no web                                   | ✅     |
| 11  | CEP obrigatório e primeiro campo do endereço, sem consulta aos Correios ainda                      | ✅     |

### Decisões desta fase

**A identificação nunca devolve o endereço completo.** Devolve o primeiro nome e, de cada
endereço, rua, bairro e o número mascarado — `Rua dos Ipês, 4•• — Jardim Paulista`. Complemento,
referência, sobrenome e o próprio telefone não saem. O cliente escolhe o endereço pelo id, e a
Fase 11 completa o pedido no servidor. É o passo 1 da quitação da dívida de SECURITY.md, feito
já agora; a rua e o bairro ainda saem, e só o OTP resolve de vez.

**A identificação é auditada quando encontra alguém**, com o IP. Telefone desconhecido não é
registrado: guardaria o número de quem nunca foi cliente.

**Limite próprio: 10 identificações por minuto por IP**, contra varredura de endereços. Um cliente
de verdade faz uma.

**POST, não GET com o telefone na URL**: URL vai para log de acesso, histórico e `Referer`. E a
resposta sai com `Cache-Control: no-store`.

**Cliente é por estabelecimento.** O mesmo telefone na lanchonete e na pizzaria são dois
clientes, sem ligação — o dado serve a quem o coletou. O seed demonstra isso.

**Sem conta de cliente com senha no MVP.** SECURITY.md previa conta opcional com senha; o
MVP.md não. Fica no ROADMAP — o telefone cobre o "já pedi aqui antes".

**O cliente nasce no primeiro pedido (Fase 11).** Até lá, só os clientes do seed são encontrados.

**O endereço tem CEP, obrigatório e primeiro campo** — pedido na validação. Guardado só com os
8 dígitos, com máscara `00000-000` no formulário. Ainda não consulta os Correios: o campo fica
pronto para a busca do endereço pelo CEP, registrada no ROADMAP. A coluna é anulável só porque
endereços gravados antes dela não têm CEP; todo endereço novo passa pelo schema, que o exige, e o
seed completa os de demonstração. A identificação por telefone não devolve o CEP.

**O endereço não guarda a região.** As regiões são salvas por substituição e mudam de id; a região
é escolhida a cada pedido.

**Criado o `packages/shared`**, como a ARCHITECTURE previa para quando houvesse schema usado
dos dois lados: o telefone, o endereço e o contrato da identificação. O contrato do cardápio
continua copiado no web — migrá-lo é mudança à parte.

**Todas as regras do formulário rodam num passo só.** No Zod 4 o `superRefine` não roda quando
um campo da base já falhou: a pessoa veria o erro do telefone e só depois os demais. A base aceita
tudo como texto, e um teste exige os quatro erros de um formulário vazio de uma vez.

**Grupo de rádios sem nada marcado chega como `null`**, não como vazio: o `onBlur` do React Hook
Form relê o valor do DOM, e basta o foco passar pelo grupo. Na validação isso mostrou o erro cru
do Zod no pagamento e, pior, fez a base falhar e esconder as regras do endereço até o pagamento
ser escolhido. A base do schema passou a ler `null` como vazio, e dois testes reproduzem o caso.

**O endereço mais recente vem marcado**, e trocar o telefone some com os endereços do número
anterior — a resposta vale só para o número que está no campo.

**O botão "Fazer pedido" confere e para.** Mostra "Pedido conferido"; o envio é a Fase 11, e o
formato que ela vai enviar (`DadosDoCheckout`) já sai pronto do formulário.

**"Continuar" no carrinho fica desabilitado** com item indisponível ou abaixo do mínimo — isso
se resolve no carrinho. Estabelecimento fechado deixa chegar ao checkout, que avisa e não envia.

### Verificação executada

| Verificação                                | Resultado                                                         |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `pnpm typecheck` / `lint` / `build`        | zero erro                                                         |
| `pnpm test`                                | **461 testes** (332 API + 116 web + 13 shared)                    |
| Testes sensíveis à regra                   | sem máscara, sem limite e sem a trava do telefone: cada um cai    |
| API rodando: preflight, identificação, 400 | CORS libera o POST; endereços mascarados; cada tenant a sua Maria |
| Vite em dev resolve `@repo/shared`         | sim, pelo `dist` do pacote                                        |
| Conferência visual no navegador            | a fazer na validação                                              |

---

## Fase 11 — próxima

O pedido: envio do checkout, validação e **recálculo completo no servidor** (preços, opções,
disponibilidade, taxa, mínimo, horário), snapshot dos itens, criação ou atualização do cliente e
do endereço, número sequencial por estabelecimento e status. Limpa o carrinho ao concluir.

---

## Fases anteriores

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
