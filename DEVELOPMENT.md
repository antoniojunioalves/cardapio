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

**Os scripts de inicialização do PostgreSQL rodam uma vez só**, quando o volume está vazio.
Depois de alterar qualquer arquivo em `docker/postgres/init/`, use `pnpm db:reset` — sem isso a
mudança simplesmente não acontece e o sintoma é um erro de permissão inexplicável.

**A suíte de testes precisa do banco de pé.** Rode `pnpm db:up` antes de `pnpm test`.

---

## Comandos

| Comando            | Efeito                                                           |
| ------------------ | ---------------------------------------------------------------- |
| `pnpm dev`         | API e web em watch, em paralelo                                  |
| `pnpm verify`      | typecheck → lint → test → build                                  |
| `pnpm typecheck`   | TypeScript em todos os pacotes                                   |
| `pnpm lint`        | ESLint com informação de tipos                                   |
| `pnpm test`        | Vitest em todos os pacotes — **exige `pnpm db:up`**              |
| `pnpm build`       | Build de produção                                                |
| `pnpm format`      | Prettier, escrevendo                                             |
| `pnpm db:up`       | Sobe o PostgreSQL                                                |
| `pnpm db:down`     | Derruba os containers, preservando o volume                      |
| `pnpm db:reset`    | Apaga o volume e recria — necessário ao alterar scripts de init  |
| `pnpm db:generate` | Gera migration a partir do schema; não toca no banco             |
| `pnpm db:migrate`  | Aplica as migrations, com a role que tem DDL                     |
| `pnpm db:seed`     | Dois estabelecimentos e dois planos de demonstração; idempotente |

Num pacote só:

```bash
pnpm --filter @repo/api test
pnpm --filter @repo/web dev
```

`pnpm verify` é o que precisa passar antes de considerar qualquer tarefa concluída.

---

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
└── db/            schema Drizzle, migrations, seed, catálogos

apps/web/src/
├── components/    genéricos, sem regra de negócio
├── features/      por domínio
├── pages/         composição de rotas
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

Resposta de API **não** vai para o Zustand.

### Formulários

React Hook Form + Zod. O schema é a única definição: tipo e validação saem dele. Mensagens de
erro em português e voltadas à pessoa que está preenchendo — "Informe um telefone com DDD", não
"invalid format".

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
app.get('/produtos', { preHandler: requireAuth('products:read') }, handler)
app.get('/perfil', { preHandler: requireAuth() }, handler) // só autenticação
```

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

Nunca grave URL nem caminho no banco — grave a **chave** devolvida por `novaChaveDeImagem`, e
converta para URL na resposta com `urlDaImagem`. Nunca use o nome enviado pelo cliente para
montar a chave. `src/settings/images.ts` é o modelo a seguir, inclusive na ordem das operações:
grava o arquivo novo, atualiza o banco, e só depois do commit apaga o antigo.

Em desenvolvimento os arquivos ficam em `apps/api/uploads/`, fora do git. Nos testes, num
diretório temporário do sistema.

### Acessando dados de um tenant

Sempre por `withTenant(context, tx => …)`. O client `db` cru só serve para dados globais e para
o registro de tenants; usá-lo com dado de estabelecimento devolve zero linhas, porque o RLS não
encontra contexto. O sintoma é "sumiu tudo", não um vazamento — falha fechada, mas confusa se
você não souber a causa.

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
