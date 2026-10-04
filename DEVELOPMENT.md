# Desenvolvimento

## Ambiente

```bash
nvm use              # lê o .nvmrc → Node 24
pnpm install
cp .env.example .env
pnpm db:up
pnpm dev
```

### Particularidades conhecidas deste ambiente

**`node` pode não estar no PATH.** Nesta máquina o Node vem do nvm e não está disponível por
padrão em shells não interativos. Se um comando falhar com `command not found: node`, rode
`nvm use` antes — ou, em script:

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use
```

**Docker no WSL 2** exige a integração habilitada em Docker Desktop → Settings → Resources →
WSL Integration, marcando o distro.

**pnpm 10 bloqueia scripts de instalação** de dependências por padrão. Os pacotes autorizados
estão em `onlyBuiltDependencies` no `pnpm-workspace.yaml`. Hoje há só um: o `esbuild`, que
precisa disso para o binário nativo. Acrescentar um item ali é decidir executar código de
terceiros durante o install — trate como decisão, não como formalidade.

O `sharp` (tratamento de imagens) **não** precisou entrar na lista: não tem script de instalação.
O binário da libvips vem como dependência opcional por plataforma (`@img/sharp-linux-x64` e
semelhantes), e o pnpm instala a do sistema em que roda. Na imagem de produção (Fase 28), o
`pnpm install` precisa rodar dentro do container, para vir o binário certo.

**`UPLOAD_MAX_BYTES` no seu `.env`:** o teto do envio subiu de 5 para 15 MB na Fase 20. O
`.env.example` já traz o valor novo; um `.env` copiado antes continua com o antigo, e recusa foto
de celular com 413. Troque a linha por `UPLOAD_MAX_BYTES=15728640`.

**Os scripts de inicialização do PostgreSQL rodam uma vez só**, quando o volume está vazio.
Depois de alterar qualquer arquivo em `docker/postgres/init/`, use `pnpm db:reset` — sem isso a
mudança simplesmente não acontece e o sintoma é um erro de permissão inexplicável.

**A suíte de testes precisa do banco de pé.** Rode `pnpm db:up` antes de `pnpm test`.

---

## Comandos

| Comando             | Efeito                                                                 |
| ------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`          | API e web em watch, em paralelo                                        |
| `pnpm verify`       | format:check → typecheck → lint → test → build — o mesmo que o CI      |
| `pnpm typecheck`    | TypeScript em todos os pacotes                                         |
| `pnpm lint`         | ESLint com informação de tipos                                         |
| `pnpm test`         | Vitest em todos os pacotes, um por vez — **exige `pnpm db:up`**        |
| `pnpm build`        | Build de produção                                                      |
| `pnpm format`       | Prettier, escrevendo                                                   |
| `pnpm format:check` | Prettier, só conferindo                                                |
| `pnpm db:up`        | Sobe o PostgreSQL e o Mailpit (e-mails em http://localhost:8025)       |
| `pnpm db:down`      | Derruba os containers, preservando o volume                            |
| `pnpm db:reset`     | Apaga o volume e recria — necessário ao alterar scripts de init        |
| `pnpm db:generate`  | Gera migration a partir do schema; não toca no banco                   |
| `pnpm db:migrate`   | Aplica as migrations, com a role que tem DDL                           |
| `pnpm db:seed`      | Três estabelecimentos e dois planos de demonstração; idempotente       |
| `pnpm postman`      | Regenera a coleção do Postman a partir das rotas; não precisa do banco |
| `pnpm plataforma`   | Ações do Super Admin sobre os estabelecimentos — ver "Plataforma"      |

Num pacote só:

```bash
pnpm --filter @repo/api test
pnpm --filter @repo/web dev
```

`pnpm verify` é o que precisa passar antes de considerar qualquer tarefa concluída.

Os testes rodam **um pacote por vez** (`--concurrency=1` no script): em paralelo, a suíte da API
e a do web disputam memória, e no WSL o processo já foi derrubado por isso (código 137).

---

## Plataforma

O Super Admin age por comando, no servidor — não há tela nem rota para isto:

```bash
pnpm plataforma listar                                   # todos
pnpm plataforma listar --status suspenso                 # ativo | suspenso | pendente
pnpm plataforma suspender lanchonete-do-ze --motivo "conteúdo impróprio"
pnpm plataforma reativar lanchonete-do-ze
pnpm plataforma plano lanchonete-do-ze PREMIUM
pnpm plataforma reenviar-confirmacao lanchonete-do-ze
```

Toda ação que altera algo aceita `--operador "<nome>"`, que vai para a auditoria; sem ele, vale o
usuário do sistema. Sem argumentos, o comando mostra a ajuda. Sai com 0 se deu certo, 1 se a ação
foi recusada (endereço que não existe, já suspenso) e 2 se o comando foi digitado errado.

O comando usa o `.env` e a role da API. Suspender derruba na hora quem está logado naquele
estabelecimento, inclusive numa API que esteja rodando em outro processo.

Ação nova: um caso em `interpretar` (`src/platform/args.ts`), a função em `service.ts` — com
`tenantContextFromPlatform`, `withTenant` e `recordAudit`, sem usuário e com o operador nos
detalhes — e a frase de resposta em `commands.ts`.

---

## CI

> **Desligado por enquanto.** O workflow foi tirado do repositório para agilizar os merges e volta
> na Fase 28, antes de colocar o sistema no ar. O conteúdo está guardado em
> `CI_PARA_IMPLEMENTAR_DEPOIS.txt`: para religar, recrie `.github/workflows/ci.yml` com ele (a primeira linha
> diz onde) e confira se as actions fixadas ainda são as versões atuais — ver "Atualizar uma
> action", abaixo. Até lá, `pnpm verify` é a verificação.

Com o workflow no lugar, cada PR e cada commit na `main` rodam o `.github/workflows/ci.yml` no
GitHub Actions:
formatação, typecheck, lint, testes e build — os passos do `pnpm verify`, separados para o GitHub
mostrar qual falhou. O PostgreSQL sobe pelo mesmo `docker-compose.yml` do desenvolvimento, e os
scripts de `docker/postgres/init/` criam as roles e o banco de testes do zero a cada execução.

**Para reproduzir na sua máquina:** `pnpm verify`. O que passa aqui passa lá, com duas diferenças
conhecidas:

- **Fuso horário.** O GitHub roda em UTC; a máquina de desenvolvimento, no fuso local. Para
  conferir um teste que envolva data ou horário: `TZ=UTC pnpm test`.
- **Banco do zero.** O CI cria o banco a cada execução; aqui ele já existe. Mudou um script de
  `docker/postgres/init/`? `pnpm db:reset` repete o caminho do CI — e apaga os dados de
  desenvolvimento.

**O Turborepo só repassa aos testes as variáveis declaradas.** No modo padrão dele, uma variável
de ambiente que não esteja no `env` da tarefa em `turbo.json` não chega ao script — e também não
entra na chave do cache, então mudá-la reaproveita o resultado anterior sem rodar nada. Por isso
a tarefa `test` declara `TZ`, `TEST_DATABASE_URL` e `TEST_MIGRATION_DATABASE_URL`: sem isso,
`TZ=UTC pnpm test` logo depois de um `pnpm test` só reapresentaria o resultado antigo, e o banco
de testes do `.env.example` nunca chegaria ao Vitest. Variável nova que um teste leia entra na
mesma lista.

**Sem segredos.** O CI não usa `.env`: os testes usam os valores de desenvolvimento, que já são o
padrão do `docker-compose.yml` e do `apps/api/vitest.config.ts`. Não cadastre segredo no GitHub
para o CI — se um teste precisar de um, o valor de teste vai no `vitest.config.ts`, como o
`JWT_SECRET`.

**Atualizar uma action.** Elas são fixadas pelo commit, e não pela tag (SECURITY.md, seção 12).
Para subir a versão, descubra o commit da tag nova:

```bash
gh api repos/actions/checkout/releases/latest --jq .tag_name
gh api repos/actions/checkout/commits/v7.0.1 --jq .sha
```

Troque o commit e o comentário da versão juntos, e confira no `action.yml` da versão nova se as
entradas usadas continuam existindo.

**Conferir o workflow antes do push:** o [actionlint](https://github.com/rhysd/actionlint) roda
sem instalação, pelo Docker:

```bash
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest
```

---

## Postman

A coleção de todas as rotas fica em `apps/api/postman/api.postman_collection.json` — como
importar e usar está no `README.md` ao lado dela. Ela é **gerada** da descrição OpenAPI da API
por `pnpm postman`; não edite o JSON à mão.

**Criou ou mudou uma rota:**

1. Rota com corpo JSON? Escreva o exemplo em `apps/api/src/postman/exemplos.ts`, com valores que
   passem na validação — os que mudam configuração repetem os dados do seed. Se a rota cria algo
   ou lista algo que outras usam, acrescente o script que guarda o id (`depois`).
2. Parâmetro `:id` de um recurso novo? Acrescente o recurso em `VARIAVEL_DO_RECURSO`
   (`src/postman/colecao.ts`) — o gerador falha dizendo qual.
3. `pnpm postman`, e faça o commit do JSON junto com a rota.
4. No relatório da fase, avise para importar a coleção de novo.

O teste `tests/postman.test.ts` cobra os passos 1 a 3: falha com o arquivo desatualizado, com rota
de corpo sem exemplo, com exemplo que a própria rota recusaria e com variável não declarada.

## Estrutura

```
apps/api/src/
├── config/        env validado com Zod
├── lib/           utilidades sem dependência de framework
├── plugins/       plugins do Fastify
├── routes/        rotas HTTP
├── tenant/        TenantContext, withTenant, resolução de tenant
├── auth/          senha, tokens, sessão, middleware de rota
├── audit/         registro de ações administrativas
├── settings/      configurações, horários, entrega — domínio + repositório + serviço
├── storage/       StorageService, provider local, detecção de tipo, troca de imagem
├── catalog/       categorias, produtos, grupos de opção e combos
├── customers/     cliente final: máscara, repositório, identificação por telefone
├── orders/        pedido: cálculo puro, status, repositório, serviço, mensagem do WhatsApp
├── realtime/      pedidos ao vivo: canal por tenant, LISTEN/NOTIFY, WebSocket
├── plans/         limites do plano: regra pura, uso de pedidos e usuários
├── users/         gestão de usuários do painel
├── public-menu/   cardápio público
└── db/            schema Drizzle, migrations, seed, catálogos

apps/web/src/
├── components/    genéricos, sem regra de negócio — Sheet, QuantityStepper, TextField, SiteLayout
├── features/      por domínio — menu/, cart/, checkout/, admin/, signup/ (cadastro), legal/ (termos)
├── pages/         composição de rotas — LandingPage, SignupPage, MenuPage, CheckoutPage…
├── layouts/
├── theme/         tokens de design
├── services/      clientes HTTP
├── hooks/  stores/  utils/  types/
```

---

## Convenções

### Nomes

| Item                        | Convenção         | Exemplo                       |
| --------------------------- | ----------------- | ----------------------------- |
| Arquivo de componente React | PascalCase        | `ProductCard.tsx`             |
| Demais arquivos             | kebab-case        | `tenant-theme.ts`             |
| Diretórios                  | kebab-case        | `payment-methods/`            |
| Colunas do banco            | snake_case        | `price_in_cents`              |
| Campos em TypeScript        | camelCase         | `priceInCents`                |
| Valor monetário             | sufixo da unidade | `priceInCents`, nunca `price` |

Entidades têm nome genérico. O sistema atende lanchonete, pizzaria, cafeteria e food truck —
então `Product`, e jamais `Burger`.

O código é escrito em português no que é de domínio (nomes de rota visíveis, mensagens, textos
de interface, comentários) e mantém em inglês o que é da plataforma (nomes de entidade, campos,
tipos). Comentários explicam **por quê**, não o quê.

### Componentes

Antes de criar, verifique se já existe algo reutilizável.

- **`components/`** — genérico, sem regra de negócio, sem importar de `features/`. É escrito para
  poder virar biblioteca própria um dia. `Button`, `Input`, `Modal`, `Drawer`, `Badge`.
- **`features/<nome>/components/`** — tudo que conhece regra de negócio. `ProductCard`,
  `CheckoutSummary`, `CartDrawer`.

Um componente em `components/` que importa de `features/` está no lugar errado.

### Cores e espaçamentos

Nunca escreva cor literal (`bg-[#0d9488]`, `color: #fff`). Use a camada semântica dos tokens:
`bg-surface`, `text-content-muted`, `bg-primary`. Um componente com cor literal quebra o tema por
tenant sem que ninguém perceba.

Detalhes em [ARCHITECTURE.md](ARCHITECTURE.md#63-temas).

### Estado no frontend

| Ferramenta     | Usar para                                               |
| -------------- | ------------------------------------------------------- |
| TanStack Query | qualquer coisa que venha da API                         |
| Zustand        | carrinho, preferências locais, estado de UI persistente |
| `useState`     | estado de um componente só                              |

Resposta de API **não** vai para o Zustand. O carrinho mostra isso na prática: a store guarda só
o que o cliente escolheu, e o preço sai do cardápio do TanStack Query na hora de mostrar.

Store persistida trata o `localStorage` como entrada externa: passe o que volta de lá por uma
função de limpeza no `merge` do `persist` — veja `sanearCarrinhos` em
`apps/web/src/features/cart/cart.ts`.

### Formulários

React Hook Form + Zod. O schema é a única definição: tipo e validação saem dele. Mensagens de
erro em português e voltadas à pessoa que está preenchendo — "Informe um telefone com DDD", não
"invalid format".

Campo que a API também valida usa o schema de `@repo/shared`, nunca uma cópia. Regra que depende
do estabelecimento (região, forma aceita, troco) vai num schema montado com o cardápio — veja
`criarSchemaDoCheckout`. Atenção ao Zod 4: o `superRefine` não roda quando um campo da base já
falhou; para mostrar todos os erros de uma vez, deixe a base aceitar texto e valide tudo no
`superRefine`. E a base precisa aceitar `null`: grupo de rádios sem nada marcado chega assim
depois que o foco passa por ele, e um `z.string()` puro derruba a base inteira.

Para uma regra entre dois campos, há um caminho mais leve: o `when` do `refine`, que diz quando a
regra roda mesmo com outros campos inválidos — veja o tempo de preparo em
`features/admin/settings.ts`.

Formulário do painel que edita um registro: um schema que recebe o que a pessoa digita e entrega
o corpo da API, e uma função `paraFormulario` no sentido inverso. Depois de salvar,
`reset(paraFormulario(resposta))` — os campos mostram o que foi gravado, e o botão de salvar volta
a ficar desligado. `features/admin/settings.ts` e `SettingsForm.tsx` são o modelo.

### Textos legais

Os termos de uso e a política de privacidade moram em `apps/web/src/features/legal/textos.ts`.
**Mudou o texto, mude a versão:** `VERSAO_DOS_TERMOS`, em `packages/shared/src/signup.ts`, é o que
o cadastro envia e a API registra na auditoria como aceito — texto novo com a versão velha
registraria um aceite de algo que a pessoa não leu. A API recusa cadastro com versão diferente da
atual, e a tela, aberta antes da troca, pede um novo aceite.

### Código compartilhado entre API e web

`packages/shared` guarda só o que os dois lados precisam validar igual. Ele é consumido pelo
`dist`, então **depois de mudar algo nele, rode `pnpm --filter @repo/shared build`** (o
`pnpm dev` compila uma vez ao subir, mas não acompanha mudanças). Regra que só um lado aplica
fica nele — a máscara do endereço é do servidor.

---

## Testes

| Tipo                 | Onde              | O que cobre                                     |
| -------------------- | ----------------- | ----------------------------------------------- |
| Unidade              | junto do código   | cálculo de preço, regras de horário             |
| Integração da API    | `apps/api/tests/` | rota completa via `app.inject()`                |
| Isolamento de tenant | `apps/api/tests/` | **obrigatório** para todo recurso tenant-scoped |
| Componente           | `apps/web/tests/` | comportamento visível, não implementação        |

**Os testes da API rodam contra um PostgreSQL de verdade**, no banco `cardapio_test`, separado
do de desenvolvimento. Não é preguiça de mockar: as policies de RLS só podem ser comprovadas
pelo próprio banco, e um mock provaria apenas que concorda com quem o escreveu. Pré-requisito:
`pnpm db:up`.

Para exercitar um caminho de falha sem depender de derrubar serviço, `buildApp()` aceita
injeção — por exemplo `buildApp({ checkDatabase: … })` para testar o 503 de `/ready`. Prefira
isso a mock de módulo.

Regra que não se negocia: **recurso com escopo de tenant sem teste de isolamento não está
pronto.** O teste prova que o Tenant A não lê nem altera dado do Tenant B.

### Criando uma tabela nova

Decida primeiro se ela é da plataforma ou de um estabelecimento — o teste-guarda obriga a essa
escolha e falha se ela ficar implícita.

**De estabelecimento** (a maioria):

1. Coluna `tenantId` com referência a `tenants`.
2. `.enableRLS()` e uma `pgPolicy('tenant_isolation', …)` com `using` **e** `withCheck`, usando
   `currentTenantId` de `schema/shared.ts`.
3. **Toda referência a outra tabela tenant-scoped é FK composta**, com o `tenant_id` dos dois
   lados, e `unique(tenantId, id)` na tabela referenciada:

   ```ts
   foreignKey({
     name: 'products_categoria_mesmo_tenant',
     columns: [table.tenantId, table.categoryId],
     foreignColumns: [categories.tenantId, categories.id],
   })
   ```

   A checagem de FK roda por fora do RLS; uma FK simples aceitaria referência a linha de outro
   estabelecimento. Confira o SQL gerado: o `drizzle-kit` já emitiu a FK antes da restrição
   única que ela referencia, e a migration falharia.

4. `ALTER TABLE ... FORCE ROW LEVEL SECURITY` numa migration escrita à mão — o Drizzle não gera
   o `FORCE`. Há uma migration dedicada a isso: `0001_force_row_level_security.sql`.
5. Testes de isolamento do recurso, incluindo tentar referenciar uma linha de outro
   estabelecimento.

**Da plataforma:** declare a tabela em `TABELAS_GLOBAIS`, em `tests/rls-guard.test.ts`, com o
motivo. Sem isso o teste falha — de propósito.

### Protegendo uma rota

Use sempre `requireAuth()`, que devolve a cadeia pronta:

```ts
app.get('/produtos', { onRequest: requireAuth('products:read') }, handler)
app.get('/perfil', { onRequest: requireAuth() }, handler) // só autenticação
```

**Em `onRequest`, nunca em `preHandler`**: o Fastify valida o corpo antes do `preHandler`, e quem
não está logado receberia 400 com o formato da rota. `tests/route-guard.test.ts` confere toda
rota do painel pelo inventário — e toda rota aberta precisa estar na lista dele, com o motivo.

Não existe `authenticate` nem `authorize` exportados separadamente, de propósito: montá-los na
ordem errada falharia em silêncio, com o erro parecendo de sessão e não de configuração.

Dentro do handler, `currentUser(request)` e `tenantContextOf(request)` devolvem os valores já
com tipo garantido.

Permissão nova: acrescente em `PERMISSOES` no `src/db/seed-rbac.ts` e atribua aos papéis que
devem tê-la.

### Registrando auditoria

Toda ação administrativa que altera dado registra. `recordAudit` recebe a transação em curso —
nunca abre a sua própria — para que a auditoria e a alteração vivam ou morram juntas:

```ts
await withTenant(context, async (tx) => {
  await tx.update(products).set({ priceInCents }).where(eq(products.id, id))
  await recordAudit(tx, context, {
    action: 'product.price_changed',
    entityType: 'product',
    entityId: id,
    actorUserId: usuario.id,
    metadata: { de: anterior, para: priceInCents },
  })
})
```

### Organizando uma feature de backend

A partir da Fase 5 cada domínio ganha uma pasta com três papéis distintos, e vale seguir:

| Arquivo           | Responsabilidade                                                      |
| ----------------- | --------------------------------------------------------------------- |
| Módulo de domínio | Regra pura, sem banco nem framework — recebe dados, devolve resultado |
| `repository.ts`   | Acesso a dados; recebe a transação, nunca abre a sua                  |
| `service.ts`      | Abre a transação, compõe o repositório e grava a auditoria            |

O módulo de domínio separado é o que permite cobrir casos de borda em milissegundos.
`opening-hours.ts` tem 22 testes que não tocam no banco.

**Toda instância do Drizzle usa `DRIZZLE_CONFIG`.** Criar uma sem ele emite `"sortOrder"` em vez
de `sort_order`, e o erro que aparece — `column "sortOrder" does not exist` — parece problema de
migration, não de configuração do cliente.

### Guardando uma imagem

Use sempre `trocarImagem` (`src/storage/replace.ts`), dizendo o `uso` — `logo`, `cover`,
`categories` ou `products`. Ela confere o formato, **trata a imagem** (sem metadados, de pé, no
tamanho do uso, em WebP), monta a chave, grava e só depois do commit apaga a antiga.
`src/settings/images.ts` é o modelo a seguir. Nunca grave no storage por outro caminho: é o
tratamento que tira a localização GPS da foto.

No banco fica a **chave**, nunca URL nem caminho; a URL sai na resposta, com `urlDaImagem`. O nome
enviado pelo cliente não participa da chave. Uso novo com outro tamanho: uma entrada em
`LADO_MAXIMO`, em `src/storage/process-image.ts`.

Nos testes, as amostras de `tests/helpers/imagens.ts` são imagens de verdade — o tratamento abre
o arquivo, e meia dúzia de bytes com a assinatura certa não passa. Há uma foto de celular com GPS
(`fotoDeCelular`), uma imagem do tamanho que se pedir (`jpegDe`) e um PNG transparente.

Em desenvolvimento os arquivos ficam em `apps/api/uploads/`, fora do git. Nos testes, num
diretório temporário do sistema.

### Enviando um e-mail

Monte a mensagem num módulo puro (`src/signup/messages.ts` é o modelo) e envie com
`enviarSemDerrubar` (`src/email/index.ts`) **depois** do commit da transação — nunca dentro dela:
um rollback não desfaz um e-mail enviado. `enviarSemDerrubar` registra a falha no log e devolve
`false`, em vez de lançar: o que a transação gravou continua valendo, e quem chamou decide o que
dizer à pessoa.

Duas regras do conteúdo:

- **Só texto, sem HTML** (`MensagemDeEmail` nem tem campo para isso).
- **E-mail para um endereço digitado por terceiros não repete texto livre** vindo de fora — nome
  de estabelecimento, nome de pessoa. Senão a rota vira um jeito de mandar qualquer texto, pelo
  nosso remetente, para qualquer endereço (SECURITY.md, "Cadastro de estabelecimento").

Em desenvolvimento, os e-mails vão para o Mailpit (`pnpm db:up`): abra http://localhost:8025 para
ver o que a API enviou. Nos testes, `EMAIL_DRIVER=memory` (no `vitest.config.ts`) guarda tudo na
memória — a instância `email` é um `MemoryEmailProvider`, com a caixa em `enviados`,
`limpar()` entre os testes e `falharOsProximos(n)` para simular o servidor fora do ar.

### Criando um estabelecimento

Pelo mesmo caminho do cadastro: `criarEstabelecimento` (`src/signup/service.ts`), dentro de um
`withTenant` aberto com `tenantContextFromSignup(await novoIdDeEstabelecimento())`. Ele grava o
estabelecimento, a assinatura e o dono com o papel OWNER numa transação; o seed faz assim.

Precisa do plano e do papel no banco: rode `seedPlans()` e `seedRbac()` antes — o `beforeAll` de
`tests/signup-routes.test.ts` é o modelo. A fixture `criarTenantComUsuario` continua separada de
propósito: ela cria papéis próprios de cada teste e nenhum plano, que é o que a maioria dos testes
precisa provar.

### Acessando dados de um tenant

Sempre por `withTenant(context, tx => …)`. O client `db` cru só serve para dados globais e para
o registro de tenants; usá-lo com dado de estabelecimento devolve zero linhas, porque o RLS não
encontra contexto. O sintoma é "sumiu tudo", não um vazamento — falha fechada, mas confusa se
você não souber a causa.

A única leitura de dado de estabelecimento fora de `withTenant` é a do login:
`tenantDoEmail(email)` (`src/auth/login-lookup.ts`) acha o estabelecimento de um e-mail, e só o
`tenant_id` dele. Precisa achar um usuário pelo e-mail sem saber o tenant — o "esqueci minha
senha" da Fase 25, por exemplo? Use essa função e siga com `withTenant`; não crie outra consulta
fora de contexto nem outra policy. O teste `rls-guard` recusa policy nova que não filtre pelo
tenant.

### Entrando no painel

O login é um só, em [localhost:5173/entrar](http://localhost:5173/entrar), com e-mail e senha —
sem informar o estabelecimento. Os donos do seed estão no README (`ze@exemplo.com` e os outros,
senha `cardapio123`).

O e-mail é único na plataforma. Se `pnpm db:migrate` falhar em `users_email` num banco antigo de
desenvolvimento, há o mesmo e-mail em dois estabelecimentos — de antes da Fase 18b, quando isso
era permitido. Para ver quais:

```sql
select u.email, t.slug from users u join tenants t on t.id = u.tenant_id
where u.email in (select email from users group by 1 having count(*) > 1);
```

Apague o estabelecimento que sobra (`delete from tenants where slug = '…'`, que leva o usuário em
cascata) ou recrie o banco com `pnpm db:reset`, `pnpm db:migrate` e `pnpm db:seed`.

### Acrescentando uma tela ao painel

O painel é a rota `/:tenantSlug/admin`, com a moldura `AdminLayout`; cada tela é uma rota filha.
Para uma tela nova:

1. **Uma entrada em `apps/web/src/features/admin/menu.ts`**: rótulo, caminho, ícone e a permissão
   que a API exige para os dados da tela. Sem a permissão, a pessoa não vê o item. Tela do dia a
   dia fica no grupo de cima; a que se ajusta de vez em quando leva `rodape: true` e fica no fim
   do menu, abaixo de "Ver cardápio" — como Configurações.
2. **Uma rota filha em `apps/web/src/App.tsx`**, debaixo de `/:tenantSlug/admin`.
3. **A página**, que lê o slug, o usuário e as permissões de `usePainel()` e dá o título da aba com
   `useTituloDoPainel('…')`. Ela **não** confere sessão, não abre conexão ao vivo e não tem botão
   de sair: isso é da moldura.
4. **O ícone**, em `components/icons.tsx` — SVG no próprio código.
5. **Se a tela resolve um passo de "o que falta para receber pedidos"**, o `onde` dela em
   `PASSOS` (`features/admin/checklist.ts`) — o caminho e o que o link diz: o passo ganha um link
   no Início.

**Uma tela de cadastro** — lista e páginas de criar e editar — segue o Cardápio (Fase 23): a
lista em `pages/AdminMenuPage.tsx`, as páginas em `AdminProductPage.tsx` e
`AdminCategoryPage.tsx`, e o módulo `features/admin/catalog.ts`, com as consultas, as gravações e
as regras puras da lista. Algumas escolhas que valem para as próximas:

- criar leva à página do item (ou de volta à lista, com o aviso no `state` da navegação);
- o botão "Criar" fica sempre ligado — clicar mostra o que falta; o "Salvar" de uma edição, só com
  alteração (`RodapeDeSalvar`, com `rotulo` e `explicarFalha`);
- excluir usa `Excluir` (`catalog-parts.tsx`), que confirma numa janela e mostra a recusa da API;
- imagem usa `ImageField`, passando o envio e a remoção do item (`useImagemDoProduto`);
- a gravação guarda a resposta da API no cache (`setQueryData`) e marca para releitura o que
  depende dela — o plano, a lista do Início;
- estado só da tela, como quais categorias estão abertas, vai no `sessionStorage`, sempre dentro de
  `try`/`catch`: numa janela anônima ou com o armazenamento bloqueado, a tela tem de funcionar
  igual, só sem lembrar;
- um botão cujo texto é feito de vários blocos (nome e resumo) recebe o nome acessível pronto, em
  `aria-label`: o navegador junta os blocos de jeitos diferentes, e o jsdom de outro.

**Uma aba nova em Configurações** não é item do menu: é uma entrada em `ABAS_DAS_CONFIGURACOES`
(`menu.ts`) e uma rota filha de `configuracoes` em `App.tsx`. A página da aba não tem `<h1>` nem
título próprio — são da moldura, `SettingsTabs`. Siga uma das que existem (`hours.ts` e
`HoursForm.tsx`, por exemplo):

- o módulo da aba tem o schema do formulário, `paraFormulario` e os dois hooks, de ler e de salvar;
- o hook de salvar guarda a resposta no cache e marca a lista do Início para ser relida;
- o formulário usa as peças de `components/form-parts.tsx` — `Secao`, `Marcavel`,
  `RodapeDeSalvar`, `Carregado` — e, para reais e minutos, os campos de `form-fields.ts`;
- regra entre dois campos leva `when: comCamposValidos([...], …)`, ou a pessoa só vê o erro depois
  de corrigir todos os outros;
- o campo que participa de uma regra mas **não** guarda o erro dela leva
  `register('campo', { onChange: reconferir({ formState, trigger }, 'campoDoErro') })`. Sem isso,
  corrigir por ele deixa a mensagem na tela até o próximo "Salvar";
- no teste de "a mensagem sumiu", use `sumiuDeVez` (`tests/AdminSettingsTabs.test.tsx`), que olha,
  espera e olha de novo. Um `waitFor` sozinho passa no instante em que a mensagem sai, mesmo que
  o formulário a ponha de volta logo depois;
- lista de campos (horários, regiões) usa `useFieldArray`, e o caminho do campo sai de uma função
  tipada (`campoDoIntervalo`), porque o lint não aceita número solto em texto montado.

Mobile-first: desenhe a tela para o celular e acrescente o que a tela grande permite (`sm:`, `lg:`),
nunca o contrário. A moldura já cuida do menu — gaveta no celular, coluna fixa a partir de `lg`.

Nos testes, `abrirComLocal('/lanchonete-do-ze/admin/…')` com a sessão guardada abre a tela dentro
da moldura; veja `abrirInicio` em `tests/AdminPanel.test.tsx`. O jsdom não aplica CSS: a gaveta se
testa pelo `aria-expanded` do botão "Menu", não por estar ou não visível.

A moldura já tem um `role="status"` — o indicador "Conectando… / Ao vivo". Um aviso da tela
("Produto salvo.") se acha pelo texto, e não por `findByRole('status')`, que pega o indicador.
Para uma tela de cadastro, `tests/AdminMenu.test.tsx` tem uma API simulada que guarda estado
(`simularApi`): criar, alterar, reordenar e excluir mudam o que as leituras seguintes devolvem,
e o teste percorre o fluxo inteiro, da lista à página e de volta.

### Testando uma página

Monte `AppRoutes` dentro de `MemoryRouter` e de um `QueryClient` novo por teste, e simule a API
com `vi.stubGlobal('fetch', …)` — os helpers estão em `apps/web/tests/helpers/pagina.tsx`. Uma
store do Zustand é global ao módulo: zere-a no `beforeEach` com `setState` e limpe o
`localStorage`. Regra de
apresentação vai para um módulo sem React e ganha teste unitário próprio.

### Testando o WebSocket

Na API, `app.injectWS(url)` abre uma conexão de verdade sem porta — mas **não repassa ao servidor
o fechamento do cliente**. Para provar o que acontece ao fechar, suba a aplicação numa porta
(`app.listen({ port: 0 })`) e use o `WebSocket` nativo do Node. No web, os testes trocam o
`WebSocket` global por um falso que o teste controla (`tests/AdminPanel.test.tsx`).

### Expondo dados na área pública

Rotas sem login ficam em `src/routes/public-*.ts`, sob `/api/v1/public`, e o contexto nasce de
`tenantContextFromPublicSlug` depois de `findTenantBySlug` — recusando estabelecimento suspenso
com o mesmo 404 de um inexistente. A resposta é montada **campo a campo**, nunca com spread de
uma linha do banco, e o teste da rota procura campos internos na resposta inteira. Ao expor um
campo novo, acrescente-o nos três lugares: o serviço, o schema de resposta e, se for interno, a
lista de proibidos do teste.

Nos testes de componente, busque pelo que a pessoa usuária percebe — papel, rótulo, texto — e não
por classe CSS ou `data-testid`. Um teste que quebra ao renomear uma classe não estava testando
comportamento.

---

## Antes de adicionar uma dependência

1. A stack atual já resolve?
2. Qual complexidade ela traz junto?
3. Tem manutenção ativa?
4. É compatível com as versões fixadas? (`npm view <pkg> peerDependencies`)
5. Precisa rodar script de instalação? Se sim, entra em `onlyBuiltDependencies` — decisão
   consciente.

Versões são **fixadas exatas**, sem `^`. Atualização é ato deliberado, não efeito colateral de
um install.

---

## Renomear o produto

O nome é provisório por decisão. Ele vive em **um** lugar no código de aplicação:

**[`packages/config/src/app.ts`](packages/config/src/app.ts)** — `name`, `shortName`, `slug`,
`description`. Componentes, páginas, o `<title>` e a descrição do HTML leem daqui. Nenhum
componente contém o nome em texto literal.

Fora do código de aplicação, existem estes pontos, todos de edição pontual:

| Local                           | Campo                                         |
| ------------------------------- | --------------------------------------------- |
| `package.json` (raiz)           | `name` — identificador interno, nunca exibido |
| `docker-compose.yml`            | `name`, `container_name`                      |
| `.env.example` / `.env`         | `POSTGRES_DB`, `APP_DB_USER`, `DATABASE_URL`  |
| `docker/postgres/init/*.sh`     | apenas a mensagem de log                      |
| `README.md` e demais documentos | título e texto                                |

Os pacotes internos usam escopo `@repo/`, e não o nome do produto — justamente para que renomear
não toque em nenhum `import`.

---

## Git

Branch por etapa ou funcionalidade. Mensagens no imperativo, explicando o motivo quando não for
óbvio:

```
feat(api): validar variáveis de ambiente na inicialização
fix(web): aplicar tema do tenant antes da primeira renderização
docs: registrar a decisão de usar TypeScript 6
```

`.env` nunca é commitado. `.claude/settings.local.json` também não — é preferência de máquina.
