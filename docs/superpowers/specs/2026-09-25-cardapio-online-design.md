# Registro de design — fundação do Cardápio Online

**Data:** 2026-09-25
**Escopo:** Fase 0 (arquitetura e documentação) e Fase 1 (monorepo, tooling, Docker, PostgreSQL)

Este é o registro da conversa de design: o que foi decidido, quais alternativas foram descartadas
e com que evidência. A referência viva da arquitetura é [ARCHITECTURE.md](../../../ARCHITECTURE.md);
este documento não é atualizado — ele preserva o estado do raciocínio nesta data.

---

## Problema

SaaS multi-tenant de cardápio digital para estabelecimentos de alimentação. Cada estabelecimento
administra catálogo, pedidos, clientes e configurações. O cliente final acessa um cardápio
público sem login e finaliza o pedido pelo WhatsApp do estabelecimento.

Restrição declarada como a mais importante: **um tenant jamais pode acessar dados de outro**, e a
aplicação precisa ser estruturada de modo a tornar esse erro difícil de cometer — não apenas
proibido por convenção.

---

## Decisões

### 1. Isolamento entre tenants

Duas perguntas independentes foram separadas.

**Onde os dados ficam.** Avaliados: banco único com schema único e coluna `tenant_id`; um schema
PostgreSQL por tenant; um banco por tenant.

Escolhido o **banco único com schema único**. Schema-por-tenant exigiria rodar cada migration N
vezes, com risco de deixar tenants em versões divergentes do schema, e o Drizzle Kit não faz esse
fan-out — a ferramenta seria nossa. Com ~30 tabelas e centenas de estabelecimentos, o catálogo
chega a dezenas de milhares de relations. Banco-por-tenant tem custo fixo por tenant incompatível
com um estabelecimento em plano gratuito. O produto tem muitos tenants pequenos e homogêneos,
que é exatamente o caso do modelo compartilhado.

**O que impede o vazamento.** Avaliados: só camada de aplicação; só RLS; ambos.

Escolhidos **ambos**, mais um teste-guarda. São defesas contra falhas diferentes: a camada de
aplicação faz o código correto ser o caminho natural, o RLS faz o código incorreto falhar
fechado, e o teste-guarda impede que uma tabela nova escape da política. Isoladamente, a primeira
é disciplina que se fura e a segunda não guia ninguém.

A reversibilidade foi condição para aceitar o modelo compartilhado: com o `TenantContext` como
costura, migrar um tenant de plano CUSTOM para banco dedicado altera apenas a obtenção da
conexão dentro de `withTenant`, sem tocar em serviços.

### 2. Dinheiro em centavos inteiros

Todo valor monetário é `integer` de centavos, com a unidade no nome da coluna.

A motivação decisiva foi concreta: `12.10 * 3 + 7.30` resulta em `43.599999999999994` em
JavaScript. Com pedido mínimo de R$ 43,60 — requisito do produto — a comparação `>=` falha e o
backend rejeita um pedido válido.

Um exemplo que eu havia proposto de memória (`19.99 * 3`) foi verificado e **não** apresenta o
problema; foi substituído pelos casos acima, que foram executados.

### 3. TypeScript 6.0.3 em vez de 7.0.2

O TypeScript 7 é a versão estável mais recente, mas `typescript-eslint@8.70.1` declara
`typescript >=4.8.4 <6.1.0`, e nenhuma versão publicada (`latest`, `canary`) o suporta. Adotar
TS 7 custaria o lint com informação de tipos. O TS 6.0.3 é a linha estável atual e está dentro
do range.

### 4. Arquitetura de temas

Valores em CSS custom properties dentro do `@theme` do Tailwind 4; TypeScript expõe apenas os
nomes tipados apontando para essas variáveis. Nenhum valor é duplicado, e o tema de um tenant é
aplicado em runtime sobrescrevendo `:root` — sem rebuild e sem bundle por tenant.

Alternativa descartada: valores canônicos no TypeScript gerando o CSS em build. Tornaria cada
tema um artefato compilado, inviabilizando troca por tenant em runtime.

### 5. Escopo `@repo/` nos pacotes internos

O nome do produto é provisório. Com `@repo/config`, renomear não toca em nenhum import — o
find-and-replace que se queria evitar.

### 6. Ordem das fases ajustada

Três movimentos, cada um porque algo posterior dependia do item movido: configurações do
estabelecimento para a Fase 5 (o cardápio público precisa delas), storage para a Fase 6 (produto
nasce com imagem) e auditoria para a Fase 4 (o requisito é "desde o início").

---

## Descoberta durante a validação

A forma ingênua da policy de RLS tem uma falha que só aparece em execução:

```sql
-- Com o contexto definido como string vazia, isto lança
-- ERROR: invalid input syntax for type uuid: ""
USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
```

A forma adotada envolve o valor em `nullif`, o que faz o contexto vazio simplesmente não casar:

```sql
USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
```

Comportamento verificado em PostgreSQL 18.6, conectado como a role de aplicação:

| Cenário                                 | Resultado                   |
| --------------------------------------- | --------------------------- |
| Contexto nunca definido                 | 0 linhas                    |
| Contexto definido como string vazia     | 0 linhas, sem erro          |
| Tenant A, `SELECT` sem `WHERE`          | apenas as linhas de A       |
| Tenant A, `UPDATE` mirando linha de B   | `UPDATE 0`                  |
| Tenant A, `INSERT` com `tenant_id` de B | rejeitado pelo `WITH CHECK` |

Também confirmado que a role de aplicação tem `rolsuper = false` e `rolbypassrls = false` — sem
isso, toda policy seria ignorada em silêncio.

---

## Dívida registrada no mesmo ato da decisão

A identificação do cliente por telefone recupera o endereço, o que significa que digitar o número
de outra pessoa revela o endereço dela. Entra no MVP por conversão, mas foi registrada como
dívida de privacidade com plano de quitação em duas etapas (mascaramento, depois OTP) em
[SECURITY.md](../../../SECURITY.md) e [ROADMAP.md](../../../ROADMAP.md), com mitigações já
previstas: confirmação explícita, registro em auditoria e rate limiting dedicado.
