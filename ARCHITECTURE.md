# Arquitetura

Este documento registra **decisões** e o porquê delas. Quando uma decisão for revista, edite
aqui em vez de criar um documento novo — o histórico fica no git.

---

## 1. Visão geral

Monorepo pnpm + Turborepo com dois aplicativos e um pacote compartilhado.

```
Navegador                    apps/web        Vite · React · Tailwind
    │                            │
    │  HTTP/JSON  ──────────────►│
    │                            ▼
    │                        apps/api        Fastify · Zod · pino
    │                            │
    │                            ▼
    │                      PostgreSQL 18     Drizzle ORM · RLS
```

O frontend é uma SPA. Não há renderização no servidor: SEO não é prioridade do MVP, e adotar
SSR agora custaria complexidade em toda decisão seguinte por um benefício que o produto ainda
não precisa. Registrado no ROADMAP.

---

## 2. Multi-tenancy

O requisito mais importante do sistema. Duas perguntas independentes: **onde os dados de cada
tenant ficam** e **o que impede um tenant de ler os dados de outro**.

### 2.1 Onde os dados ficam: banco único, schema único, coluna `tenant_id`

Todos os tenants compartilham as mesmas tabelas, discriminados por `tenant_id`.

Consideramos schema-por-tenant e banco-por-tenant. Schema-por-tenant exigiria rodar cada
migration N vezes, com risco de deixar tenants em versões diferentes do schema; o Drizzle Kit
não faz esse fan-out, então a ferramenta seria nossa. Com ~30 tabelas e centenas de
estabelecimentos, o catálogo do PostgreSQL chega a dezenas de milhares de relations, degradando
autovacuum e planejamento. Banco-por-tenant tem custo fixo por tenant que não fecha com um
estabelecimento em plano gratuito.

O produto tem **muitos tenants pequenos e homogêneos** — nenhum vai pedir uma tabela
customizada. É o cenário em que o modelo compartilhado é claramente o certo.

### 2.2 O que impede o vazamento: duas camadas independentes

**Camada 1 — PostgreSQL Row-Level Security.** Toda tabela com `tenant_id` tem RLS habilitado e
forçado, com policy comparando `tenant_id` ao tenant do contexto da conexão. Um `WHERE`
esquecido retorna **zero linhas**, nunca linhas de outro tenant.

**Camada 2 — camada de acesso a dados com escopo de tenant.** O client cru do Drizzle não é
exportado para os módulos de domínio. Serviços recebem um `TenantContext` e acessam dados por
`withTenant(ctx, …)`, que abre a transação e injeta o contexto antes de qualquer query.

As duas resolvem problemas diferentes e por isso ambas existem: a camada 2 faz o código correto
ser o caminho natural; a camada 1 faz o código incorreto falhar fechado. Só a camada 2 é
disciplina, que uma pessoa distraída fura. Só a camada 1 não guia ninguém a escrever certo.

**Camada 3 — teste-guarda.** Um teste consulta o catálogo do PostgreSQL e falha se qualquer
tabela com coluna `tenant_id` estiver sem `ENABLE` e `FORCE ROW LEVEL SECURITY`. Assim uma
tabela nova sem policy quebra o CI, não a produção.

### 2.3 As roles de conexão

Duas condições precisam valer ao mesmo tempo, e cada uma cobre uma falha diferente.

**Primeira: a role não pode ignorar policies.** No PostgreSQL, superusuários e roles com
`BYPASSRLS` ignoram silenciosamente toda policy de RLS. Se a aplicação conectasse como
`postgres`, o isolamento existiria no papel e não teria efeito nenhum em execução — a pior
categoria de falha, porque tudo aparenta funcionar.

**Segunda: a role não pode desligar as policies.** Esta foi descoberta durante a Fase 2 e
corrige o que este documento afirmava antes. O dono de uma tabela **pode remover o RLS dela**:

```sql
ALTER TABLE produtos NO FORCE ROW LEVEL SECURITY;
ALTER TABLE produtos DISABLE ROW LEVEL SECURITY;
```

Comprovado em execução. O `FORCE ROW LEVEL SECURITY` sujeita o dono às policies **nas
consultas**, mas não o impede de removê-las. Portanto, se a aplicação conectasse como dona das
tabelas, uma injeção de SQL bem colocada derrubaria o isolamento de todos os tenants de uma vez.

Daí a separação em duas roles, em
[`docker/postgres/init/`](docker/postgres/init/):

| Role                | Poderes                                    | Quem usa                       |
| ------------------- | ------------------------------------------ | ------------------------------ |
| `cardapio_migrator` | dono do schema e das tabelas, DDL completo | apenas o comando de migrations |
| `cardapio_app`      | `SELECT`, `INSERT`, `UPDATE`, `DELETE`     | a API servindo requisições     |

Nenhuma das duas tem `SUPERUSER` ou `BYPASSRLS`. A `cardapio_app` não é dona de nada, então não
tem como alterar nem desligar policy alguma. A conexão com DDL existe somente durante
`pnpm db:migrate` e nunca fica disponível ao processo que atende requisições.

Tabelas criadas por migrations nascem acessíveis à aplicação por `ALTER DEFAULT PRIVILEGES` —
sem isso, cada migration precisaria lembrar de um `GRANT`, e a tentação de "resolver logo"
concedendo privilégio demais desfaria a separação na prática.

Verificado em execução, e coberto por testes que falham se alguém afrouxar isso:

```
cardapio_migrator | super=false | bypassrls=false | dono das tabelas
cardapio_app      | super=false | bypassrls=false | CREATE TABLE  → permission denied
                                                  | CREATE SCHEMA → permission denied
postgres          | super=true  | bypassrls=true  | nunca usada pela aplicação
```

### 2.4 Forma da policy

```sql
ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <tabela> FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON <tabela>
  USING      (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

Três detalhes, cada um por um motivo concreto:

- **`nullif(…, '')`** — sem ele, um contexto definido como string vazia faz `''::uuid` lançar
  `invalid input syntax for type uuid`. Comprovado em teste durante a Fase 1. Com `nullif`, o
  contexto vazio simplesmente não casa e a consulta devolve zero linhas.
- **segundo argumento `true`** em `current_setting` — devolve `NULL` quando a variável nunca foi
  definida, em vez de lançar erro.
- **`WITH CHECK`** além de `USING` — `USING` filtra leitura e o alvo de `UPDATE`/`DELETE`;
  `WITH CHECK` é o que impede **inserir** uma linha marcada com o `tenant_id` de outro.

O `FORCE` continua sendo aplicado, mesmo com o migrator sendo o dono: ele garante que qualquer
acesso pela conexão de migration também respeite as policies. Ele não é, porém, o que protege
contra a remoção das policies — isso é papel da separação de roles da seção anterior.

Comportamento verificado em execução real (PostgreSQL 18.6, role `cardapio_app`):

| Cenário                                 | Resultado                   |
| --------------------------------------- | --------------------------- |
| Contexto nunca definido                 | 0 linhas                    |
| Contexto definido como string vazia     | 0 linhas, sem erro          |
| Tenant A, `SELECT` sem `WHERE`          | apenas as linhas de A       |
| Tenant A, `UPDATE` mirando linha de B   | `UPDATE 0`                  |
| Tenant A, `INSERT` com `tenant_id` de B | rejeitado pelo `WITH CHECK` |

### 2.5 Onde fica a fronteira da transação

O contexto é injetado com `set_config('app.tenant_id', $1, true)` — o terceiro argumento `true`
o torna **local à transação**, o que o faz desaparecer no commit ou rollback e elimina qualquer
vazamento entre requisições que reutilizem a mesma conexão do pool.

A transação envolve a **unidade de trabalho**, não a requisição inteira. Abrir transação por
requisição seguraria uma conexão do pool durante um upload de imagem e não faz sentido algum em
conexões WebSocket de longa duração.

Não usamos uma role de banco por tenant: roles no PostgreSQL são globais ao cluster, e milhares
delas incham o catálogo e exigem um passo de provisionamento a cada estabelecimento novo.

### 2.6 O pipeline da requisição

```
Requisição
   │
   ├─ Autenticação ........ quem é o usuário? (área administrativa)
   │
   ├─ TenantContext ....... qual tenant? NUNCA vindo do corpo ou da query
   │                         · área admin:    do usuário autenticado
   │                         · área pública:  do tenantSlug da URL, resolvido no backend
   │
   ├─ Autorização ......... este usuário pode fazer isto neste tenant? (RBAC)
   │
   ├─ Serviço ............. regra de negócio
   │
   ├─ withTenant(ctx) ..... abre transação, injeta app.tenant_id
   │
   └─ PostgreSQL .......... RLS aplica a policy
```

Um `tenantId` que chegue no corpo, na query string ou num header é **ignorado**. Rota do tipo
`GET /api/v1/products?tenantId=123` não existe no projeto.

### 2.7 Como um TenantContext nasce

Não existe construtor genérico. Há duas funções, e cada uma nomeia uma origem legítima:

```ts
tenantContextFromUser(tenantId) // área administrativa: do vínculo do usuário no banco
tenantContextFromPublicSlug(tenantId) // área pública: do tenantSlug da URL, já resolvido
```

A ausência de um `tenantContextFrom(qualquerCoisa)` é o ponto. Para usar um `tenantId` vindo do
corpo da requisição seria preciso inventar uma terceira função e batizá-la de algo como
`tenantContextFromRequestBody` — o que torna o problema visível em qualquer revisão de código.
Errar por acidente fica mais difícil do que errar por decisão.

### 2.8 A tabela `tenants` não tem RLS, e isso é deliberado

Ela é o registro que traduz um `slug` num tenant, e essa tradução acontece **antes** de existir
contexto — é ela que o estabelece. Uma policy `id = current_tenant` tornaria o cardápio público
irresolvível: seria preciso já saber o tenant para poder descobri-lo.

O que ocupa o lugar do RLS aqui é o formato do repositório: ele expõe `findTenantBySlug` e
`findTenantById`, e nada que se pareça com `findTenants(criteria)`. Uma consulta genérica sobre
o registro seria justamente o buraco que o RLS fecha nas outras tabelas.

Decorre daí uma guarda de projeto: **nada sensível entra em `tenants`**. Dados de cobrança,
documento do responsável e afins vão para `tenant_settings` (Fase 5), que é tenant-scoped e
protegida. Se um dia parecer conveniente adicionar uma coluna sensível aqui, a resposta certa é
criá-la lá.

O teste-guarda cobre os dois lados dessa decisão: toda tabela com `tenant_id` precisa de RLS
habilitado, forçado e com policy; e toda tabela **sem** `tenant_id` precisa estar declarada
numa lista de tabelas globais, com o motivo. Assim, criar uma tabela nova obriga a escolher
explicitamente entre "é da plataforma" e "é de estabelecimento" — a segunda pergunta é a que um
teste baseado só em `tenant_id` jamais conseguiria fazer.

### 2.9 Caminho para isolamento físico, se um dia for preciso

O `TenantContext` é a costura que mantém essa porta aberta. Migrar um tenant de plano CUSTOM
para banco dedicado muda **onde a conexão é obtida** — dentro de `withTenant` — e não toca em
nenhum serviço nem repositório. Não há trabalho a fazer hoje por isso; só não fechar a porta.

---

## 3. Identificação do tenant

MVP: caminho na URL.

```
/{tenantSlug}            →  /lanchonete-do-ze
```

A resolução fica isolada num `TenantResolver`, de modo que subdomínio
(`tenant.dominio.com`) e domínio próprio entrem depois trocando só essa peça. Nenhum dos dois
está implementado — ambos no ROADMAP.

---

## 4. Modelo de dados

### 4.1 Dinheiro em centavos inteiros

Todo valor monetário é `integer` representando centavos, e o nome da coluna carrega a unidade
(`price_in_cents`). A divisão por 100 acontece apenas na formatação, na borda da interface.

Ponto flutuante acumula erro em soma: `12.10 * 3 + 7.30` dá `43.599999999999994` em JavaScript.
Com pedido mínimo de R$ 43,60, a comparação `>=` falharia e o backend rejeitaria um pedido
válido. Em centavos, `1210 * 3 + 730 === 4360` é exato.

Há um efeito colateral favorável: o driver `pg` devolve `numeric` como **string**. Com decimal
no banco, seria preciso converter para float — recriando o problema — ou adotar uma biblioteca
de decimal. Inteiro dispensa a escolha.

**Desconto percentual** (cupons, futuro) é a única operação que gera fração. A regra de
arredondamento será explícita e definida num módulo único de cálculo de preço.

### 4.2 Identificadores

UUIDv7 como chave primária: ordenado por tempo, o que preserva localidade de índice, sem ser
sequencial previsível.

**Gerado no banco**, com o `uuidv7()` nativo do PostgreSQL 18, e não na aplicação. Assim uma
migration, um seed ou um `INSERT` manual produzem id válido sem depender de passar pelo ORM — e
não custa dependência nenhuma. A aplicação continua livre para informar um id explícito quando
precisar conhecê-lo antes da escrita, para logar ou emitir evento.

UUIDv7 revela o instante de criação. Por isso:

- **`orderNumber`** sequencial **por tenant** existe para exibição ("Pedido #152"), inclusive na
  mensagem do WhatsApp. É de uso interno do tenant.
- Quando houver acompanhamento público de pedido, a URL usará um **código público aleatório**
  separado. Nem o UUID nem o número sequencial vão para URL pública.

### 4.3 Tempo

Todos os instantes são `timestamptz` gravados em UTC. Cada tenant tem um campo `timezone`
(padrão `America/Sao_Paulo`). Horário de funcionamento sem o fuso do estabelecimento é bug
garantido no primeiro tenant fora do horário de Brasília.

### 4.4 Snapshot no pedido

`order_items` guarda nome, preço unitário, opções e adicionais **copiados** no momento da
criação. Alterar o produto depois não pode alterar pedido antigo — é registro histórico, e em
alguns aspectos documento fiscal.

---

## 5. Backend

### 5.1 Camadas

```
routes/        HTTP: validação de entrada com Zod, serialização de saída
services/      regra de negócio, recebe TenantContext
repositories/  acesso a dados via withTenant, nunca o client cru
db/            schema Drizzle e migrations
```

Regra que sustenta o resto: **um repositório nunca é chamado sem `TenantContext`** para dados
com escopo de tenant.

### 5.1.1 Conexão e migrations

Pool do `pg` com Drizzle por cima, em `src/db/`. Três detalhes que não são óbvios:

- **O pool tem um handler de `error`.** Sem ele, um erro numa conexão ociosa — o banco
  reiniciando, a rede caindo — emite um evento sem ouvinte e **derruba o processo inteiro**.
  Verificado: com o handler, a API sobrevive à queda do PostgreSQL e volta a responder sozinha
  quando ele retorna.
- **`casing: 'snake_case'`** traduz `priceInCents` para `price_in_cents` automaticamente,
  mantendo as duas convenções sem declarar o nome da coluna em cada campo.
- **As migrations usam outra conexão**, com a role `migrator`. Ver a seção 2.3.

`pnpm db:generate` compara o schema TypeScript com as migrations existentes e não toca no banco.
`pnpm db:migrate` aplica, com a role que tem DDL.

### 5.1.2 Sondas

- **`/health` (liveness)** — o processo está vivo. **Não consulta o banco.** Se consultasse, uma
  oscilação do banco faria o orquestrador matar e reiniciar processos saudáveis, justamente no
  momento em que o sistema está frágil.
- **`/ready` (readiness)** — dá para mandar tráfego, e para isso consulta o banco. Responde
  **503** quando não dá, que é o sinal que tira a instância do balanceador sem reiniciá-la.

A mensagem de falha traz a causa raiz (`connect ECONNREFUSED …`), e não o embrulho do ORM
(`Failed query: select 1`) — é o que quem está depurando precisa ler.

### 5.1.3 Limite de requisições

Limite global em memória, com o 429 no mesmo formato de erro de todas as outras respostas. É o
piso: login e a consulta de cliente por telefone terão limites próprios e bem mais estritos nas
fases em que forem criados.

O contador vive na memória do processo; com mais de uma instância em produção isso vira um
limite por instância, e aí entra um armazenamento compartilhado. Registrado no ROADMAP.

### 5.1.4 OpenAPI

A especificação é gerada a partir dos próprios schemas Zod das rotas. Como é o mesmo schema que
valida a requisição em execução, a documentação não tem como divergir do comportamento real —
que é o problema crônico de OpenAPI mantido à mão.

A interface em `/docs` fica desabilitada em produção. Não é uma brecha expor o mapa da API, mas
entrega de graça o trabalho de descobrir rotas e formatos.

### 5.2 Nada que venha do frontend é confiável

O backend recalcula, a partir dos seus próprios dados: preço, disponibilidade, validade das
opções e adicionais, taxa de entrega, pedido mínimo, se o estabelecimento está aberto, subtotal
e total. O frontend envia apenas `productId`, `quantity` e as escolhas — nunca valores.

### 5.3 Erros

Formato único:

```json
{ "error": { "code": "NOT_FOUND", "message": "…", "requestId": "…", "details": [] } }
```

`code` é estável e destinado a tratamento programático; `message` é para humanos e pode mudar.
O `requestId` vai na resposta de propósito: liga o que o usuário vê à linha de log do servidor.
Erros inesperados são registrados por inteiro e respondem com mensagem genérica em produção.

### 5.4 Observabilidade

pino com saída JSON, legível no terminal em desenvolvimento. Cada requisição recebe um id
(reaproveitado do header `x-request-id` quando o proxy já envia um). Campos sensíveis —
`authorization`, `cookie`, `password`, `token` — são redigidos no logger, não no ponto de
chamada, para que não dependa de ninguém lembrar.

`/health` e `/ready` ficam fora do prefixo `/api/v1`: são sondas de infraestrutura, não contrato
público. Rotas de domínio ficam sob `/api/v1`.

---

## 6. Frontend

### 6.1 Divisão de estado

| Ferramenta     | Responsabilidade                                                  |
| -------------- | ----------------------------------------------------------------- |
| TanStack Query | estado de servidor — produtos, categorias, pedidos, configurações |
| Zustand        | estado de cliente — carrinho, preferências, UI                    |

A separação evita o erro comum de tratar resposta de API como estado global, que leva a cache
manual, invalidação manual e dados velhos na tela.

### 6.2 Organização

```
src/
├── components/   genéricos e sem regra de negócio — Button, Input, Modal…
├── features/     por domínio — catalog, cart, checkout, orders…
├── pages/        composição de rotas
├── theme/        tokens de design
├── services/     clientes HTTP
└── hooks/ utils/ stores/
```

`components/` é escrito para poder ser extraído como biblioteca própria: nada ali importa de
`features/`. Componente com regra de negócio mora em `features/<nome>/components/`.

### 6.3 Temas

Os **valores** vivem em CSS custom properties, em
[`apps/web/src/theme/tokens.css`](apps/web/src/theme/tokens.css), dentro do bloco `@theme` do
Tailwind 4 — que gera, da mesma declaração, a variável CSS e o utilitário (`--color-primary`
produz `bg-primary`).

O TypeScript em `theme/*.ts` expõe apenas os **nomes** tipados, apontando para essas variáveis.
Nenhum valor é duplicado, então os dois lados não podem divergir.

Duas camadas:

- **paleta bruta** — `--color-brand-600`, `--color-neutral-200`
- **camada semântica** — `--color-primary`, `--color-surface`, `--color-content`

Componentes usam a camada semântica. Um componente escrito com `bg-surface` continua correto
quando o tenant troca a cor; escrito com `bg-white`, não.

Como são custom properties, o tema de um tenant é aplicado em runtime sobrescrevendo `:root` —
sem rebuild e sem bundle por tenant. `applyTenantTheme()` faz isso e permite sobrescrever apenas
a camada semântica: deixar um tenant redefinir a paleta inteira abriria espaço para combinações
ilegíveis.

Não há editor de temas, apenas a arquitetura que torna um possível sem tocar em componentes.

---

## 7. Storage de imagens

Interface `StorageService` com `LocalStorageProvider` no MVP. O domínio nunca fala com o sistema
de arquivos diretamente, de modo que um provider S3 entre depois sem alterar nada além da
composição. Fase 6.

---

## 8. Tempo real

WebSocket para entregar pedidos novos ao painel administrativo. Polling não é a solução
principal: num painel de cozinha o atraso é percebido na hora.

O canal é **por tenant**, e a autorização é verificada no handshake — um socket jamais recebe
evento de outro tenant. Fase 13.

---

## 9. Planos e limites

Modelo genérico desde o início: `plans`, `plan_features`, `subscriptions`. Nada limita o sistema
a dois planos — FREE, STARTER, ADVANCED, PREMIUM e CUSTOM cabem sem migration de estrutura.

As tabelas nascem na Fase 3, junto do modelo de tenant. A verificação de limites é Fase 14. Não
há cobrança no MVP e nenhum gateway foi escolhido.

Atenção à distinção: **o cliente final não paga online** pelo pedido no MVP (escolhe a forma de
pagamento que usará no recebimento). O que é preparado aqui é a assinatura **do estabelecimento**
pela plataforma.

---

## 10. Decisões registradas

### TypeScript 6 em vez de 7

TypeScript 7.0.2 é estável, mas `typescript-eslint@8.70.1` declara `typescript >=4.8.4 <6.1.0`.
Nenhuma versão publicada — `latest`, `canary` — suporta o TS 7. Adotá-lo significaria abrir mão
do lint com informação de tipos, que é o que detecta promise não aguardada, acesso inseguro a
`any` e narrowing incorreto. TypeScript 6.0.3 é a linha estável atual e está dentro do range.

Revisar quando o typescript-eslint publicar suporte a TS 7.

### Docker Compose cobre o PostgreSQL, não os aplicativos

O compose sobe o banco. API e frontend rodam nativamente com `pnpm dev`.

Containerizar um monorepo pnpm com hot reload exige montagem de volume e resolução de
`node_modules` que atrapalham mais do que ajudam em desenvolvimento, e o ganho seria pequeno
diante de `pnpm install && pnpm db:up && pnpm dev`. Os Dockerfiles de API e web entram junto da
fase de deploy, quando o alvo for imagem de produção — que é um artefato diferente de um
ambiente de desenvolvimento.

### Um pacote compartilhado, não vários

Existe apenas `packages/config`, com a identidade do produto e as bases de tsconfig e eslint. Um
`packages/shared` com schemas Zod comuns aos dois lados entra quando houver de fato schema
compartilhado — Fase 3 em diante. Pacote criado antes do uso vira indireção sem conteúdo.

### Pacotes internos com escopo `@repo/`, não `@cardapio/`

O nome do produto é provisório. Com `@repo/config`, renomear o produto não toca em nenhum
import. É precisamente o find-and-replace que se quis evitar.
