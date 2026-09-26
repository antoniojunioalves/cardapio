# Segurança e privacidade

Estado atual: **Fase 3**. Já estão em vigor o isolamento entre tenants (RLS forçado, roles de
banco separadas, testes que o comprovam), headers de segurança, CORS restrito, limite de
requisições, validação de ambiente e formato de erro que não vaza detalhe interno. Autenticação,
RBAC e auditoria são da Fase 4. Cada seção abaixo diz o que já vale e o que ainda não.

---

## 1. O que estamos protegendo

| Ativo                             | Risco principal                          |
| --------------------------------- | ---------------------------------------- |
| Dados de um tenant                | Acesso por outro tenant                  |
| Dados pessoais de clientes finais | Exposição indevida (LGPD)                |
| Pedidos e valores                 | Manipulação de preço pelo cliente        |
| Credenciais administrativas       | Tomada de conta, escalação de privilégio |

O adversário mais provável não é um invasor externo sofisticado: é **um tenant curioso** e
**um cliente final que abre o DevTools**. A arquitetura é desenhada contra esses dois primeiro.

---

## 2. Isolamento entre tenants

Detalhes de implementação em [ARCHITECTURE.md](ARCHITECTURE.md#2-multi-tenancy). Regras que
valem como norma do projeto:

1. **`tenantId` vindo do cliente é ignorado.** Não existe rota que aceite tenant por query,
   corpo ou header. O tenant vem do usuário autenticado (área administrativa) ou do `tenantSlug`
   da URL resolvido no servidor (área pública).
2. **A aplicação conecta ao banco com role sem `SUPERUSER` e sem `BYPASSRLS`.** Sem isso, toda
   policy de RLS é ignorada em silêncio e o isolamento existe apenas no papel.
3. **A aplicação não é dona das tabelas e não tem DDL.** O dono de uma tabela pode remover o RLS
   dela com `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` — comprovado em teste. Se a API
   conectasse como dona, uma injeção de SQL derrubaria o isolamento de todos os tenants de uma
   vez. Por isso são duas roles: `cardapio_migrator` (dona, DDL, usada só em migrations) e
   `cardapio_app` (somente DML). **Já em vigor**, com testes que falham se alguém afrouxar.
4. **Toda tabela com `tenant_id` tem RLS habilitado e forçado.** Um teste-guarda consulta o
   catálogo do PostgreSQL e falha o CI se alguma tabela escapar.
5. **Repositório de dado com escopo de tenant só é acessível via `withTenant(ctx, …)`.**

### Proteção contra IDOR

Identificador é UUID, não sequencial — mas isso é obstáculo, não controle de acesso. O controle
é o RLS: mesmo que alguém descubra o UUID de um produto de outro tenant, a consulta devolve zero
linhas.

### Testes de isolamento — **em vigor**

Rodam contra PostgreSQL real e provam, para a primeira tabela tenant-scoped:

| O que é provado                                            | Resultado              |
| ---------------------------------------------------------- | ---------------------- |
| `SELECT` sem `WHERE` dentro de um contexto                 | só as linhas do tenant |
| Consulta fora de `withTenant`                              | zero linhas            |
| Tenant A faz `UPDATE` mirando linha de B                   | nenhuma alterada       |
| Tenant A faz `UPDATE` sabendo o **id exato** da linha de B | nenhuma alterada       |
| Tenant A faz `DELETE` na linha de B                        | nenhuma apagada        |
| Tenant A faz `INSERT` marcado com o tenant de B            | recusado               |
| Escrita fora de contexto                                   | recusada               |
| Contexto após o fim da transação                           | não sobrevive          |
| Contextos em sequência e **concorrentes**                  | não se misturam        |
| Contexto após rollback                                     | limpo                  |

O caso do "id exato" é o que fecha o IDOR: conhecer o identificador não ajuda, porque quem nega
é o banco e não a obscuridade do id.

O caso concorrente existe porque em produção as requisições disputam o mesmo pool — é ali que um
vazamento de contexto entre conexões apareceria, e não numa sequência tranquila de chamadas.

Para cada recurso tenant-scoped novo — produtos, pedidos, clientes, usuários, configurações — os
mesmos testes se repetem. Recurso sem eles não é considerado pronto.

---

## 3. Autenticação

### Usuários administrativos — Fase 4

- Senha com hash usando algoritmo de derivação lento e com salt (argon2id ou bcrypt; a escolha
  fica registrada aqui quando for feita).
- JWT de acesso curto, com refresh token.
- Segredos exclusivamente por variável de ambiente. Nunca no código, nunca no repositório.

### Clientes finais — Fase 10

Conta é opcional: o cliente pode pedir sem cadastro. Quem cria conta usa telefone ou e-mail mais
senha. OTP, WhatsApp, Google e Apple estão no ROADMAP.

---

## 4. Autorização (RBAC) — Fase 4

Papéis iniciais `OWNER`, `ADMIN`, `STAFF`, sobre um modelo de permissões granulares
(`products:create`, `orders:update`, `settings:update`) — de modo que papel novo ou permissão
avulsa não exija mudança de estrutura.

A autorização é sempre verificada **depois** do `TenantContext`: a pergunta é "este usuário pode
fazer isto **neste tenant**", nunca só "este usuário pode fazer isto".

---

## 5. Dívida de privacidade assumida: identificação por telefone

No checkout, informar um telefone já conhecido recupera os dados do cliente, **incluindo o
endereço**, para confirmação.

**Isto é uma decisão consciente de conveniência, com risco de privacidade reconhecido.** Número
de telefone não é prova de identidade: é adivinhável, reutilizado por operadoras e frequentemente
conhecido por terceiros. Quem digitar o número de outra pessoa vê o endereço dela.

Está no MVP porque a fricção de um cadastro completo a cada pedido custa conversão real a um
estabelecimento pequeno. Mas é **dívida**, não desenho final.

Mitigações desde já:

- O endereço recuperado é exibido para **confirmação**, nunca usado em silêncio.
- A recuperação por telefone é registrada em auditoria.
- Rate limiting no endpoint de consulta por telefone, para inviabilizar varredura.

Plano de quitação (ROADMAP, prioridade alta):

1. OTP por WhatsApp ou SMS antes de revelar qualquer endereço.
2. Enquanto o OTP não existe, exibir o endereço **mascarado** ("Rua das Flores, 1•• — Centro"),
   revelando por inteiro só após confirmação.

---

## 6. Dados pessoais e LGPD

Armazenamos nome, telefone, endereço, e-mail opcional e histórico de pedidos.

| Princípio          | Como é aplicado                                                         |
| ------------------ | ----------------------------------------------------------------------- |
| Minimização        | Só o necessário para entregar o pedido. E-mail é opcional.              |
| Finalidade         | Dados de cliente servem ao tenant que os coletou, e a mais ninguém.     |
| Controle de acesso | RBAC + isolamento entre tenants                                         |
| Rastreabilidade    | `audit_logs` registra acesso e alteração de dado pessoal                |
| Eliminação         | Anonimização em vez de exclusão física, preservando histórico do pedido |

Anonimização, exportação de dados e política de retenção não estão implementadas — estão no
ROADMAP. O MVP não implementa fluxo jurídico completo de titular de dados.

Observação importante sobre papéis: o **tenant é o controlador** dos dados dos seus clientes; a
plataforma é **operadora**. Isso precisa estar refletido nos termos de uso antes de qualquer
cliente real entrar.

---

## 7. Validação de entrada

Zod em toda fronteira — corpo, query, parâmetros de rota e variáveis de ambiente. O schema é a
única definição: tipo TypeScript e validação em runtime saem dele, então não há como divergirem.

Já em vigor: as variáveis de ambiente da API são validadas na inicialização e o processo falha
imediatamente se algo estiver inválido, em vez de descobrir no meio de uma requisição.

---

## 8. Cabeçalhos, CORS e limites

| Item             | Estado                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Security headers | **Ativo** — `@fastify/helmet` (HSTS, `X-Content-Type-Options`, frameguard)                            |
| CORS             | **Ativo** — restrito a `WEB_ORIGIN`, sem curinga                                                      |
| Rate limiting    | **Ativo** — limite global; limites estritos para login e consulta por telefone entram com essas rotas |
| Documentação     | **Ativo** — `/docs` desabilitado em produção                                                          |
| HTTPS            | Responsabilidade do ambiente de deploy                                                                |

O limite global conta na memória do processo. Com mais de uma instância em produção isso vira um
limite por instância; um armazenamento compartilhado entra junto do deploy (ROADMAP).

---

## 9. Segredos

- `.env` está no `.gitignore` e **jamais** é commitado.
- `.env.example` documenta as chaves com valores de desenvolvimento, nunca reais.
- Em produção, segredos vêm do gerenciador do ambiente, nunca de arquivo versionado.
- Credencial e token são redigidos no logger, não no ponto de chamada — para não depender de
  alguém lembrar em cada log novo.

---

## 10. Auditoria

`audit_logs` registra quem fez o quê, em qual tenant, sobre qual entidade e quando. Entra na
Fase 4, junto com a primeira ação administrativa, e cada fase seguinte registra as suas — em vez
de deixar auditoria para o fim, quando o custo de instrumentar tudo já é alto.

Eventos que exigem registro: alteração de preço, mudança de disponibilidade, cancelamento de
pedido, alteração de configuração, criação e remoção de usuário, mudança de permissão e acesso a
dado pessoal de cliente.

---

## Como relatar uma vulnerabilidade

O projeto é privado e ainda não tem usuários. Quando houver, este documento ganha um canal de
contato e um prazo de resposta.
