# Segurança e privacidade

Estado atual: **Fase 7b**. Já estão em vigor o isolamento entre tenants (RLS forçado, roles de
banco separadas, testes que o comprovam), autenticação com argon2id e JWT, RBAC por permissão,
auditoria append-only, headers de segurança, CORS restrito, limites de requisição e validação de
ambiente. As rotas administrativas de configuração já exigem permissão e registram auditoria. Cada seção abaixo diz o que já vale e o que ainda não.

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
6. **Toda chave estrangeira entre tabelas tenant-scoped inclui o `tenant_id` dos dois lados.** A
   checagem de FK do PostgreSQL roda por fora do RLS: com uma FK simples, o Tenant A cria um
   produto dentro da categoria do Tenant B sabendo só o UUID, mesmo sem conseguir enxergá-la.
   Comprovado em execução na Fase 7a; a FK composta fecha o caminho, e o teste-guarda falha se
   alguma FK nova não a usar.

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

| Tenant A cria um produto dentro de uma categoria de B | recusado pela FK composta |
| Tenant A atribui papel a um usuário de B | recusado pela FK composta |

O caso do "id exato" é o que fecha o IDOR: conhecer o identificador não ajuda, porque quem nega
é o banco e não a obscuridade do id.

O caso concorrente existe porque em produção as requisições disputam o mesmo pool — é ali que um
vazamento de contexto entre conexões apareceria, e não numa sequência tranquila de chamadas.

Para cada recurso tenant-scoped novo — produtos, pedidos, clientes, usuários, configurações — os
mesmos testes se repetem. Recurso sem eles não é considerado pronto.

---

## 3. Autenticação

### Usuários administrativos — **em vigor**

- **argon2id** com os parâmetros mínimos da OWASP (19 MiB, 2 iterações, paralelismo 1),
  explícitos no código. O salt é aleatório por senha e vai embutido no hash.
- **Token de acesso** JWT HS256 de 15 minutos; **refresh token** opaco de 30 dias, guardado
  apenas como hash SHA-256.
- **Rotação de refresh com detecção de reuso:** reapresentar um token já rotacionado revoga
  todas as sessões do usuário.
- **Lista de algoritmos fixa** na verificação do JWT — fecha a família de ataques de confusão de
  algoritmo, inclusive `alg: none`. Há um teste que apresenta esse token e exige a recusa.
- **Tempo de resposta equalizado** para e-mail inexistente, para o login não virar oráculo de
  quais endereços estão cadastrados.
- **Limite dedicado de 5 tentativas por minuto** no login, bem abaixo do limite global.
- Segredos exclusivamente por variável de ambiente, com mínimo de 32 caracteres validado na
  inicialização. Nunca no código, nunca no repositório.

O que **não** está implementado: 2FA, bloqueio de conta após N falhas e histórico de senhas.
Estão no ROADMAP.

### Clientes finais — **em vigor**

Não há conta de cliente no MVP: o cliente pede sem cadastro e é reconhecido pelo telefone (seção
5). Conta com senha, OTP, WhatsApp, Google e Apple estão no ROADMAP.

---

## 4. Autorização (RBAC) — **em vigor**

Papéis `OWNER`, `ADMIN` e `STAFF` sobre um catálogo de permissões granulares no formato
`recurso:acao`. Papel novo ou permissão avulsa é um INSERT, não uma migração de estrutura.

A autorização é sempre verificada **depois** do `TenantContext`: a pergunta é "este usuário pode
fazer isto **neste tenant**", nunca só "este usuário pode fazer isto". Isso não depende de
disciplina — `requireAuth('permissao')` devolve a cadeia pronta, na ordem certa, e é a única
forma exportada de proteger uma rota.

O usuário é **recarregado do banco a cada requisição**, então desativar alguém tem efeito
imediato em vez de esperar o token expirar.

---

## 5. Dívida de privacidade assumida: identificação por telefone

No checkout, informar um telefone já conhecido recupera os dados do cliente, **incluindo o
endereço**, para confirmação.

**Isto é uma decisão consciente de conveniência, com risco de privacidade reconhecido.** Número
de telefone não é prova de identidade: é adivinhável, reutilizado por operadoras e frequentemente
conhecido por terceiros. Quem digitar o número de outra pessoa vê o endereço dela.

Está no MVP porque a fricção de um cadastro completo a cada pedido custa conversão real a um
estabelecimento pequeno. Mas é **dívida**, não desenho final.

Mitigações em vigor (`POST /api/v1/public/{tenantSlug}/customers/identify`):

- **O endereço completo nunca é devolvido.** A resposta traz o primeiro nome e, de cada
  endereço, rua, bairro e o número mascarado — `Rua dos Ipês, 4•• — Jardim Paulista`.
  CEP, complemento, referência, sobrenome e o telefone não saem. O cliente escolhe o endereço pelo id,
  e o servidor completa o pedido (Fase 11). Um teste procura na resposta cada um desses dados.
- O endereço é exibido para **confirmação**, nunca usado em silêncio.
- Toda identificação que encontra alguém é registrada em auditoria (`customer.identified`), com o
  IP. Telefone desconhecido não é registrado, para não guardar o número de quem nunca foi cliente.
- **Limite de 10 identificações por minuto por IP**, muito abaixo do global.
- POST com o telefone no corpo, não na URL; resposta com `Cache-Control: no-store`.
- Cliente é por estabelecimento: o mesmo telefone em outro estabelecimento é outro cliente.

**O que ainda vaza:** o primeiro nome, a rua e o bairro de quem tem aquele telefone. E o limite é
por IP e em memória — quem distribui a varredura entre muitos IPs passa por ele.

Plano de quitação (ROADMAP, prioridade alta):

1. ~~Exibir o endereço **mascarado** enquanto o OTP não existe~~ — feito na Fase 10.
2. OTP por WhatsApp ou SMS antes de revelar qualquer dado pessoal.

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

### Área pública — **em vigor**

As rotas sem login são o cardápio (`GET .../menu`), a identificação por telefone (seção 5) e o
envio do pedido (`POST .../orders`). O que as protege:

- **O tenant vem só do slug**, traduzido para id pelo servidor. Um token de outro estabelecimento
  enviado junto é ignorado — há teste para isso.
- **Estabelecimento suspenso responde o mesmo 404 de um inexistente**, sem revelar a suspensão.
- **Resposta montada campo a campo**, sem repassar linhas do banco. O schema de resposta descarta
  o que não estiver declarado, e um teste percorre a resposta inteira procurando campos internos
  (`tenantId`, chaves de storage, `sortOrder`, `isActive`, e-mail de contato, entre outros).
- **Expõe de propósito:** nome, descrição, imagens, WhatsApp e telefone de contato (o pedido é
  enviado para esse número), endereço do estabelecimento (retirada), horários, regiões ativas com
  taxa e formas de pagamento habilitadas. **Não expõe:** e-mail de contato, regiões inativas,
  formas desabilitadas, categorias inativas.
- Vale o limite global de requisições.
- **A página no navegador não decide nada**: status, disponibilidade e preço exibidos são
  informativos. O pedido é validado e recalculado no servidor (Fase 11).
- **O carrinho no navegador é do cliente, não do sistema.** Fica no `localStorage`, que qualquer
  um edita. Por isso o item não guarda preço — o de exibição é recalculado do cardápio atual —, o
  que vem de lá passa por uma limpeza de formato e limites antes de ser usado, e a Fase 11 vai
  tratar o pedido enviado como entrada hostil: ids, opções, quantidades e observação validados e
  o preço calculado do zero no servidor. A chave do carrinho (o slug) não escolhe o
  estabelecimento do pedido.

### Envio do pedido — **em vigor**

O corpo de `POST .../orders` é tratado como **entrada hostil**:

- **Nenhum preço vem do navegador.** O corpo traz ids, quantidades e escolhas; campos a mais são
  descartados. Tudo é recalculado sobre a montagem do cardápio público, dentro da transação do
  pedido: produto de outro estabelecimento, de categoria inativa, esgotado ou excluído é recusado
  como inexistente; opção precisa ser do grupo, do produto, disponível, sem repetição, dentro do
  mínimo e do máximo.
- **O total que o cliente viu é conferido, não usado.** Diferente do calculado, o pedido é
  recusado (409) e nada é gravado.
- **Endereço salvo só vale se for do dono do telefone.** Sem isso, um id de endereço bastaria
  para pedir no endereço de outra pessoa. A resposta do pedido não traz o endereço.
- **Um pedido não renomeia o cliente**: o cliente existente mantém o nome guardado, e o nome
  digitado fica só no pedido.
- **Idempotência** pela chave gerada no navegador, garantida por restrição única no banco.
- **10 envios por minuto por IP.**
- Estabelecimento suspenso ou inexistente responde o mesmo 404.

**Mensagem do WhatsApp** (Fase 12): montada no servidor e entregue ao navegador de quem pediu,
então segue a mesma regra da identificação — endereço salvo sai **mascarado**, endereço digitado
na hora sai completo, e o nome é o que a pessoa digitou (nunca o completo guardado). O endereço
completo de um endereço salvo só na mensagem depois do OTP (ROADMAP).

### Pedidos em tempo real — **em vigor**

- O canal WebSocket entrega cada aviso só às conexões do estabelecimento dele, com o tenant tirado
  do token — há teste com duas lojas conectadas ao mesmo tempo.
- O token vai na primeira mensagem, nunca na URL. Exige `orders:read`; usuário desativado não
  entra, porque o usuário é recarregado do banco como no `requireAuth`. A conexão fecha quando o
  token expira.
- A origem é conferida no handshake: o navegador não aplica CORS a WebSocket.
- O aviso leva só ids; os dados vêm da API REST, com permissão e RLS.

### Sessão do painel no navegador — **dívida**

O token de acesso fica só na memória da página. O **refresh token fica no `localStorage`**, para
o tablet da cozinha continuar logado depois de recarregar — e um script injetado na página (XSS)
poderia lê-lo. Mitigações: rotação a cada uso com detecção de reuso (reapresentar um token já
usado revoga todas as sessões do usuário), validade de 30 dias e "Sair" revogando no servidor. A
quitação é levar o refresh token para um cookie `httpOnly` (ROADMAP).

Os pedidos só aparecem no painel do próprio estabelecimento (`orders:read`), e mudar o status
exige `orders:update` e vai para a auditoria (`order.status_changed`), com o motivo quando é
cancelamento.

## 8. Cabeçalhos, CORS e limites

| Item             | Estado                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Security headers | **Ativo** — `@fastify/helmet` (HSTS, `X-Content-Type-Options`, frameguard)                           |
| CORS             | **Ativo** — restrito a `WEB_ORIGIN`, sem curinga; libera GET, HEAD, POST, PUT, PATCH e DELETE        |
| Rate limiting    | **Ativo** — limite global; 5/min no login; 10/min na identificação por telefone e no envio de pedido |
| Documentação     | **Ativo** — `/docs` desabilitado em produção                                                         |
| HTTPS            | Responsabilidade do ambiente de deploy                                                               |

O limite global conta na memória do processo. Com mais de uma instância em produção isso vira um
limite por instância; um armazenamento compartilhado entra junto do deploy (ROADMAP).

---

## 9. Upload de arquivos — **em vigor**

| Risco                                    | Defesa                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| Arquivo malicioso com extensão de imagem | Tipo detectado pelos bytes; extensão e `Content-Type` ignorados                   |
| SVG com script (XSS armazenado)          | SVG recusado                                                                      |
| Path traversal pelo nome do arquivo      | Nome enviado não é usado; chave com formato fixo; caminho conferido contra a raiz |
| Upload gigante esgotando memória         | Limite aplicado durante o recebimento                                             |
| Sobrescrever a imagem de outra entidade  | Chave com UUID novo a cada envio; escrita falha se o arquivo já existir           |
| Listagem do diretório                    | Desabilitada; arquivos ocultos recusados                                          |
| Upload por quem só pode ler              | Exige `settings:update`                                                           |

**Não implementado, e relevante:** os metadados EXIF **não são removidos**. Uma foto tirada no
celular pode carregar a localização GPS de onde foi feita — num logo, é pouco provável; em foto
de produto tirada em casa, é possível. Remover exige reprocessar a imagem, o que entra junto com
o redimensionamento (ROADMAP).

## 10. Segredos

- `.env` está no `.gitignore` e **jamais** é commitado.
- `.env.example` documenta as chaves com valores de desenvolvimento, nunca reais.
- Em produção, segredos vêm do gerenciador do ambiente, nunca de arquivo versionado.
- Credencial e token são redigidos no logger, não no ponto de chamada — para não depender de
  alguém lembrar em cada log novo.

---

## 11. Auditoria

`audit_logs` registra quem fez o quê, em qual tenant, sobre qual entidade e quando. **Em vigor
desde a Fase 4**, já registrando entradas no sistema e detecções de reuso de token; cada fase
seguinte registra as suas.

A tabela é **append-only pela própria estrutura**: só existem policies de `select` e `insert`, e
o RLS nega o que nenhuma policy autoriza. Nem a aplicação, nem o próprio estabelecimento
consegue alterar ou apagar uma linha — há testes que tentam as duas coisas e exigem zero linhas
afetadas. Um log que a aplicação pode reescrever não serve para auditá-la.

O registro acontece na mesma transação da alteração que descreve: ou as duas acontecem, ou
nenhuma.

Eventos que exigem registro: alteração de preço, mudança de disponibilidade, cancelamento de
pedido, alteração de configuração, criação e remoção de usuário, mudança de permissão e acesso a
dado pessoal de cliente.

---

## Como relatar uma vulnerabilidade

O projeto é privado e ainda não tem usuários. Quando houver, este documento ganha um canal de
contato e um prazo de resposta.
