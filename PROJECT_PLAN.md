# Plano do projeto

**Atualizado em:** 2026-09-30
**Fase atual:** 16 — concluída, aguardando validação
**Próxima:** 17 — envio de e-mail e cadastro do estabelecimento pela API. As fases 17 a 28 fecham o
MVP (ver "O que falta para o MVP")

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

**As fronteiras foram revisadas (Fase 15).** O refresh token do painel saiu do `localStorage` e
foi para um cookie `httpOnly`; toda rota do painel recusa quem não está logado antes de ler o
corpo, e um teste-guarda confere isso pelo inventário de rotas; desativar ou mudar o papel de um
usuário fecha a conexão ao vivo dele na hora.

**Cada PR passa pelo CI (Fase 16).** No GitHub Actions: formatação, typecheck, lint, testes e
build, com o PostgreSQL criado do zero pelos mesmos scripts de init do desenvolvimento. O
`pnpm verify` roda os mesmos passos na máquina de quem desenvolve.

**Ainda não existe:** o cadastro do estabelecimento pela página inicial e as telas de
configuração, cardápio, usuários e clientes — hoje o estabelecimento nasce pelo seed e é
configurado pela API. As fases 17 a 28 fecham o MVP; ver "O que falta para o MVP".

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
| 15  | Testes de segurança, hardening e refinamento                                                                        | ✅ Concluída |
| 16  | CI no GitHub e ajustes nos docs                                                                                     | ✅ Concluída |
| 17  | Envio de e-mail e cadastro do estabelecimento pela API                                                              | ⬜ Próxima   |
| 18  | Telas do cadastro: landing page, cadastro, confirmação de e-mail, termos e privacidade                              | ⬜           |
| 19  | Comandos do Super Admin: listar, suspender, reativar, trocar o plano, reenviar a confirmação                        | ⬜           |
| 20  | Tratamento de imagens no upload: sem metadados, tamanho reduzido, WebP                                              | ⬜           |
| 21  | Estrutura do painel e configuração do estabelecimento                                                               | ⬜           |
| 22  | Horários, entrega e retirada, formas de pagamento                                                                   | ⬜           |
| 23  | Categorias e produtos                                                                                               | ⬜           |
| 24  | Grupos de opção, adicionais e combos                                                                                | ⬜           |
| 25  | Usuários e senha                                                                                                    | ⬜           |
| 26  | Clientes e histórico de pedidos                                                                                     | ⬜           |
| 27  | Acessibilidade e percurso completo, do zero                                                                         | ⬜           |
| 28  | Colocar no ar                                                                                                       | ⬜           |

Três movimentos em relação à ordem sugerida originalmente, cada um porque algo posterior
dependia do item movido: configurações do estabelecimento para a Fase 5 (o cardápio público
precisa exibir aberto/fechado, taxa e pedido mínimo), storage para a Fase 6 (produto nasce com
imagem) e auditoria para a Fase 4 (o requisito é registrar "desde o início").

---

## Fase 16 — concluída

### Microtasks

| #   | Tarefa                                                                                                  | Status |
| --- | ------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Workflow `.github/workflows/ci.yml`: formatação, typecheck, lint, testes e build em cada PR e na `main` | ✅     |
| 2   | PostgreSQL pelo mesmo `docker-compose.yml`, criado do zero pelos scripts de init a cada execução        | ✅     |
| 3   | Healthcheck do compose pela rede: o `--wait` só libera depois dos scripts de init                       | ✅     |
| 4   | Actions fixadas pelo commit, token só de leitura, checkout sem credencial gravada, nenhum segredo       | ✅     |
| 5   | `pnpm verify` igual ao CI: confere a formatação, e o `pnpm test` roda um pacote por vez                 | ✅     |
| 6   | Ajustes nos docs e no comentário do `vitest.config.ts`                                                  | ✅     |
| 7   | `turbo.json`: a tarefa `test` declara `TZ` e as URLs do banco de testes                                 | ✅     |

### Decisões e achados desta fase

**Achado: para um banco novo, o healthcheck do compose dava "pronto" cedo demais.** O
`pg_isready` testava pelo socket local, e na primeira inicialização o PostgreSQL sobe um servidor
temporário, só no socket, para rodar os scripts de `docker/postgres/init/`. No CI, o
`docker compose up --wait` poderia liberar os testes antes de as roles e o `cardapio_test`
existirem — uma falha intermitente, de tempo. No desenvolvimento nunca apareceu, porque o banco
já existe. O healthcheck passou a testar pela rede (`-h 127.0.0.1`), onde o servidor temporário
não escuta.

**Banco pelo compose, e não por _service container_.** O service container do GitHub sobe antes
do checkout e não enxerga os scripts de init; eles teriam de ser copiados para o workflow, numa
segunda versão que divergiria em silêncio. Pelo compose, o CI prova a cada execução que os
scripts criam do zero um banco onde a suíte inteira passa.

**Actions fixadas pelo commit, não pela tag** — uma tag pode ser movida por quem controla a
action. Versões atuais: checkout v7.0.1, setup-node v7.0.0 e pnpm/action-setup v6.1.0, com as
entradas usadas conferidas no `action.yml` de cada commit.

**Sem `.env` no CI.** O plano previa copiar o `.env.example`, mas nada precisa dele: a
`DATABASE_URL` e o `JWT_SECRET` dos testes vêm do `vitest.config.ts`, e o resto tem valor
padrão.

**`pnpm verify` igual ao CI.** Ele não conferia a formatação, e o `pnpm test` rodava os pacotes em
paralelo — o que já derrubou o processo no WSL (código 137). Agora os dois fazem o mesmo, e o
DEVELOPMENT.md explica as duas diferenças que sobram: o fuso (o GitHub roda em UTC) e o banco
criado do zero.

**Achado: o Turborepo barrava as variáveis dos testes, e o cache escondia isso.** No modo padrão
do Turbo 2, só chega ao script a variável declarada no `env` da tarefa — e só ela entra na chave
do cache. Comprovado num experimento isolado e depois no próprio repositório:
`TEST_DATABASE_URL`, que o `.env.example` documenta, nunca chegava ao Vitest pelo `pnpm test`
(só funcionava porque o padrão coincide); e `TZ=UTC pnpm test` logo depois de um `pnpm test`
reapresentava o resultado antigo sem rodar nada. A tarefa `test` passou a declarar `TZ`,
`TEST_DATABASE_URL` e `TEST_MIGRATION_DATABASE_URL`. O CI não era afetado — roda do zero, com os
valores padrão —, mas as instruções de reprodução local dependiam disso.

**Achado: o repositório é público** no GitHub, e o SECURITY.md dizia que o projeto era privado.
Não há segredo no repositório, e em repositório público o CI não gasta minutos. O workflow já foi
desenhado para isso: PR de fork roda com token só de leitura e sem segredos. Para relatar
vulnerabilidade, o canal previsto é o relato privado do GitHub, que hoje está desligado — ligar é
decisão do Junio.

### Verificação executada

| Verificação                                                                       | Resultado                                                                          |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `actionlint` no workflow                                                          | nenhum problema                                                                    |
| `pnpm format:check` / `typecheck` / `lint` / `build`                              | zero erro                                                                          |
| Testes do web e do shared em UTC, como no GitHub                                  | 149 + 13 passando                                                                  |
| Clone limpo, `--frozen-lockfile`, banco novo pelos scripts de init, testes em UTC | **588 testes** (426 API + 149 web + 13 shared)                                     |
| Os testes usaram o banco novo, e não o de desenvolvimento                         | as 20 migrations aplicadas nele — a `TEST_DATABASE_URL` chegou ao Vitest           |
| `docker compose up --wait` com banco novo                                         | liberou em 6 a 7 s, depois dos três scripts de init (logs do banco)                |
| Servidor temporário da imagem `postgres:18-alpine`                                | `listen_addresses=''`: não escuta na rede, e o healthcheck novo só vê o definitivo |
| Execução no GitHub                                                                | no primeiro PR — validação do Junio                                                |

---

## O que falta para o MVP

As fases 1 a 16 estão feitas, mas o MVP **ainda não cumpre** o seu próprio critério de pronto
(MVP.md, "Como saber que acabou"). Os passos 4 a 7 funcionam de ponta a ponta — cardápio no
celular, pedido, WhatsApp, painel ao vivo, status. Os passos 1 a 3 só funcionam **pela API**, e
o sistema ainda não está no ar. As fases 17 a 28 fecham essa distância; a 16 pôs o CI no ar.

### Decisões do Junio (2026-09-30)

- **Cadastro aberto, no plano gratuito, sem pagamento**, no lugar de "o Super Admin cria o
  estabelecimento". É o primeiro passo da visão de futuro — landing page, escolher o plano,
  assinar, cadastrar-se e usar na hora; a assinatura paga continua no ROADMAP. O Super Admin
  passa a moderar por comando.
- **CI primeiro**, separado do resto do deploy.
- **Entram no MVP**, além do checklist original: troca e recuperação de senha, tratamento de
  imagens no upload, termos de uso e privacidade, landing page e colocar no ar.
- **Auditoria: basta o registro**, que já existe. A consulta no painel foi para o ROADMAP.
- **Ficam no ROADMAP:** busca de CEP, região de entrega ligada ao endereço, OTP e conta do
  cliente, retenção e eliminação de dados, checkout que lembra os dados no aparelho, o
  acompanhamento do pedido pelo cliente (o Junio vai pensar em como fazer) e o robô no WhatsApp.

Começar pelo cadastro permite validar cada tela seguinte num estabelecimento **recém-cadastrado e
vazio**, como faria alguém que nunca viu o sistema.

### Fase 17 — Envio de e-mail e cadastro pela API

- **`EmailService`** no padrão do `StorageService`: provedor SMTP, o Mailpit no
  `docker-compose.yml` para ver os e-mails em desenvolvimento, e um provedor falso nos testes.
- **`criarEstabelecimento`**, numa transação só: estabelecimento, assinatura do plano FREE, dono
  com o papel OWNER e configurações iniciais. Extraído de `semearEstabelecimentos`
  (`apps/api/src/db/seed.ts`); o seed e `criarTenantComUsuario` passam a usá-lo.
- **Uma nova origem nomeada no `TenantContext`** — a arquitetura proíbe construtor genérico.
- **`POST /api/v1/public/signup`:** nome do estabelecimento, slug, nome do dono, e-mail, senha e
  a versão dos termos aceita. Slugs reservados numa lista em `packages/shared` — `/cadastro`,
  `/termos` e as demais páginas colidiriam com `/:tenantSlug`. Limite por IP e campo-armadilha
  contra robôs. Já entra logado, com o cookie da Fase 15. Nunca responde "e-mail já
  cadastrado".
- **Confirmação de e-mail:** token aleatório, guardado como hash, que expira e vale uma vez. O
  painel funciona na hora; **o cardápio só fica público depois da confirmação** — até lá, o
  mesmo 404. Com reenvio.
- **Aviso à plataforma** por e-mail a cada novo cadastro. **Aceite dos termos na auditoria**,
  com a versão e o IP. Rotas abertas novas em `ROTAS_ABERTAS`, com o motivo.
- A avaliar: limite de produtos ou de armazenamento no plano gratuito, contra abuso.

### Fase 18 — Telas do cadastro

- `/` vira a landing page, no lugar da página de teste do ambiente, com "Começar grátis" e
  "Entrar". "Entrar" pede o endereço do estabelecimento, porque o login precisa do slug.
- `/cadastro` sugere o endereço do cardápio a partir do nome e confere se está livre.
- `/termos` e `/privacidade` com texto provisório até o Junio entregar o final;
  `/confirmar-email` recebe o link do e-mail.
- O checkout ganha um aviso de privacidade, com link, para os dados do cliente final.

### Fase 19 — Comandos do Super Admin

- Um comando `pnpm` para listar estabelecimentos, suspender, reativar, trocar o plano e reenviar
  a confirmação. Roda no servidor, e cada ação fica registrada.
- A tabela `platform_admins` fica para o painel da plataforma, no ROADMAP.

### Fase 20 — Tratamento de imagens no upload

- Gira conforme a orientação da câmera, remove todos os metadados — inclusive o GPS —, reduz o
  tamanho por uso (logo, capa, produto) e converte para WebP. Candidato: `sharp`, conferindo a
  política de scripts de instalação do pnpm 10 (DEVELOPMENT.md).
- Testes: foto com GPS sai sem EXIF; foto grande sai reduzida; PNG transparente continua
  transparente.

### Fase 21 — Estrutura do painel e configuração do estabelecimento

- Navegação entre Pedidos, Cardápio, Configurações, Usuários e Clientes, conforme as permissões.
- Tela de configurações: nome (rota nova — o nome fica em `tenants` e nenhuma rota o altera),
  descrição, contato, WhatsApp, endereço, tempo de preparo, pedido mínimo, "recebendo pedidos",
  logo e capa.
- O início do painel ganha a lista "o que falta para receber pedidos": e-mail confirmado,
  WhatsApp, horários, entrega ou retirada, forma de pagamento e pelo menos um produto.

### Fases 22 a 24 — Configurações restantes e cardápio

- **22:** horários, entrega e retirada, formas de pagamento.
- **23:** categorias e produtos, com imagem. Reordenação de produtos em lote
  (`PUT /products/order`), como a de categorias, se a tela precisar.
- **24:** grupos de opção, adicionais e combos.
- Todas sobre rotas que já existem: `admin-settings.ts`, `admin-catalog.ts` e
  `admin-customization.ts`.

### Fase 25 — Usuários e senha

- Tela de usuários sobre a API da Fase 14.
- Cada pessoa troca a própria senha, e o dono redefine a de um atendente.
- "Esqueci minha senha" por e-mail, com o envio da Fase 17.

### Fase 26 — Clientes e histórico de pedidos

- API nova com `customers:read`, permissão que já existe: lista com busca por nome e telefone, e
  o detalhe com os endereços e os pedidos. A lista de pedidos passa a filtrar por cliente.
- Tela, e o acesso a dado pessoal registrado na auditoria (SECURITY.md, seção 11).

### Fase 27 — Acessibilidade e percurso completo

- Revisão de todas as telas: teclado, foco nas janelas, rótulos, contraste, leitor de tela.
  Verificação automática com `axe` nos testes do web.
- O percurso completo, do zero, num estabelecimento novo — do cadastro ao status do pedido — e o
  checklist do MVP.md fechado.

### Fase 28 — Colocar no ar

Pode virar duas fases.

- Escolher a hospedagem, no início da fase.
- Dockerfiles de produção, HTTPS e a CSP da aplicação web.
- Backup do banco e das imagens, com a restauração testada.
- **Seed essencial de produção** — papéis, formas de pagamento e planos, sem os estabelecimentos
  de demonstração. Hoje o plano FREE só existe porque o seed de demonstração o cria.
- SMTP de produção com SPF e DKIM; rate limit compartilhado, se houver mais de uma instância; os
  textos jurídicos finais.

---

## Fases anteriores

**Fase 15** revisou as fronteiras: o refresh token do painel foi para um cookie `httpOnly`; o
`requireAuth` passou para `onRequest`, depois de um teste-guarda pelo inventário de rotas mostrar
15 rotas do painel respondendo 400, e não 401, a quem não estava logado; desativar ou mudar o
papel de alguém fecha a conexão ao vivo na hora; e vieram o `TRUST_PROXY` explícito, o limite de
64 KB no corpo JSON, os logs sem tokens e o `/ready` sem o motivo da falha em produção.

**Fase 14** entregou os limites do plano — aviso a 80% dos pedidos do mês, tolerância de 10% e
depois bloqueio, com o cardápio dizendo só "não está recebendo pedidos" — e a gestão de usuários
pela API, dentro do limite de usuários ativos.

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
| CI sobe o banco pelo mesmo compose                  | Um caminho só para roles e banco; o CI prova os scripts de init      |
| Actions do CI fixadas pelo commit                   | Uma tag pode ser movida por quem controla a action                   |
| Variáveis dos testes declaradas no `turbo.json`     | O Turbo barra as não declaradas, e o cache esconde a diferença       |

---

## Pendências conhecidas

| Item                                                                          | Quando resolve                           |
| ----------------------------------------------------------------------------- | ---------------------------------------- |
| Sem Dockerfile para API e web                                                 | Fase 28                                  |
| Rate limit conta em memória — vira limite por instância se houver mais de uma | Fase 28, se houver mais de uma instância |
| Plano FREE só existe porque o seed de demonstração o cria                     | Fase 28 (seed essencial de produção)     |
| Contrato do cardápio público copiado no web, fora do `packages/shared`        | Quando o contrato mudar de novo          |
| Checkout não lembra os dados no aparelho ao voltar ao cardápio                | ROADMAP                                  |
