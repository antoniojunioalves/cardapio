# Plano do projeto

**Atualizado em:** 2026-09-30
**Fase atual:** 17 — concluída, aguardando validação
**Próxima:** 18 — telas do cadastro: landing page, cadastro, confirmação de e-mail, termos. As fases
18 a 28 fecham o MVP (ver "O que falta para o MVP")

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

**O CI está pronto e guardado (Fase 16).** Formatação, typecheck, lint, testes e build no GitHub
Actions, com o PostgreSQL criado do zero pelos mesmos scripts de init do desenvolvimento. Foi
desligado para agilizar os merges — o workflow está em `CI_PARA_IMPLEMENTAR_DEPOIS.txt` e volta
na Fase 28. Até lá, o `pnpm verify` roda os mesmos passos na máquina de quem desenvolve.

**O estabelecimento já se cadastra pela API (Fase 17).** `POST /api/v1/public/signup` cria o
estabelecimento no plano gratuito, com o dono e a sessão aberta; o cardápio nasce fora do ar e é
publicado quando o dono clica no link enviado por e-mail. Em desenvolvimento, os e-mails caem no
Mailpit (http://localhost:8025).

**Ainda não existe:** as telas do cadastro e as telas de configuração, cardápio, usuários e
clientes — hoje o estabelecimento se cadastra e é configurado pela API. As fases 18 a 28 fecham o
MVP; ver "O que falta para o MVP".

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
| 16  | CI no GitHub e ajustes nos docs — _o workflow ficou guardado até a Fase 28_                                         | ✅ Concluída |
| 17  | Envio de e-mail e cadastro do estabelecimento pela API                                                              | ✅ Concluída |
| 18  | Telas do cadastro: landing page, cadastro, confirmação de e-mail, termos e privacidade                              | ⬜ Próxima   |
| 19  | Comandos do Super Admin: listar, suspender, reativar, trocar o plano, reenviar a confirmação                        | ⬜           |
| 20  | Tratamento de imagens no upload: sem metadados, tamanho reduzido, WebP                                              | ⬜           |
| 21  | Estrutura do painel e configuração do estabelecimento                                                               | ⬜           |
| 22  | Horários, entrega e retirada, formas de pagamento                                                                   | ⬜           |
| 23  | Categorias e produtos                                                                                               | ⬜           |
| 24  | Grupos de opção, adicionais e combos                                                                                | ⬜           |
| 25  | Usuários e senha                                                                                                    | ⬜           |
| 26  | Clientes e histórico de pedidos                                                                                     | ⬜           |
| 27  | Acessibilidade e percurso completo, do zero                                                                         | ⬜           |
| 28  | Colocar no ar — religa antes o CI guardado na Fase 16                                                               | ⬜           |

Três movimentos em relação à ordem sugerida originalmente, cada um porque algo posterior
dependia do item movido: configurações do estabelecimento para a Fase 5 (o cardápio público
precisa exibir aberto/fechado, taxa e pedido mínimo), storage para a Fase 6 (produto nasce com
imagem) e auditoria para a Fase 4 (o requisito é registrar "desde o início").

---

## Fase 17 — concluída

### Microtasks

| #   | Tarefa                                                                                                   | Status |
| --- | -------------------------------------------------------------------------------------------------------- | ------ |
| 1   | CI guardado registrado nos docs, com o aviso na Fase 28 de que ela precisa dele                          | ✅     |
| 2   | `packages/shared`: endereço do cardápio (formato e reservados), senha, versão dos termos, fuso, cadastro | ✅     |
| 3   | Banco: status `PENDING`, `users.email_verified_at`, `email_verification_tokens` com RLS forçado          | ✅     |
| 4   | `seed-plans.ts`: os planos saem do seed de demonstração, para os testes e o seed de produção             | ✅     |
| 5   | `EmailService`: SMTP (`nodemailer`), memória nos testes, Mailpit no compose, variáveis de ambiente       | ✅     |
| 6   | `criarEstabelecimento` numa transação, com a origem `signup` no `TenantContext`; o seed passa a usá-lo   | ✅     |
| 7   | Cadastro, confirmação, reenvio, situação e disponibilidade do endereço, cada rota com limite próprio     | ✅     |
| 8   | Aviso à plataforma a cada cadastro; aceite dos termos na auditoria, com a versão e o IP                  | ✅     |
| 9   | Testes: fluxo completo, recusas, reenvio, isolamento, limite por IP, configuração de e-mail              | ✅     |

### Decisões e achados desta fase

**O e-mail de confirmação não repete nada do que foi digitado.** Ele vai para um endereço que
quem se cadastra escolhe — pode ser de outra pessoa. Se levasse o nome do estabelecimento, o
cadastro viraria um jeito de mandar, pelo nosso remetente, um texto qualquer para qualquer
endereço. Vai só o endereço do cardápio (letras, números e hífen) e o link; o aviso para a
plataforma, que vai para nós, leva tudo. Há teste com um golpe escrito no nome.

**O token vai no fragmento do link** (`/confirmar-email#token=…`), que o navegador não envia ao
servidor nem repassa como `Referer`: ele não aparece em log nenhum. A página da Fase 18 o lê e o
manda à API no corpo de um POST.

**Uma transação só, e os e-mails depois do commit.** O id do estabelecimento é pedido ao banco
antes da transação, e o contexto nasce dele: estabelecimento, assinatura, dono, aceite dos termos,
link e sessão são gravados juntos. Servidor de e-mail fora do ar não desfaz o cadastro — a
resposta diz que o e-mail não saiu, e o painel oferece o reenvio.

**Confirmar só tira de `PENDING`**: um link guardado não desfaz uma suspensão. **O reenvio vai
sempre para quem cadastrou**, seja quem for que peça, com um minuto entre envios contado no
banco.

**Fuso no cadastro, fora do plano.** O fuso do estabelecimento não é editável em lugar nenhum, e
um estabelecimento de Manaus veria o aberto/fechado errado com o de Brasília. O cadastro aceita
um fuso opcional, validado pelo `Intl`; sem ele, vale Brasília. A tela da Fase 18 pode mandar o
do navegador.

**Desvio do plano: a fixture `criarTenantComUsuario` não passou a usar `criarEstabelecimento`.**
Ela cria papéis e permissões próprios de cada teste e nenhum plano — é o que a maioria dos testes
precisa provar. Com o OWNER e o plano FREE (2 usuários), centenas de testes passariam a provar
outra coisa. O seed usa a função; os testes do cadastro usam a rota de verdade.

**Achado: suspender não derruba quem já está logado.** O middleware e a renovação de sessão não
olham o status do estabelecimento. Não afeta a Fase 17 — é até o que deixa o dono de um cadastro
ainda não confirmado usar o painel —, mas a suspensão da Fase 19 precisa derrubar as sessões.

**Origens do contexto:** `signup`, para o estabelecimento que está sendo criado, e `token`, para o
tenant embutido num token nosso. A renovação de sessão usava a de slug público e passou a declarar
a verdadeira.

**Limite do plano gratuito contra abuso — avaliado, não implementado.** O cadastro aberto limita
10 cadastros por hora por IP, mas cada estabelecimento pode subir imagens de até 5 MB sem limite
de quantidade: o risco real é o disco. Sugestão: um limite de produtos no FREE (a Fase 14 já
suporta um recurso novo) e a redução das imagens no upload (Fase 20, já no plano). Decisão do
Junio.

### Verificação executada

| Verificação                                               | Resultado                                                                                                                                                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                             | **627 testes** (454 API + 149 web + 24 shared); formatação, typecheck, lint e build                                                                                                                                    |
| Testes sensíveis à regra                                  | cadastro já publicado, sem campo-armadilha, confirmação de suspenso, reenvio desviado: cada um cai                                                                                                                     |
| API compilada, banco de desenvolvimento e SMTP no Mailpit | cadastro 201 e cardápio 404; os dois e-mails chegaram, com acentos certos e a confirmação sem texto digitado; o link publicou (cardápio 200), o segundo clique respondeu `ALREADY_CONFIRMED`, o reenvio depois deu 409 |
| Clone limpo, `--frozen-lockfile`                          | `pnpm verify` inteiro: os mesmos 627 testes, formatação, typecheck, lint e build                                                                                                                                       |

---

## O que falta para o MVP

As fases 1 a 17 estão feitas, mas o MVP **ainda não cumpre** o seu próprio critério de pronto
(MVP.md, "Como saber que acabou"). Os passos 4 a 7 funcionam de ponta a ponta — cardápio no
celular, pedido, WhatsApp, painel ao vivo, status. Os passos 1 a 3 só funcionam **pela API**, e
o sistema ainda não está no ar. As fases 18 a 28 fecham essa distância.

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

### Em toda fase

- **Rota nova ou alterada: regenerar a coleção do Postman** (`pnpm postman`) e avisar no relatório
  para importar de novo. O teste `tests/postman.test.ts` não deixa esquecer: falha com a coleção
  desatualizada ou com rota de corpo sem exemplo. Como fazer: DEVELOPMENT.md, "Postman".

Começar pelo cadastro permite validar cada tela seguinte num estabelecimento **recém-cadastrado e
vazio**, como faria alguém que nunca viu o sistema.

### Fase 18 — Telas do cadastro

- `/` vira a landing page, no lugar da página de teste do ambiente, com "Começar grátis" e
  "Entrar". "Entrar" pede o endereço do estabelecimento, porque o login precisa do slug.
- `/cadastro` sugere o endereço do cardápio a partir do nome e confere se está livre.
- `/termos` e `/privacidade` com texto provisório até o Junio entregar o final;
  `/confirmar-email` recebe o link do e-mail.
- O checkout ganha um aviso de privacidade, com link, para os dados do cliente final.
- A API está pronta (Fase 17): `POST /public/signup`, `GET /public/signup/slug-availability`,
  `POST /public/signup/confirm-email`, `GET /admin/email-confirmation` e o reenvio. Os schemas e a
  versão dos termos (`VERSAO_DOS_TERMOS`) estão em `packages/shared`; o link do e-mail aponta para
  `/confirmar-email#token=…`. O painel ganha o aviso "confirme seu e-mail", com o botão de
  reenviar.

### Fase 19 — Comandos do Super Admin

- Um comando `pnpm` para listar estabelecimentos, suspender, reativar, trocar o plano e reenviar
  a confirmação. Roda no servidor, e cada ação fica registrada.
- A tabela `platform_admins` fica para o painel da plataforma, no ROADMAP.
- **Suspender precisa derrubar quem já está logado** (achado da Fase 17): hoje o middleware e a
  renovação de sessão não olham o status do estabelecimento.

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
- "Esqueci minha senha" por e-mail, com o envio da Fase 17 — e o mesmo desenho do link de
  confirmação: token com o tenant embutido, só o hash no banco, no fragmento do link.

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

> **Precisa do CI funcionando — religar antes de tudo.** O workflow da Fase 16 foi desligado para
> agilizar os merges e está guardado em `CI_PARA_IMPLEMENTAR_DEPOIS.txt`. Recriar
> `.github/workflows/ci.yml` com esse conteúdo (a primeira linha diz onde), conferir se as
> actions fixadas pelo commit ainda são as versões atuais (DEVELOPMENT.md, "CI") e abrir um PR
> para vê-lo passar. Deploy sem CI publicaria código que ninguém conferiu do zero.

- Escolher a hospedagem, no início da fase.
- Dockerfiles de produção, HTTPS e a CSP da aplicação web.
- Backup do banco e das imagens, com a restauração testada.
- **Seed essencial de produção** — papéis, formas de pagamento e planos, sem os estabelecimentos
  de demonstração. Hoje o plano FREE só existe porque o seed de demonstração o cria.
- SMTP de produção com SPF e DKIM; rate limit compartilhado, se houver mais de uma instância; os
  textos jurídicos finais.

---

## Fases anteriores

**Fase 16** escreveu o CI no GitHub Actions — com o PostgreSQL criado do zero pelos scripts de
init, actions fixadas pelo commit e nenhum segredo —, guardado depois até a Fase 28 para agilizar
os merges. No caminho: o healthcheck do compose passou a testar pela rede (pelo socket, dava
"pronto" antes dos scripts de init), o `turbo.json` passou a repassar aos testes o fuso e o banco
de testes (o Turbo os barrava, e o cache escondia), e o `pnpm verify` ficou igual ao CI.

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

| Decisão                                             | Resumo                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| Banco único, schema único, `tenant_id`              | Muitos tenants pequenos e homogêneos                                      |
| RLS + camada tenant-scoped + teste-guarda           | Duas defesas independentes, mais um portão no CI                          |
| Duas roles de banco: migrator e app                 | O dono da tabela consegue desligar o RLS; a app não pode ser dona         |
| `TenantContext` sem construtor genérico             | Não há como criar contexto a partir de dado do cliente                    |
| `tenants` sem RLS, com repositório estreito         | A resolução do slug antecede o contexto                                   |
| Guarda exige declarar tabelas globais               | Pega a tabela que deveria ter `tenant_id` e não tem                       |
| Super Admin em tabela própria                       | Com `tenant_id` nulo a policy nunca casaria — linha invisível             |
| Refresh token opaco, não JWT                        | Já consulta o banco para revogação; assinatura não compra nada            |
| `audit_logs` sem policy de update nem delete        | Append-only pela estrutura, não por convenção                             |
| Usuário recarregado a cada requisição               | Desativar alguém passa a valer na hora                                    |
| `requireAuth()` devolve a cadeia pronta             | Ordem errada entre autenticar e autorizar falharia em silêncio            |
| argon2id com parâmetros explícitos                  | Um padrão invisível nunca é revisitado                                    |
| Substituição em vez de CRUD em horários e regiões   | É como a grade semanal é editada de verdade                               |
| `closesAt = opensAt` proibido                       | Ambiguidade tornaria a travessia de meia-noite indecidível                |
| Região inativa conta como inexistente               | Desativar precisa impedir pedido, não só esconder                         |
| Domínio separado de banco e framework               | Casos de borda cobertos em milissegundos                                  |
| `DRIZZLE_CONFIG` compartilhado                      | Instância sem `casing` falha de um jeito que parece outro problema        |
| Banco guarda chave de storage, não URL              | Trocar de provider não exige reescrever linhas                            |
| Tipo de imagem detectado pelos bytes                | Extensão e `Content-Type` são escolhidos por quem envia                   |
| Arquivo antigo apagado só depois do commit          | Rollback não deixa referência para arquivo inexistente                    |
| UUIDv7 gerado no banco (`uuidv7()` do PG 18)        | Vale para seed e INSERT manual, sem dependência                           |
| Testes contra PostgreSQL real                       | RLS não se prova com mock                                                 |
| `/health` não consulta o banco                      | Senão uma oscilação do banco reinicia processos saudáveis                 |
| TypeScript 6.0.3 em vez de 7.0.2                    | `typescript-eslint` não suporta TS 7                                      |
| Dinheiro em centavos inteiros                       | Ponto flutuante quebra a checagem de pedido mínimo                        |
| Escopo `@repo/` nos pacotes internos                | Renomear o produto não toca em nenhum import                              |
| Compose cobre só o PostgreSQL                       | Containerizar o dev de um monorepo pnpm custa mais do que rende           |
| Dependências instaladas na fase em que forem usadas | `package.json` reflete o que o código importa                             |
| Identificação devolve endereço mascarado            | Telefone não prova identidade; o pedido referencia o endereço por id      |
| Cliente por estabelecimento                         | O dado serve a quem o coletou                                             |
| CI sobe o banco pelo mesmo compose                  | Um caminho só para roles e banco; o CI prova os scripts de init           |
| Actions do CI fixadas pelo commit                   | Uma tag pode ser movida por quem controla a action                        |
| Variáveis dos testes declaradas no `turbo.json`     | O Turbo barra as não declaradas, e o cache esconde a diferença            |
| Cadastro aberto nasce `PENDING`                     | O cardápio só vai ao ar depois de o dono provar o e-mail                  |
| E-mail a terceiros sem texto digitado               | Senão o cadastro vira jeito de mandar qualquer texto pelo nosso remetente |
| Token de confirmação no fragmento do link           | O fragmento não chega ao servidor nem vaza por `Referer`                  |
| E-mails só depois do commit                         | Rollback não desfaz e-mail enviado                                        |
| Coleção do Postman gerada da OpenAPI                | Rota nova entra sozinha; o teste cobra exemplo e arquivo em dia           |

---

## Pendências conhecidas

| Item                                                                                                                                                              | Quando resolve                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Suspender não derruba as sessões abertas — o middleware não olha o status do estabelecimento                                                                      | Fase 19                                  |
| Limite de produtos ou de armazenamento no plano gratuito, contra abuso do cadastro aberto                                                                         | A decidir — sugestão: com a Fase 20      |
| CI desligado — o workflow está em `CI_PARA_IMPLEMENTAR_DEPOIS.txt`                                                                                                | Fase 28, antes do deploy                 |
| Sem Dockerfile para API e web                                                                                                                                     | Fase 28                                  |
| Rate limit conta em memória — vira limite por instância se houver mais de uma                                                                                     | Fase 28, se houver mais de uma instância |
| Os catálogos (papéis, formas de pagamento, planos) só são semeados pelo seed de demonstração — já separados em `seed-rbac`, `seed-payment-methods` e `seed-plans` | Fase 28 (seed essencial de produção)     |
| Contrato do cardápio público copiado no web, fora do `packages/shared`                                                                                            | Quando o contrato mudar de novo          |
| Checkout não lembra os dados no aparelho ao voltar ao cardápio                                                                                                    | ROADMAP                                  |
