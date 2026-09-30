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

Não existe construtor genérico. Há quatro funções, e cada uma nomeia uma origem legítima:

```ts
tenantContextFromUser(tenantId) // área administrativa: do vínculo do usuário no banco
tenantContextFromPublicSlug(tenantId) // área pública: do tenantSlug da URL, já resolvido
tenantContextFromToken(tenantId) // refresh token e link de confirmação: do prefixo do token
tenantContextFromSignup(tenantId) // cadastro: o estabelecimento que está sendo criado
```

As duas últimas entraram na Fase 17. A de token nomeia o que a renovação de sessão já fazia (ela
usava a de slug público); a de cadastro existe porque ali não há tenant anterior de onde tirar o
contexto — o id é gerado pelo banco antes da transação que cria o estabelecimento (6.8).

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

### 2.9 Chaves estrangeiras compostas: o RLS não protege referências

**A checagem de chave estrangeira do PostgreSQL roda por fora do RLS.** Descoberto e comprovado
na Fase 7a: o Tenant A não enxerga a categoria do Tenant B — o `SELECT` devolve zero linhas —,
mas uma FK simples `category_id → categories(id)` aceita que A crie um produto apontando para
ela, bastando saber o UUID.

O RLS protege o que se lê e o que se grava. Não protege **para onde uma referência aponta**.

A correção é a FK incluir o tenant dos dois lados:

```sql
FOREIGN KEY (tenant_id, category_id) REFERENCES categories (tenant_id, id)
```

com `UNIQUE (tenant_id, id)` na tabela referenciada. Aí as duas camadas se completam: apontar
para a categoria de B mantendo o próprio tenant é barrado pela FK, e fingir ser B é barrado pelo
`WITH CHECK` do RLS.

A mesma falha existia em três FKs das Fases 3 e 4 (`user_roles`, `refresh_tokens` e
`audit_logs` apontando para `users`). Não era explorável — em todos os caminhos o id vinha do
servidor —, mas era o formato exato de um IDOR esperando a rota "atribuir papel ao usuário".
Foram corrigidas na mesma fase.

A FK de `audit_logs` usa `ON DELETE SET NULL (actor_user_id)`, anulando só o ator. O `SET NULL`
comum numa FK composta anularia também o `tenant_id`, que é obrigatório, e a remoção de um
usuário falharia. O Drizzle não expressa essa forma, então ela está numa migration escrita à mão.

**O teste-guarda passou a ter três verificações:** RLS em toda tabela com `tenant_id`, declaração
de toda tabela sem `tenant_id`, e `tenant_id` dos dois lados em toda FK entre tabelas
tenant-scoped.

### 2.10 Caminho para isolamento físico, se um dia for preciso

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
piso: login (5/min), identificação por telefone e envio de pedido (10/min) têm limites próprios.

**De onde vem o IP:** `TRUST_PROXY` (desligado por padrão). Atrás de um proxy reverso, precisa
estar ligado — senão todo cliente aparece com o IP do proxy e o limite vira um só para todos. Sem
proxy, precisa estar desligado — senão qualquer cliente escolhe o próprio IP pelo
`X-Forwarded-For` e escapa dos limites.

O corpo JSON tem limite de 64 KB (`JSON_BODY_LIMIT_BYTES`); o upload de imagem, o seu.

O contador vive na memória do processo; com mais de uma instância em produção isso vira um
limite por instância, e aí entra um armazenamento compartilhado. Registrado no ROADMAP.

### 5.1.4 OpenAPI

A especificação é gerada a partir dos próprios schemas Zod das rotas. Como é o mesmo schema que
valida a requisição em execução, a documentação não tem como divergir do comportamento real —
que é o problema crônico de OpenAPI mantido à mão.

A interface em `/docs` fica desabilitada em produção. Não é uma brecha expor o mapa da API, mas
entrega de graça o trabalho de descobrir rotas e formatos.

A **coleção do Postman** (`apps/api/postman/`) sai dessa mesma especificação, por `pnpm postman`:
rota nova entra sozinha, e só o que a especificação não sabe — corpos de exemplo com valores que
fazem sentido, e os scripts que guardam token e ids — é escrito à mão, em
`src/postman/exemplos.ts`. Um teste confere que o arquivo do repositório é o que o gerador produz
hoje e que cada exemplo passa na validação da própria rota: a coleção não tem como ficar para
trás sem o `pnpm verify` acusar.

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

## 6. Autenticação e autorização

### 6.1 Senhas

argon2id, com os parâmetros mínimos recomendados pela OWASP escritos de forma explícita no
código — 19 MiB de memória, 2 iterações, paralelismo 1. Um padrão invisível nunca é revisitado
quando o hardware barato fica mais rápido.

O formato do argon2 carrega algoritmo, parâmetros e salt na própria string, então elevar o custo
no futuro não exige migração de dados: senhas antigas continuam sendo verificadas com os
parâmetros com que foram criadas.

Quando o e-mail não existe, o login **gasta o mesmo tempo** de uma verificação real. Sem isso,
responder na hora para e-mail inexistente e demorar ~15 ms para e-mail existente transforma o
endpoint num oráculo de quais endereços estão cadastrados.

### 6.2 Tokens

|           | Forma                 | Vida    | Onde é verificado            |
| --------- | --------------------- | ------- | ---------------------------- |
| Acesso    | JWT HS256             | 15 min  | Assinatura, sem ida ao banco |
| Renovação | Valor aleatório opaco | 30 dias | Hash SHA-256 contra o banco  |

**O refresh token não é um JWT, e é uma escolha.** Ele já precisa de consulta ao banco para
saber se foi revogado — então a assinatura não compraria nada que a consulta não dê, e traria
junto toda a superfície de verificação de JWT. No banco fica só o hash; um vazamento da tabela
não entrega sessão nenhuma.

O verificador do token de acesso **fixa a lista de algoritmos aceitos**. Sem isso, um token
declarando `alg: none` — ou trocando HMAC por RSA — seria aceito pela biblioteca. Há um teste
que apresenta exatamente esse token e exige a recusa.

**O refresh token vai num cookie `httpOnly`** (`refresh_token`, `SameSite=Strict`, `Path=/api/v1/auth`,
`Secure` em produção), nunca no corpo da resposta: o JavaScript da página não o vê, e um script
injetado não tem como roubá-lo. A renovação e o logout leem o cookie; o corpo fica como
alternativa para clientes de API sem cookie.

O refresh token leva o tenant como prefixo (`{tenantId}.{aleatório}`). É uma **dica de
roteamento, não uma credencial**: sem ela seria impossível encontrar a linha, já que a tabela é
protegida por RLS e o contexto viria justamente do token. Trocar o prefixo muda o token inteiro
e o hash procurado deixa de existir — a dica só estreita a busca, nunca a alarga.

### 6.3 Rotação e detecção de roubo

Cada renovação revoga o token apresentado e emite outro. Isso encurta a vida de um token
roubado e, mais importante, torna o roubo **detectável**: se um token já rotacionado reaparecer,
ou o legítimo ou o ladrão está usando uma cópia, e não há como saber qual. A resposta é revogar
todas as sessões do usuário.

Um detalhe que só apareceu em teste: a revogação em massa **não pode** lançar o erro de dentro
da transação. `withTenant` é uma transação, e a exceção causaria rollback — desfazendo em
silêncio a revogação e o registro de auditoria que acabaram de ser escritos. A defesa se
anularia. A detecção vira um valor de retorno, a transação confirma, e só então o erro é
lançado.

### 6.4 Papéis e permissões

Papéis e permissões são **globais**: OWNER, ADMIN e STAFF significam o mesmo em todo
estabelecimento, e duplicá-los por tenant só criaria oportunidade de divergirem. O vínculo entre
usuário e papel é que é tenant-scoped.

O vínculo tem `tenant_id` próprio, e não apenas o do usuário. Sem a coluna, a tabela ficaria
fora do alcance do RLS e dependeria de um JOIN correto para não vazar; com ela, a policy protege
a linha diretamente.

Permissões seguem `recurso:acao` (`products:create`). Formato previsível é o que permite
conferir permissão comparando strings, sem tabela de tradução no meio.

### 6.5 A cadeia de proteção de uma rota

`requireAuth()` é a única forma exportada de proteger uma rota, e devolve a cadeia pronta:

```ts
app.get('/produtos', { onRequest: requireAuth('products:read') }, handler)
```

**Em `onRequest`, nunca em `preHandler`.** O Fastify valida o corpo antes do `preHandler`: ali,
quem não está logado receberia 400 com o formato esperado da rota, e o servidor leria o corpo de
quem nem se identificou. `tests/route-guard.test.ts` percorre o inventário de rotas registradas e
exige 401 sem login em toda rota do painel — e que toda rota aberta esteja numa lista com o
motivo.

Autenticar e autorizar em duas peças separadas permitiria montá-las na ordem errada, e
`[authorize('x'), authenticate]` falharia em silêncio — `authorize` não encontraria usuário e o
erro pareceria de sessão, não de configuração. Devolvendo a cadeia pronta, a ordem deixa de ser
uma decisão de quem usa.

A autenticação **consulta o banco a cada requisição** em vez de confiar apenas no conteúdo do
token. O custo é uma consulta indexada; o que se compra é que desativar um usuário valha
imediatamente, e não só quando o token dele expirar. Num sistema onde funcionário é desligado,
quinze minutos de acesso extra é tempo demais. Se virar gargalo, a resposta é um cache curto,
não confiar no token.

### 6.6 Super Admin

Tabela separada de `users`, e não um campo booleano nela. Um super admin não pertence a
estabelecimento nenhum, então em `users` precisaria de `tenant_id` nulo — e a policy compara
`tenant_id = current_tenant`, que com NULL nunca casa. A linha ficaria invisível para todo
mundo, inclusive para ela mesma: um usuário incapaz de se autenticar.

De quebra, fica impossível um usuário de tenant virar super admin por um UPDATE descuidado numa
coluna booleana.

No MVP, o Super Admin não cria estabelecimentos: o cadastro é aberto, pela página inicial (6.8), e
a plataforma modera por comando — suspender, reativar, trocar o plano (Fase 19). A tabela fica para
o painel da plataforma, no ROADMAP.

### 6.8 Cadastro de estabelecimento

Aberto, no plano gratuito, sem pagamento (Fase 17). É o primeiro passo da visão de produto — landing
page, escolher o plano, assinar, cadastrar-se e usar na hora —, e a parte paga fica no ROADMAP.

**Uma transação só.** `criarEstabelecimento` (`signup/service.ts`) grava o estabelecimento, a
assinatura do FREE, o dono e o papel OWNER; o cadastro acrescenta, na mesma transação, o aceite
dos termos, o link de confirmação e a sessão. Para isso o id do estabelecimento é pedido ao banco
(`select uuidv7()`) **antes** da transação: o contexto nasce dele, e a tabela `tenants` — sem RLS —
aceita o insert dentro do contexto. Falhou qualquer passo, não sobra estabelecimento pela metade. O
seed usa a mesma função; as configurações continuam nascendo sob demanda (`ensureSettings`).

**`PENDING` até a confirmação.** O estabelecimento nasce com um terceiro status. O painel funciona
na hora; o cardápio público — que só aceita `ACTIVE` — responde o mesmo 404 de um endereço
inexistente, e com ele a identificação por telefone e o envio de pedido. Confirmar o e-mail do dono
leva a `ACTIVE`; a confirmação só sai de `PENDING`, então um link guardado não desfaz uma suspensão.

**O link de confirmação** segue o desenho do refresh token: `{tenantId}.{256 bits}`, só o hash no
banco (`email_verification_tokens`, com RLS), o prefixo como dica de roteamento. Vale 48 horas e
uma vez; o segundo clique responde "já confirmado". O token vai no **fragmento** do link
(`/confirmar-email#token=…`), que o navegador não envia ao servidor nem repassa como `Referer`. O
reenvio vai sempre para quem cadastrou — é a confirmação dele que publica —, com um minuto entre
envios, contado no banco.

**Os e-mails saem depois do commit**, por `enviarSemDerrubar`: se a transação falhasse, nenhum
e-mail teria saído sobre um cadastro inexistente; se o servidor de e-mail falhar, o cadastro vale e
o painel oferece o reenvio. O `EmailService` segue o desenho do storage: uma interface, o provider
escolhido num lugar só (`EMAIL_DRIVER`) — SMTP no Mailpit em desenvolvimento e no provedor em
produção, memória nos testes.

**Endereços reservados** (`SLUGS_RESERVADOS`, em `packages/shared`): o web atende `/:tenantSlug` no
mesmo nível das páginas do produto (`/cadastro`, `/termos`), e a API pública tem `/signup` ao lado de
`/:tenantSlug`. Um estabelecimento num desses endereços ficaria inacessível.

### 6.7 Auditoria

`audit_logs` é **append-only pela própria estrutura**: só existem policies de `select` e
`insert`, e o RLS nega o que nenhuma policy autoriza. Alterar ou apagar uma linha pela aplicação
afeta zero linhas. Um log que a aplicação pode reescrever não serve para auditar a aplicação.

`actorUserId` é anulável com `ON DELETE SET NULL`: remover um usuário não pode apagar o rastro
do que ele fez — some o vínculo, fica o registro.

O registro acontece na **mesma transação** da alteração que descreve. Em transação separada, um
rollback deixaria registro de algo que não aconteceu, ou a operação seria salva e a auditoria
perdida. Ou as duas acontecem, ou nenhuma.

---

## 7. Configurações do estabelecimento

### 7.1 Onde cada coisa mora

`tenants` é o registro público, lido **sem** contexto de tenant para resolver o slug. Tudo que
não deve ser público vai para `tenant_settings`, que é tenant-scoped e protegida por RLS —
endereço, telefone de contato, regras comerciais. Foi a guarda registrada na Fase 3, agora
cumprida.

### 7.2 Horário de funcionamento

Um intervalo por linha, várias linhas por dia. Modelar como um par abre/fecha em colunas da
tabela do tenant tornaria impossível o caso comum de abrir no almoço, fechar à tarde e reabrir à
noite.

**Um intervalo pode atravessar a meia-noite.** Quando o fechamento é menor que a abertura, ele
termina no dia seguinte: 18:00–02:00 é o horário real de boa parte das lanchonetes. Isso faz um
turno valer em dois dias do calendário, e é o caso que quebra implementação ingênua de horário.

`closesAt = opensAt` é proibido por restrição no banco: seria ambíguo entre "vinte e quatro
horas" e "intervalo vazio", e sem resolver essa ambiguidade a regra de travessia deixa de ser
decidível. Funcionamento ininterrupto se escreve 00:00–23:59; suporte a 24 horas de verdade está
no ROADMAP.

O cálculo usa `Intl` com o fuso do tenant, e não aritmética de offset: offset não é constante —
horário de verão muda, e fusos mudam por decisão política. Perguntar ao runtime continua correto
depois que a regra do país muda.

A **pausa manual** (`isAcceptingOrders`) vence qualquer horário cadastrado. Existe porque a
realidade acontece: acabou o gás, a cozinha lotou. Sem ela, a saída seria editar o horário e
lembrar de desfazer depois.

O módulo não conhece banco nem framework — recebe intervalos, fuso e instante, devolve o status.
É o que permite cobri-lo com dezenas de casos de borda em milissegundos.

### 7.3 Entrega

Taxa fixa ou por região. Cálculo por distância depende de geocoding e está no ROADMAP; não
assumir que todo estabelecimento tem a mesma regra é o ponto do modo configurável.

As regiões continuam guardadas quando o modo é fixo — alternar entre os dois não pode apagar um
cadastro que o lojista levou uma tarde montando. Região **inativa é tratada como inexistente**:
desativar precisa impedir pedidos novos, e não apenas sumir da lista, senão um cliente com a
página aberta continuaria conseguindo escolhê-la.

Configuração e regiões são salvas numa transação só. Separadas, haveria um instante com modo já
em `BY_REGION` e nenhuma região cadastrada, visível para quem consultasse o cardápio.

### 7.4 Formas de pagamento

Catálogo global mais uma tabela de junção tenant-scoped, o mesmo desenho de `roles`/`user_roles`.
Global porque "Pix" significa o mesmo em todo estabelecimento, e duplicá-lo por tenant só criaria
grafias divergentes. Acrescentar uma bandeira é um INSERT, não uma migration.

Nenhuma vem habilitada: quem escolhe o que aceita é o lojista. Uma lista que já viesse toda
ligada acabaria com estabelecimento aceitando vale-refeição sem ter máquina. Desabilitar preserva
a linha, para não perder a ordenação quando voltar a habilitar.

**Nenhum pagamento é processado.** No MVP o cliente declara como vai pagar ao receber.

### 7.5 Substituição em vez de CRUD

Horários e regiões são salvos por substituição do conjunto inteiro, não por operação em cada
item. É assim que essas telas são editadas de verdade: abre-se a grade, mexe-se em várias linhas,
salva-se uma vez. Um PATCH por item exigiria da interface um controle de ids sem benefício.

O `DELETE` da substituição não leva filtro de tenant — quem limita o alcance é o RLS. Há um teste
que substitui a semana de um estabelecimento e confirma que a do outro continua intacta.

---

## 8. Catálogo

### 8.1 Categorias

Nome único **sem diferenciar maiúsculas**, por índice em `lower(name)`: "Bebidas" e "bebidas"
lado a lado no cardápio é erro de digitação, não duas categorias. A unicidade é por
estabelecimento — dois estabelecimentos podem ter "Bebidas".

`isActive` esconde a categoria inteira do cardápio público. É diferente da disponibilidade de um
produto, que diz "acabou por hoje".

Excluir uma categoria **com produtos** é recusado com 409 e a contagem, em vez de levá-los junto:
apagar uma categoria não pode tirar trinta produtos do cardápio em silêncio. A FK com `RESTRICT`
é a segunda barreira, para o dia em que a verificação da aplicação for removida.

A reordenação exige a **lista completa** de categorias. Uma lista parcial deixaria as ausentes
intercaladas com a ordem antiga de um jeito que ninguém pediu. A mesma regra recusa um id de
outro estabelecimento, sem precisar de verificação específica: ele não pertence ao conjunto.
As posições são gravadas de dez em dez, deixando espaço para inserir no meio.

### 8.2 Produtos

Preço em centavos inteiros, com teto de R$ 100.000,00 na validação. O teto não é regra de
negócio: é a trava contra um zero a mais digitado sem querer, que colocaria um lanche a
R$ 2.590,00 no cardápio público. Um valor com casas decimais é recusado — o campo é em centavos,
e aceitar `25.9` esconderia o erro de quem achou que era em reais.

`isAvailable` é o controle de estoque do MVP. Estoque com quantidade e baixa automática estão no
ROADMAP.

O preço gravado no produto é o **atual**. Nenhum pedido o lê depois de criado: na Fase 11 ele é
copiado para o item do pedido.

Por isso a exclusão de produto pode ser física: pedidos não dependem dele.

### 8.3 Auditoria de preço e disponibilidade

Além do registro geral de alteração, **troca de preço** e **troca de disponibilidade** geram
registros próprios (`product.price_changed`, `product.availability_changed`), com o antes e o
depois. O histórico de preço de um produto passa a ser uma consulta por ação, e não uma
garimpagem em JSON.

### 8.4 Um id de outro estabelecimento responde 404, não 403

O RLS torna a linha invisível, e o serviço responde "não encontrado". Um 403 confirmaria que o id
existe — informação útil para quem está tentando adivinhar ids de outro estabelecimento.

### 8.5 A troca de imagem vive num lugar só

Logo, capa, categoria e produto usam `trocarImagem`, em `src/storage/replace.ts`. A sequência —
grava o novo, commita, só então apaga o antigo — é sutil demais para existir em quatro cópias.
Com ela extraída, uma tentativa de imagem para um produto inexistente também não deixa arquivo
órfão: o novo é apagado quando a transação falha, e há teste que conta os arquivos.

### 8.6 Personalização: um modelo para tamanho, adicional e remoção

"Tamanho", "Adicionais" e "Remover ingredientes" são todos **grupos de opção**. A estrutura é a
mesma — uma lista de escolhas com preço e um limite de seleções —, e só muda o mínimo e o máximo:

| Grupo      | mín | máx | Opções                            |
| ---------- | --- | --- | --------------------------------- |
| Tamanho    | 1   | 1   | Normal +0 · Grande +R$ 6,00       |
| Adicionais | 0   | 3   | Bacon +R$ 5,00 · Cheddar +R$ 4,00 |
| Remover    | 0   | 3   | Sem cebola · Sem tomate           |

Isso diverge da lista de tabelas do escopo original, que previa `product_addons` à parte. Uma
tabela de adicionais duplicaria a estrutura, e o cálculo de preço da Fase 11 teria duas regras em
vez de uma.

**"Obrigatório" é derivado**, nunca gravado: é `minSelections >= 1`. Gravar os dois permitiria um
grupo obrigatório com mínimo zero, e ninguém saberia qual vale.

**Os grupos são reutilizáveis.** "Adicionais" é criado uma vez e ligado aos dez hambúrgueres;
trocar o preço do bacon é uma edição, não dez. Pedidos antigos não mudam, porque o preço é
copiado para o pedido na Fase 11.

**O acréscimo de preço não pode ser negativo.** O preço base do produto é o do menor tamanho, e
as opções só somam. Com desconto por opção, a soma de um item poderia ficar negativa, e a conta
do pedido precisaria de uma trava a mais que um dia alguém esqueceria.

**Um grupo não pode exigir mais escolhas do que tem opções.** "Escolha 2" com uma opção só torna
o produto impossível de pedir, e ninguém perceberia até o cliente travar no checkout. A regra é
uma função pura, `problemasDoGrupo`, testada sem banco.

Na edição de um grupo, opções com id são alteradas, sem id são criadas, e as ausentes são
removidas. Um id que não pertence ao grupo é recusado — sem isso, editar "Adicionais" poderia
sequestrar uma opção de "Tamanho", ou de outro estabelecimento.

Excluir um **grupo em uso** é recusado: se "Tamanho" sumisse em silêncio, o produto passaria a ser
vendido sem tamanho, pelo preço base.

### 8.7 Combos

Um combo é um **produto do tipo `COMBO`**, com os componentes em `combo_items`. Também diverge do
escopo original, que previa uma tabela `combos`: no cardápio o combo se comporta exatamente como
um produto — categoria, preço, imagem, disponibilidade, ordem, carrinho —, e uma tabela à parte
obrigaria o carrinho e o pedido a tratar dois tipos de item. De quebra, o combo pode ter grupos de
opção, como "escolha a bebida".

- **O tipo é imutável.** Transformar um combo em produto simples deixaria componentes órfãos; o
  contrário, um combo vazio à venda. O PATCH recusa o campo.
- **Combo não contém combo.** A composição viraria árvore, a cozinha e a mensagem do pedido
  teriam de desdobrá-la, e um ciclo seria possível.
- **Excluir um componente é recusado**, dizendo de quais combos ele faz parte: o combo passaria a
  ser vendido pelo mesmo preço com um item a menos.
- A consulta devolve `precoAvulsoEmCentavos` — quanto os itens custariam separados, para o
  cardápio mostrar a economia — e `todosDisponiveis`, falso se algum componente estiver esgotado.
  Um combo com componente esgotado não deve ser vendido; o cardápio público já o marca como
  indisponível (8.8), e o cálculo do pedido, na Fase 11, vai recusá-lo.
- **O preço do combo é fixo**, digitado pelo lojista. Preço por percentual ou por desconto sobre a
  soma dos itens, escolhido por estabelecimento, está no ROADMAP.

### 8.8 Cardápio público

`GET /api/v1/public/{tenantSlug}/menu` resolve o slug, abre o contexto com
`tenantContextFromPublicSlug` e devolve tudo o que a primeira tela precisa numa chamada:
estabelecimento, status, horários, entrega, formas de pagamento e cardápio.

- **Cinco consultas fixas** para o cardápio — categorias, produtos, vínculos com grupos, opções,
  componentes de combo —, independente do número de produtos. Um grupo usado por dez produtos é
  lido uma vez.
- **A disponibilidade é calculada no servidor** por uma regra pura
  (`src/public-menu/availability.ts`): produto esgotado; combo sem componentes ou com componente
  esgotado; grupo obrigatório sem opções disponíveis suficientes. A mesma regra vai ser usada pelo
  cálculo do pedido na Fase 11 — o que o cardápio mostra é informativo, quem recusa é o pedido.
- **A resposta é montada campo a campo** em `src/public-menu/service.ts`, nunca por spread de
  linha do banco: uma coluna nova não pode vazar para o público só por existir.
- **Sem cache** (`Cache-Control: no-cache`): status e disponibilidade mudam a cada minuto.

---

### 8.9 Cliente final e identificação por telefone

`customers` e `customer_addresses` são **por estabelecimento**: o mesmo telefone na lanchonete e
na pizzaria são dois clientes, sem ligação. O dado serve a quem o coletou (SECURITY.md, LGPD), e
a unicidade é `(tenant_id, phone)`. O telefone é guardado normalizado — só dígitos, com o país,
`5511987654321` — e uma CHECK recusa outra forma; a normalização vive em `packages/shared` e é a
mesma no formulário e na API. O endereço tem **CEP** (só os 8 dígitos, também com CHECK),
obrigatório no schema e primeiro campo do formulário, porque é por ele que a futura consulta aos
Correios vai preencher o resto. A coluna é anulável só para os endereços gravados antes dela. O endereço **não** guarda a região de entrega (ligá-los está no ROADMAP): as regiões são
salvas por substituição do conjunto e mudam de id. O cliente nasce no primeiro pedido (Fase 11);
não há conta com senha no MVP.

`POST /api/v1/public/{tenantSlug}/customers/identify` reconhece quem já pediu. Como telefone não
prova identidade (SECURITY.md, seção 5), a resposta é deliberadamente pobre: primeiro nome e, de
cada endereço, rua, bairro e número mascarado — o CEP não sai. **O endereço completo nunca volta ao navegador** —
o pedido referencia o endereço salvo pelo id, e o servidor o completa. Com isso, "revelar o
endereço de quem digitou o telefone errado" deixa de ser possível por esta rota; o que ainda sai é
nome, rua e bairro, até o OTP.

A rota é POST (o telefone não vai para a URL, que acaba em logs), tem limite próprio de 10
requisições por minuto por IP, responde `no-store` e audita cada identificação que encontra
alguém. A resolução do slug é a mesma do cardápio, em `src/tenant/public.ts`.

---

### 8.10 Pedidos

`POST /api/v1/public/{tenantSlug}/orders` cria o pedido. O corpo (`novoPedidoSchema`, em
`packages/shared`) traz ids, quantidades, escolhas, os dados do checkout e o total que o
cliente viu — **nenhum preço**.

**O cálculo usa a montagem do cardápio público.** `montarCardapioPublico` (8.8) roda dentro da
transação do pedido, e `orders/pricing.ts`, um módulo puro, recalcula sobre ela: aberto,
modalidade, disponibilidade, opções, preço, pedido mínimo, taxa, forma de pagamento e troco.
Assim o que o cardápio mostra e o que o pedido aceita saem da mesma regra. O cálculo devolve
todos os problemas de uma vez (422, `ORDER_REJECTED`); total diferente do visto responde 409
(`PRICE_CHANGED`) sem gravar nada.

**Tudo é copiado para o pedido** (4.4): cliente, endereço, região, pagamento e valores em
`orders`; nome, tipo, preço unitário já com opções, quantidade e composição do combo em
`order_items`; grupo, opção e acréscimo em `order_item_options`. O item guarda o `productId` sem
chave estrangeira — o produto pode sair do cardápio, o pedido fica.

**Número por estabelecimento** (4.2) numa tabela contadora (`order_counters`), incrementada com
`INSERT ... ON CONFLICT DO UPDATE ... RETURNING` na transação do pedido: a linha trava até o
commit, então pedidos simultâneos não repetem número, e o rollback o devolve. Uma `SEQUENCE` seria
global, e não volta no rollback.

**Idempotência:** a chave gerada no navegador é única por estabelecimento; repetir o envio
devolve o pedido já criado, inclusive quando dois envios chegam juntos.

**Cliente e endereço:** o cliente nasce no primeiro pedido; o existente mantém o nome guardado.
O checkout preenche o nome com o primeiro nome da identificação; quando o pedido chega com
exatamente esse primeiro nome, o pedido registra o nome completo guardado (`nomeDoPedido`).
Endereço salvo só vale se for do dono do telefone; endereço novo igual a um salvo reaproveita o
existente.

**Status** (`orders/status.ts`): `RECEIVED → ACCEPTED → PREPARING → READY → OUT_FOR_DELIVERY →
COMPLETED`, só avançando, podendo pular etapas; `OUT_FOR_DELIVERY` só em entrega; `CANCELLED`
de qualquer status não final, com motivo. A atualização só grava se o status ainda for o lido
(`WHERE status = de`), e a mudança vai para a auditoria. As rotas do painel
(`/api/v1/admin/orders`) listam, detalham e mudam o status; a tela é das próximas fases.

### 8.11 Mensagem do WhatsApp

`orders/whatsapp.ts`, um módulo puro, monta a mensagem do pedido — número, itens com opções,
observações e composição do combo, valores, entrega ou retirada, pagamento com troco, cliente — e
o link `https://wa.me/{número}?text=…`. A criação do pedido a guarda em `orders.whatsapp_message`
e a devolve na resposta (`whatsapp: { url, message }`); o reenvio com a mesma chave devolve o
mesmo texto.

A mensagem passa pelo navegador e pelo WhatsApp de quem pediu, então só leva o que essa pessoa
pode ver: endereço salvo **mascarado**, endereço digitado completo, e o nome digitado. Na
confirmação, o envio é um link que a pessoa toca — abrir sozinho depois da resposta da rede seria
bloqueado pelo navegador.

---

## 9. Frontend

### 9.1 Divisão de estado

| Ferramenta     | Responsabilidade                                                  |
| -------------- | ----------------------------------------------------------------- |
| TanStack Query | estado de servidor — produtos, categorias, pedidos, configurações |
| Zustand        | estado de cliente — carrinho, preferências, UI                    |

A separação evita o erro comum de tratar resposta de API como estado global, que leva a cache
manual, invalidação manual e dados velhos na tela.

### 9.2 Organização

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

### 9.3 Rotas e dados

| Rota                          | Página                                                 |
| ----------------------------- | ------------------------------------------------------ |
| `/`                           | verificação do ambiente, até existir página do produto |
| `/:tenantSlug`                | cardápio público                                       |
| `/:tenantSlug/checkout`       | finalizar pedido                                       |
| `/:tenantSlug/pedido-enviado` | confirmação do pedido                                  |
| `/:tenantSlug/admin`          | login do painel                                        |
| `/:tenantSlug/admin/pedidos`  | pedidos ao vivo                                        |
| qualquer outra                | não encontrado                                         |

No cardápio, `?produto={id}` abre a janela do produto e `?carrinho` abre o carrinho. Morar na URL
faz o "voltar" do celular fechar a janela em vez de sair do cardápio.

`/:tenantSlug` casa com um segmento só; as rotas administrativas, quando vierem, ficam sob um
prefixo próprio para nunca colidirem com um slug.

Os dados do cardápio passam pelo TanStack Query (`features/menu/api.ts`), com recarga a cada
minuto — status e esgotados mudam sozinhos. As regras de apresentação ficam em
`features/menu/presentation.ts`, sem React, e são testadas como funções puras. **Nenhuma decide
negócio**: aberto, disponível e preço chegam prontos da API.

### 9.4 Carrinho

O carrinho vive no navegador, numa store do Zustand persistida no `localStorage`
(`features/cart/store.ts`), **um por estabelecimento**, com o slug como chave local.

**O item guarda escolhas, não preço:** produto, opções por grupo, quantidade e observação. Na hora
de mostrar, `resolverCarrinho` (`features/cart/cart.ts`) confere cada item contra o cardápio atual
do TanStack Query e calcula o preço de exibição. Produto que saiu, esgotou, opção indisponível ou
grupo obrigatório novo marcam a linha, que sai do subtotal. Assim o estado de cliente (o que foi
escolhido) não duplica o estado de servidor (quanto custa, o que existe) — a divisão de 9.1.

A regra de escolha (`features/cart/selection.ts`) aplica mínimo e máximo e soma os acréscimos. Ela
existe para guiar o cliente; **quem decide é o servidor**: na Fase 11 o pedido chega como entrada
hostil e é validado e precificado do zero, com a regra de disponibilidade de 8.8.

O que volta do `localStorage` passa por `sanearCarrinhos` antes de entrar na store: formato
conferido item a item, quantidade limitada a 1–50, observação a 140 caracteres.

### 9.5 Checkout

`/:tenantSlug/checkout` usa o cardápio do TanStack Query (em cache, vindo da página anterior) e o
carrinho do Zustand, e monta o formulário com React Hook Form + Zod.

- **Os campos usam os schemas de `packages/shared`** — telefone, nome, endereço —, os mesmos que a
  API aplica. As regras que dependem do estabelecimento (modalidade oferecida, região ativa, forma
  de pagamento aceita, troco a partir do total) estão num schema montado com o cardápio atual
  (`features/checkout/checkout.ts`).
- **Todas as regras rodam num passo só**, para a pessoa ver todos os erros de uma vez: no Zod 4 o
  `superRefine` não roda depois de uma falha na base, então a base aceita texto e o
  `superRefine` valida tudo.
- A saída do schema é `DadosDoCheckout`; `montarPedido` junta a ele os itens do carrinho e o
  total visto. Endereço salvo vai só pelo id.
- **Envio:** uma chave de idempotência por tentativa — reusada depois de falha de rede, trocada
  depois de recusa (422/409), quando a tela também recarrega o cardápio. Aceito o pedido, a
  página vai para `/:tenantSlug/pedido-enviado` com `replace` (o "voltar" não reabre o checkout)
  e o carrinho é esvaziado. O pedido chega à confirmação pelo estado da navegação, nunca pela
  URL.
- Taxa e total são **prévia**; fechado, abaixo do mínimo e item com problema impedem o envio,
  com o motivo na tela. Quem decide é o servidor.
- A identificação é mutação, não consulta: dado pessoal fora do cache, uma chamada por telefone,
  e a resposta vale só para o número que está no campo.

### 9.6 Painel do estabelecimento

`features/admin/`. A **sessão** (`session.ts`) guarda o token de acesso só na memória; o refresh token fica
no cookie `httpOnly` da API, e as chamadas de autenticação o enviam (`credentials: 'include'`).
No `localStorage` ficam só o slug e quem está logado — a sessão é de um estabelecimento. `comSessao` chama a
API com o token e, num 401, renova uma vez e repete; a renovação é única mesmo com várias
chamadas simultâneas, porque duas apresentariam o mesmo refresh token e o servidor as trataria
como roubo.

A **lista** vem do TanStack Query; a **conexão ao vivo** (`live.ts`) só manda relê-la. Os botões
de status saem de `proximosStatus`, a regra de `packages/shared` que a API também aplica.

### 9.7 Temas

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

Não há editor de temas, apenas a arquitetura que torna um possível sem tocar em componentes. O
cardápio público ainda usa o tema do produto: o banco não guarda cores por estabelecimento.

---

## 10. Storage de imagens

### 9.1 Chaves, não caminhos nem URLs

O domínio só conhece **chaves** — `tenants/{tenantId}/logo/{uuid}.png` — por meio da interface
`StorageService`. O MVP tem o `LocalStorageProvider`, que grava em disco; um provider S3 entra
escrevendo outra implementação, sem tocar em regra de negócio.

O banco guarda a chave, e a **URL pública é calculada na leitura**. Gravar a URL congelaria no
banco o provider e o domínio de hoje, e trocar o disco local por S3 exigiria reescrever todas as
linhas.

O nome do arquivo enviado não participa da chave. Acento, espaço, `../` e nomes repetidos deixam
de ser problema porque nunca chegam ao disco. O prefixo do tenant separa os arquivos de cada
estabelecimento, o que facilita apagar tudo de um e, no S3, aplicar política por prefixo.

### 9.2 O tipo vem do conteúdo

O tipo da imagem é detectado pelos **primeiros bytes** do arquivo. Extensão e `Content-Type` do
upload são ignorados, porque quem envia escolhe os dois: um HTML renomeado para `foto.png`
passaria por qualquer checagem baseada neles e seria servido a partir do nosso domínio.

Só JPEG, PNG e WebP são aceitos. **SVG é recusado** por ser XML capaz de carregar `<script>`:
servido pelo nosso domínio, viraria XSS armazenado.

O limite de tamanho é aplicado **enquanto o arquivo chega**, e não depois: um envio de 2 GB é
interrompido no primeiro byte acima do teto, sem ocupar a memória.

### 9.3 Defesa contra path traversal, em duas camadas

As chaves são sempre montadas pelo servidor, então nenhuma deveria conter `../`. Mesmo assim:

1. Toda chave passa por um formato fixo — segmentos com letras, dígitos, hífen e sublinhado, e
   um ponto só na extensão — antes de qualquer provider tocá-la.
2. O provider local resolve o caminho absoluto e confere que ele continua dentro do diretório
   raiz.

A segunda camada existe para o dia em que alguém afrouxar a primeira.

### 9.4 Ordem das operações na troca de imagem

1. Grava o arquivo novo. Se falhar, nada mudou.
2. Aponta o banco para ele, na mesma transação da auditoria. Se a transação falhar, o arquivo
   novo é apagado.
3. **Só depois do commit** apaga o antigo.

Apagar o antigo antes deixaria, num rollback, o banco apontando para um arquivo inexistente — um
logo quebrado no cardápio público. Se o passo 3 falhar, sobra um arquivo sem referência, que é a
falha mais barata possível: ocupa disco e não quebra nada visível.

### 9.5 Entrega

As imagens são servidas em `/uploads/` com dois cabeçalhos diferentes do resto da API:

- **`Cross-Origin-Resource-Policy: cross-origin`.** O helmet define `same-origin` em tudo, o
  que é certo para a API mas bloquearia as imagens: o frontend roda em outra origem, e o
  navegador recusaria o `<img>` em silêncio — aparece só como imagem quebrada, sem erro na tela.
- **`Cache-Control: immutable`.** Cada envio gera uma chave nova, então o conteúdo de uma URL
  nunca muda e pode ficar em cache para sempre.

Com S3, as imagens seriam servidas pelo bucket ou por uma CDN, e este caminho deixaria de existir.

## 11. Tempo real

WebSocket para entregar pedidos novos ao painel administrativo. Polling não é a solução
principal: num painel de cozinha o atraso é percebido na hora.

**De onde vêm os avisos:** `LISTEN`/`NOTIFY` do PostgreSQL (`src/realtime/notify.ts`). Criar um
pedido e mudar o status chamam `pg_notify` **dentro da transação**; o banco entrega o aviso só
depois do commit, então rollback nunca vira alerta e o alerta nunca chega antes do pedido. Cada
instância da API escuta o canal numa conexão própria (fora do pool, porque `LISTEN` a prende),
com reconexão de espera crescente — e todas recebem, sem Redis.

**O que o aviso leva:** só ids (`order.created`, `order.status_changed`). O painel relê a lista
pela API REST, que já confere permissão e isolamento; nenhum dado pessoal passa pelo canal.

**Quem recebe:** `CanalDePedidos` (`src/realtime/channel.ts`, puro) entrega cada aviso só às
conexões do tenant dele. A conexão assina o canal do tenant **do token**.

**Autenticação** (`GET /api/v1/admin/orders/stream`): o token vai na primeira mensagem —
WebSocket de navegador não manda `Authorization`, e token em URL vai para log. A verificação é a
do `requireAuth` (token, usuário recarregado, permissão `orders:read`). Fecha com `4001` sem
token em 5 s, com token inválido ou quando ele expira (o painel renova e reconecta), e `4003` sem
permissão (o painel desiste). A origem é conferida no handshake, porque o navegador não aplica
CORS a WebSocket. Um ping a cada 30 s derruba conexão morta.

**Usuário alterado:** desativar ou mudar o papel de alguém emite `USUARIO_ALTERADO`, e as
conexões dele fecham com `4001` na hora — o painel se autentica de novo com o que valer agora.

**Perda de avisos:** um aviso emitido com a conexão fora se perde. O painel relê a lista ao
conectar e a cada minuto.

---

## 12. Planos e limites

Modelo genérico desde o início: `plans`, `plan_features`, `subscriptions`. Nada limita o sistema
a dois planos — FREE, STARTER, ADVANCED, PREMIUM e CUSTOM cabem sem migration de estrutura.

As tabelas nascem na Fase 3, junto do modelo de tenant. Não há cobrança no MVP e nenhum gateway
foi escolhido.

**Os limites (Fase 14)** — regra pura em `src/plans/limits.ts`, uso em `src/plans/service.ts`:

- **Pedidos por mês** (`maxOrdersPerMonth`): aviso no painel a partir de 80%; atingido o limite,
  tolerância de 10%; passada ela, o cardápio público passa a `NAO_RECEBENDO` e, como o pedido é
  calculado sobre a mesma montagem, é recusado pela mesma regra. Cancelados contam. O mês é o do
  calendário no fuso do estabelecimento, pelo `Intl`.
- **Usuários ativos** (`maxUsers`): limite exato, conferido ao criar e ao reativar.
- `null` é ilimitado; recurso desligado (`isEnabled = false`) vale zero; sem assinatura ativa,
  nada é limitado.
- O cardápio público **não cita o plano** — só "não está recebendo pedidos". O painel
  (`GET /api/v1/admin/plan`) mostra o uso com todas as letras.

Atenção à distinção: **o cliente final não paga online** pelo pedido no MVP (escolhe a forma de
pagamento que usará no recebimento). O que é preparado aqui é a assinatura **do estabelecimento**
pela plataforma.

---

## 13. Decisões registradas

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

### CI sobe o banco pelo mesmo compose

O CI (Fase 16) roda `docker compose up --wait postgres`, e não um _service container_ do GitHub
Actions. O service container sobe antes do checkout, então não enxerga `docker/postgres/init/`:
as duas roles, o banco de testes e os privilégios teriam de ser recriados no workflow, numa
segunda cópia que divergiria da primeira em silêncio. Pelo compose, o caminho é um só — e o CI
passa a provar, a cada execução, que os scripts de init criam do zero um banco onde a suíte
inteira passa.

Consequência: o healthcheck do compose testa pela rede (`pg_isready -h 127.0.0.1`), e não pelo
socket local. Na primeira inicialização, o servidor temporário que roda os scripts de init escuta
só no socket; pelo socket, o `--wait` liberaria os testes antes de as roles existirem. No
desenvolvimento isso nunca aparece, porque o banco já existe.

Os passos do CI são os do `pnpm verify`, e o `pnpm test` roda um pacote por vez, como no CI. As
duas diferenças que sobram — o fuso (UTC no GitHub) e o banco criado do zero — estão no
DEVELOPMENT.md, com o comando que reproduz cada uma.

O workflow foi desligado depois da Fase 16, para agilizar os merges, e está guardado em
`CI_PARA_IMPLEMENTAR_DEPOIS.txt` até a Fase 28.

### Pacote compartilhado só quando há o que compartilhar

`packages/config` guarda a identidade do produto e as bases de tsconfig e eslint.
`packages/shared` entrou na Fase 10, quando apareceu o primeiro schema que os dois lados
validam igual — telefone e endereço, no formulário e na API. Antes disso, seria indireção sem
conteúdo. Ele guarda só isso: regra que só um lado aplica fica nele.

O contrato do cardápio público ainda está copiado no web (`features/menu/types.ts`), por ter
nascido antes do pacote; migrá-lo é mudança à parte.

### Pacotes internos com escopo `@repo/`, não `@cardapio/`

O nome do produto é provisório. Com `@repo/config`, renomear o produto não toca em nenhum
import. É precisamente o find-and-replace que se quis evitar.
