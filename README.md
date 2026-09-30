# Cardápio Online

SaaS multi-tenant de cardápio digital e pedidos online para estabelecimentos de alimentação.
Cada estabelecimento é um **tenant** com seu próprio catálogo, clientes, pedidos, usuários e
configurações. O cliente final acessa o cardápio público sem login, monta o pedido e o envia
pelo WhatsApp do estabelecimento.

> **O nome "Cardápio Online" é provisório.** Ele vive num único arquivo:
> [`packages/config/src/app.ts`](packages/config/src/app.ts). Para renomear o produto, veja o
> checklist em [DEVELOPMENT.md](DEVELOPMENT.md#renomear-o-produto).

**Status atual: Fase 15 concluída.** As fases 16 a 28 fecham o MVP — cadastro aberto, telas de
gestão e o sistema no ar (ver
[PROJECT_PLAN.md](PROJECT_PLAN.md#o-que-falta-para-o-mvp)). O cliente final já vê o cardápio, monta o carrinho, envia o
pedido — recalculado no servidor — e o manda ao WhatsApp do estabelecimento: com `pnpm dev`, abra
[localhost:5173/lanchonete-do-ze](http://localhost:5173/lanchonete-do-ze) (das 18:00 às 02:00,
de terça a domingo), a `pizzaria-da-esquina` (almoço e jantar, de segunda a sábado) ou a
`padaria-pao-quente` (das 08:00 às 18:00, todos os dias). Os pedidos chegam ao vivo no painel, em
`/{estabelecimento}/admin` — por exemplo,
[localhost:5173/lanchonete-do-ze/admin](http://localhost:5173/lanchonete-do-ze/admin) — que
também avisa quando o plano se aproxima do limite de pedidos do mês. Acompanhe em [PROJECT_PLAN.md](PROJECT_PLAN.md).

Depois de `pnpm db:seed`, dá para entrar com:

| Estabelecimento       | E-mail            | Senha         |
| --------------------- | ----------------- | ------------- |
| `lanchonete-do-ze`    | `ze@exemplo.com`  | `cardapio123` |
| `pizzaria-da-esquina` | `ana@exemplo.com` | `cardapio123` |
| `padaria-pao-quente`  | `bia@exemplo.com` | `cardapio123` |

E o cardápio público, sem login: `curl http://localhost:3333/api/v1/public/lanchonete-do-ze/menu`.

No checkout, o telefone **(11) 98765-4321** é de uma cliente de demonstração nos dois
estabelecimentos, com endereços diferentes em cada um.

---

## Stack

Versões fixadas e verificadas em conjunto — a instalação resolve sem nenhum conflito de peer.

| Camada    | Tecnologias                                                           |
| --------- | --------------------------------------------------------------------- |
| Base      | Node 24.11 · TypeScript 6.0 · pnpm 10.20 · Turborepo 2.11             |
| Backend   | Fastify 5.12 · Drizzle ORM 0.45 · PostgreSQL 18 · Zod 4.6 · pino 10.3 |
| Frontend  | Vite 8.3 · React 19.3 · Tailwind CSS 4.3                              |
| Qualidade | ESLint 10.11 · typescript-eslint 8.70 · Prettier 3.9 · Vitest 5.0     |
| Infra     | Docker Compose                                                        |

**TypeScript 6, e não 7:** o TypeScript 7 já é estável, mas o `typescript-eslint` declara
`typescript >=4.8.4 <6.1.0` e não o suporta em nenhuma versão publicada. Adotá-lo hoje custaria
o lint com informação de tipos — a rede que sustenta a qualidade do projeto. A decisão está
registrada em [ARCHITECTURE.md](ARCHITECTURE.md#typescript-6-em-vez-de-7).

Bibliotecas da stack que ainda não aparecem aqui — React Router, TanStack Query, Zustand,
React Hook Form, Drizzle — entram no `package.json` na fase em que forem de fato usadas, para
que as dependências declaradas correspondam ao que o código realmente importa.

---

## Pré-requisitos

| Ferramenta | Versão | Observação                                                        |
| ---------- | ------ | ----------------------------------------------------------------- |
| Node.js    | 24.x   | `nvm use` lê o `.nvmrc` na raiz                                   |
| pnpm       | ≥ 10   | `npm i -g pnpm` ou via corepack                                   |
| Docker     | ≥ 24   | Para o PostgreSQL. No WSL 2, ative a integração no Docker Desktop |

## Começando

```bash
nvm use                  # Node 24, conforme .nvmrc
pnpm install
cp .env.example .env     # valores padrão já funcionam em desenvolvimento
pnpm db:up               # sobe o PostgreSQL
pnpm dev                 # sobe API e frontend juntos
```

Depois disso:

- Frontend — <http://localhost:5173>
- API — <http://localhost:3333/health>
- Documentação da API — <http://localhost:3333/docs>

O `.env` é obrigatório: a API não sobe sem `DATABASE_URL`. Um valor padrão apontaria em silêncio
para o banco errado, o que é pior do que falhar na inicialização.

## Comandos

| Comando            | O que faz                                           |
| ------------------ | --------------------------------------------------- |
| `pnpm dev`         | API e web em modo watch, em paralelo                |
| `pnpm build`       | Build de produção de todos os pacotes               |
| `pnpm typecheck`   | TypeScript em todo o monorepo                       |
| `pnpm lint`        | ESLint com análise de tipos                         |
| `pnpm test`        | Vitest em todos os pacotes — **exige `pnpm db:up`** |
| `pnpm verify`      | typecheck + lint + test + build, na ordem           |
| `pnpm format`      | Prettier, escrevendo                                |
| `pnpm db:up`       | Sobe o PostgreSQL via Docker Compose                |
| `pnpm db:down`     | Derruba os containers (o volume de dados permanece) |
| `pnpm db:reset`    | Apaga o volume e recria do zero                     |
| `pnpm db:logs`     | Acompanha os logs do PostgreSQL                     |
| `pnpm db:generate` | Gera migration a partir do schema Drizzle           |
| `pnpm db:migrate`  | Aplica as migrations no banco                       |
| `pnpm db:seed`     | Popula dados de demonstração (idempotente)          |

Para rodar num pacote só: `pnpm --filter @repo/api test`

Os testes da API rodam contra um PostgreSQL real, no banco `cardapio_test` — separado do de
desenvolvimento. É proposital: as policies de isolamento entre tenants não podem ser
comprovadas com mock.

## Estrutura

```
cardapio-online/
├── apps/
│   ├── api/          Fastify — API HTTP
│   └── web/          Vite + React — cardápio público e área administrativa
├── packages/
│   ├── config/       Identidade do produto + bases de tsconfig e eslint
│   └── shared/       Regras e schemas Zod usados pela API e pela web
├── docker/
│   └── postgres/     Scripts de inicialização do banco
└── docs/             Documentação de apoio e specs de design
```

## Documentação

| Arquivo                            | Conteúdo                                                  |
| ---------------------------------- | --------------------------------------------------------- |
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | Estado atual, fases, microtasks, o que já foi feito       |
| [MVP.md](MVP.md)                   | O que está dentro e o que está explicitamente fora do MVP |
| [ROADMAP.md](ROADMAP.md)           | Funcionalidades futuras e dívidas assumidas               |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Decisões técnicas, multi-tenancy, temas, dados            |
| [SECURITY.md](SECURITY.md)         | Autenticação, autorização, isolamento entre tenants, LGPD |
| [DEVELOPMENT.md](DEVELOPMENT.md)   | Convenções, padrões, estrutura de pastas, como contribuir |
