# Segurança e privacidade

Estado atual: **Fase 18b**. Estão em vigor o isolamento entre tenants (RLS forçado, roles de
banco separadas, testes que o comprovam), autenticação com argon2id, JWT e refresh token em
cookie `httpOnly`, RBAC por permissão, auditoria append-only, headers de segurança, CORS
restrito, limites de requisição, validação de ambiente e o cadastro aberto de estabelecimento,
com confirmação de e-mail. O CI está pronto, mas desligado até a Fase 28 (seção 12). Cada seção
abaixo diz o que já vale e o que ainda não.

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
   corpo ou header. O tenant vem do usuário autenticado (área administrativa), do `tenantSlug`
   da URL resolvido no servidor (área pública) ou, no login, do e-mail de quem entra, também
   resolvido no servidor.
2. **A aplicação conecta ao banco com role sem `SUPERUSER` e sem `BYPASSRLS`.** Sem isso, toda
   policy de RLS é ignorada em silêncio e o isolamento existe apenas no papel.
3. **A aplicação não é dona das tabelas e não tem DDL.** O dono de uma tabela pode remover o RLS
   dela com `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` — comprovado em teste. Se a API
   conectasse como dona, uma injeção de SQL derrubaria o isolamento de todos os tenants de uma
   vez. Por isso são duas roles: `cardapio_migrator` (dona, DDL, usada só em migrations) e
   `cardapio_app` (somente DML). **Já em vigor**, com testes que falham se alguém afrouxar.
4. **Toda tabela com `tenant_id` tem RLS habilitado e forçado.** Um teste-guarda consulta o
   catálogo do PostgreSQL e falha o CI se alguma tabela escapar. O mesmo teste lista as policies
   que não filtram pelo tenant: hoje, uma só — a leitura por e-mail do login (seção 3).
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

| O que é provado                                            | Resultado                 |
| ---------------------------------------------------------- | ------------------------- |
| `SELECT` sem `WHERE` dentro de um contexto                 | só as linhas do tenant    |
| Consulta fora de `withTenant`                              | zero linhas               |
| Tenant A faz `UPDATE` mirando linha de B                   | nenhuma alterada          |
| Tenant A faz `UPDATE` sabendo o **id exato** da linha de B | nenhuma alterada          |
| Tenant A faz `DELETE` na linha de B                        | nenhuma apagada           |
| Tenant A faz `INSERT` marcado com o tenant de B            | recusado                  |
| Escrita fora de contexto                                   | recusada                  |
| Contexto após o fim da transação                           | não sobrevive             |
| Contextos em sequência e **concorrentes**                  | não se misturam           |
| Contexto após rollback                                     | limpo                     |
| Tenant A cria um produto dentro de uma categoria de B      | recusado pela FK composta |
| Tenant A atribui papel a um usuário de B                   | recusado pela FK composta |

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
- **Refresh token em cookie `httpOnly`**, `SameSite=Strict`, só em `/api/v1/auth`, `Secure` em
  produção. Nunca vai no corpo da resposta nem fica no `localStorage`.
- **`requireAuth` em `onRequest`:** o 401 vem antes de o corpo ser lido e validado. Um
  teste-guarda percorre o inventário de rotas e exige isso de toda rota do painel.
- **Rotação de refresh com detecção de reuso:** reapresentar um token já rotacionado revoga
  todas as sessões do usuário. Só token **rotacionado** conta como reuso: sessão encerrada por nós
  — usuário desativado, estabelecimento suspenso — é apagada, e reapresentá-la dá só "sessão
  inválida". Antes da Fase 19 ela ficava como revogada, e o aparelho antigo de alguém reativado
  acusava um roubo falso e derrubava as sessões novas da pessoa.
- **Lista de algoritmos fixa** na verificação do JWT — fecha a família de ataques de confusão de
  algoritmo, inclusive `alg: none`. Há um teste que apresenta esse token e exige a recusa.
- **Entra só com e-mail e senha** (Fase 18b): a pessoa não informa o estabelecimento, e a API
  não aceita nenhum. O e-mail é único na plataforma — é ele que diz de qual estabelecimento a
  pessoa é — e o banco o exige em minúsculas, para `Ze@…` e `ze@…` não virarem duas contas.
- **Tempo de resposta equalizado** para e-mail inexistente, para o login não virar oráculo de
  quais endereços estão cadastrados.
- **Conta desativada e estabelecimento suspenso só são ditos depois de a senha conferir.** Antes
  disso a resposta é sempre o mesmo 401. Com o login por estabelecimento, a suspensão era
  respondida antes da senha, porque o endereço já era público; sem o endereço, responder antes
  diria a qualquer um que aquele e-mail tem conta.
- **Limite dedicado de 5 tentativas por minuto** no login, bem abaixo do limite global.
- Segredos exclusivamente por variável de ambiente, com mínimo de 32 caracteres validado na
  inicialização. Nunca no código, nunca no repositório.

**A leitura por e-mail, e o tamanho dela.** `users` está sob RLS, e para achar o estabelecimento
de um e-mail o login precisa ler antes de existir contexto de tenant. Não há role que ignore RLS
nem tabela global de e-mails: há uma segunda policy em `users`, `login_por_email`, só de
`SELECT`, que libera a linha cujo e-mail é igual a `app.login_email`. Quem define a variável com
o e-mail de quem está entrando lê aquela linha e nenhuma outra. Há teste para cada limite: não
lista, não altera, não apaga, não abre outra tabela, e a variável não sobrevive à transação.

**O que o e-mail único custa.** Entrar só com e-mail e senha exige que o e-mail identifique uma
conta — e por isso dois lugares passam a dizer que um e-mail já existe:

- **o cadastro** responde 409 `EMAIL_TAKEN` (antes, o mesmo e-mail podia cadastrar outro
  estabelecimento, e a resposta nunca revelava quem tinha conta). Mitigação: o limite de 10
  cadastros por hora por IP. É o que a maioria dos produtos faz; a alternativa — responder igual e
  avisar só por e-mail — não cabe num cadastro que já entra logado.
- **a criação de usuário no painel** responde 409 `USER_EMAIL_TAKEN` também quando o e-mail é de
  outro estabelecimento, sem dizer de qual. Só quem tem `users:create` chega a essa resposta.

O login continua sem revelar nada.

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

**O mesmo vale para o estabelecimento suspenso** (Fase 19): o status vem na mesma consulta, e
usuário de estabelecimento suspenso não é carregado. A suspensão tira o cardápio do ar, impede o
login (dito só depois de a senha conferir), encerra as sessões e fecha as conexões ao vivo — quem
já estava logado cai na requisição seguinte, e não quando o token expirar.

### Ações da plataforma (Super Admin) — **em vigor**

- **Sem rota HTTP.** Listar, suspender, reativar, trocar o plano e reenviar a confirmação são um
  comando (`pnpm plataforma`), rodado no servidor. Não há tela, endpoint nem credencial de Super
  Admin: quem não tem acesso ao servidor não alcança as ações.
- **Sem privilégio a mais no banco.** O comando usa a role da API, sem `BYPASSRLS`, e abre o
  contexto de cada estabelecimento como qualquer outra operação.
- **Tudo vai para a auditoria** do estabelecimento, com o operador e — na suspensão — o motivo,
  que é obrigatório.
- **A renovação de sessão de um suspenso não é tratada como roubo:** as sessões abertas são
  apagadas na suspensão, e a renovação ainda recusa o suspenso antes da detecção de reuso.
- **Reativar não publica cardápio não confirmado:** volta o status de antes da suspensão.
- **O que ainda não há:** aviso ao dono por e-mail quando o estabelecimento é suspenso ou
  reativado, e o motivo à vista dele — hoje ele só lê "Fale com o suporte". Está no ROADMAP.

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
plataforma é **operadora**. Os termos de uso e a política de privacidade (`/termos` e
`/privacidade`, Fase 18) já dizem isso, e o cadastro registra a versão aceita — mas o **texto ainda
é provisório**: o definitivo, com orientação jurídica, precisa estar no lugar antes de qualquer
cliente real entrar (Fase 28).

**Transparência no checkout:** antes de enviar o pedido, o cliente lê que nome, telefone e
endereço vão para o estabelecimento, com o link da política de privacidade — que conta, inclusive,
que um telefone conhecido mostra o primeiro nome e os endereços mascarados (seção 5).

---

## 7. Validação de entrada

Zod em toda fronteira — corpo, query, parâmetros de rota e variáveis de ambiente. O schema é a
única definição: tipo TypeScript e validação em runtime saem dele, então não há como divergirem.

Já em vigor: as variáveis de ambiente da API são validadas na inicialização e o processo falha
imediatamente se algo estiver inválido, em vez de descobrir no meio de uma requisição.

---

### Área pública — **em vigor**

As rotas sem login são o cardápio (`GET .../menu`), a identificação por telefone (seção 5), o
envio do pedido (`POST .../orders`) e o cadastro de estabelecimento (`/signup`, abaixo). O que as
protege:

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

### Cadastro de estabelecimento — **em vigor**

Aberto a qualquer pessoa, no plano gratuito (Fase 17). É a rota pública que **cria** coisas — um
estabelecimento, um usuário, um e-mail saindo pelo nosso remetente —, e por isso a mais fechada:

- **O cardápio nasce fora do ar** (`PENDING`) e só é publicado quando o dono confirma o e-mail.
  Até lá, responde o mesmo 404 de um endereço inexistente. O painel funciona na hora.
- **O e-mail de confirmação não repete nada do que foi digitado.** Ele vai para um endereço que
  quem se cadastra escolhe — pode ser de outra pessoa. Se levasse o nome do estabelecimento, o
  cadastro viraria um jeito de mandar, pelo nosso remetente, um texto qualquer ("clique aqui e
  informe sua senha") para qualquer endereço. Vai só o endereço do cardápio, que só tem letras,
  números e hífen, e o link. E-mail só em texto: não há HTML a escapar. Há teste com o golpe no
  nome do estabelecimento.
- **O link:** 256 bits aleatórios, só o hash no banco, 48 horas, uso único, o tenant embutido
  como dica de roteamento (como o refresh token). O token vai no **fragmento** do link, que não
  chega a log de servidor nem vaza por `Referer`; a página o manda no corpo de um POST.
- **Confirmar só sai de `PENDING`:** um link guardado não desfaz uma suspensão da plataforma.
- **O reenvio vai sempre para o e-mail do dono**, seja quem for que peça, com um minuto entre
  envios contado no banco — um atendente não publica o cardápio com o próprio e-mail.
- **E-mail que já tem conta é recusado** (409 `EMAIL_TAKEN`), sem criar nada e sem enviar e-mail.
  Isso revela que o e-mail tem conta — o custo de entrar só com e-mail e senha, explicado na
  seção 3.
- **Limites:** 10 cadastros por hora por IP, um campo-armadilha que só robô preenche, endereços
  reservados (`/cadastro`, `/termos`, `/signup`, nomes que imitariam a plataforma).
- **Senha forte no cadastro:** pelo menos 8 caracteres, com letra maiúscula, minúscula e caractere
  especial (`REGRAS_DA_SENHA`, a mesma lista na API e na tela). Guardada com argon2id, como
  sempre. A criação de usuários do painel ainda pede só os 8 caracteres — a mesma regra chega lá
  na Fase 25.
- **O aceite dos termos vai para a auditoria**, com a versão aceita e o IP. Versão diferente da
  atual é recusada: ninguém aceita um texto que não viu.
- **Tudo numa transação**, e os e-mails só depois do commit. Sem o plano gratuito no banco, o
  cadastro responde 503 em vez de criar estabelecimento sem plano.
- `EMAIL_DRIVER=memory`, que descartaria todo e-mail, é recusado em produção na inicialização.

**Na tela (Fase 18):** a página de confirmação tira o token do endereço assim que o lê — ele não
fica no histórico nem vai junto se o link for copiado — e o manda uma vez só, no corpo. O
campo-armadilha fica fora da tela, do teclado e do leitor de tela (`aria-hidden`, `tabIndex=-1`),
para nenhuma pessoa preenchê-lo sem querer. O cadastro chama a API com `credentials`, como o login:
o refresh token vem no cookie `httpOnly` e nunca passa pelo JavaScript da página.

**O que ainda não há:** captcha (só se aparecer abuso — ROADMAP) e moderação além da suspensão por
comando (Fase 19). A plataforma recebe um e-mail a cada cadastro novo.

### Pedidos em tempo real — **em vigor**

- O canal WebSocket entrega cada aviso só às conexões do estabelecimento dele, com o tenant tirado
  do token — há teste com duas lojas conectadas ao mesmo tempo.
- O token vai na primeira mensagem, nunca na URL. Exige `orders:read`; usuário desativado não
  entra, porque o usuário é recarregado do banco como no `requireAuth`. A conexão fecha quando o
  token expira — e **na hora** quando o usuário é desativado ou tem o papel alterado.
- A origem é conferida no handshake: o navegador não aplica CORS a WebSocket.
- O aviso leva só ids; os dados vêm da API REST, com permissão e RLS.

### Gestão de usuários — **em vigor**

- Listar, criar, alterar, desativar e reativar pela API (`/api/v1/admin/users`), com
  `users:read`, `users:create`, `users:update` e `users:delete`. Desativar e reativar pedem
  `users:delete`, que o ADMIN não tem.
- O papel `OWNER` não é dado nem tirado pela API; ninguém muda o próprio papel nem se desativa;
  só o dono altera a conta do dono.
- **Desativar encerra o acesso na hora**: o token de acesso para de valer na próxima requisição
  (o usuário é recarregado a cada uma), todas as sessões abertas dele são apagadas e a conexão
  ao vivo dele fecha na hora.
- Senha inicial definida pelo dono (mínimo de 8 caracteres), com argon2id; a resposta nunca traz
  o hash. E-mail já em uso — neste estabelecimento ou em outro — é recusado, sem dizer onde.
- Usuário de outro estabelecimento responde 404.

### Sessão do painel no navegador — **em vigor**

O token de acesso fica só na memória da página; o refresh token, no cookie `httpOnly` — o
tablet da cozinha continua logado depois de recarregar, e um script injetado não tem como ler o
token. Quitada na Fase 15 a dívida de quando ele ficava no `localStorage`.

O login é um só, em `/entrar`. O endereço do estabelecimento nunca é digitado nem enviado: vem da
resposta da API, e é ele que o painel guarda.

**A sessão é conferida num lugar só** (Fase 18c): a moldura do painel, por onde toda tela de
`/{endereço}/admin` passa. Sem sessão daquele estabelecimento, nenhuma tela é montada e nada é
pedido à API. O menu esconde o que a permissão da pessoa não alcança, mas isso é conforto, não
barreira: quem recusa é a API, rota a rota (`requireAuth`), como o teste-guarda de rotas exige.

**O resumo dos pedidos** (`GET /api/v1/admin/orders/summary`) pede `orders:read` e devolve só três
números, do próprio estabelecimento — há teste com dois estabelecimentos.

**O nome e o fuso do estabelecimento** (Fase 21) são alterados por `PATCH /settings`, com
`settings:update`. Eles moram em `tenants`, **que não tem RLS** — então aqui quem isola é o filtro
explícito pelo id do contexto, e não o banco. Há teste que tira o filtro e vê o nome de outro
estabelecimento mudar. O endereço do cardápio não é alterável. Na tela, quem só tem
`settings:read` vê os campos desligados; quem recusa de verdade é a API.

**Horários, entrega e formas de pagamento** (Fase 22) são telas sobre rotas que já existiam, com
as mesmas permissões: `settings:read` para ver, `settings:update` para gravar. Nenhuma rota nova.
As regras que a tela aplica — horário sobreposto, região repetida, ao menos entrega ou retirada —
são conforto: a API aplica as mesmas, e as do horário são literalmente a mesma função
(`@repo/shared`). As três gravam por substituição dentro do contexto do estabelecimento; quem
limita o alcance é o RLS, com teste de dois estabelecimentos desde a Fase 5.

**Um estabelecimento novo não recebe pedidos por omissão.** Ele nasce sem entrega, sem retirada e
sem forma de pagamento, e enquanto for assim o cardápio público responde `NAO_RECEBENDO` e a
criação do pedido recusa. Antes da Fase 22, um cadastro novo ia ao ar com entrega ligada e grátis
sem o dono ter decidido. A resposta pública não diz o motivo — é o mesmo status do limite do
plano.

Os pedidos só aparecem no painel do próprio estabelecimento (`orders:read`), e mudar o status
exige `orders:update` e vai para a auditoria (`order.status_changed`), com o motivo quando é
cancelamento.

## 8. Cabeçalhos, CORS e limites

| Item             | Estado                                                                                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security headers | **Ativo** — `@fastify/helmet` (CSP, HSTS, `X-Content-Type-Options`, frameguard), com teste                                                                                                                                    |
| CORS             | **Ativo** — restrito a `WEB_ORIGIN`, sem curinga; libera GET, HEAD, POST, PUT, PATCH e DELETE                                                                                                                                 |
| Rate limiting    | **Ativo** — limite global; 5/min no login; 10/min na identificação por telefone e no envio de pedido; 10/hora no cadastro, 60/min na consulta de endereço, 10/min na confirmação, 5/hora no reenvio (e 1 minuto entre envios) |
| Documentação     | **Ativo** — `/docs` desabilitado em produção                                                                                                                                                                                  |
| IP de quem chama | **Explícito** — `TRUST_PROXY`: ligado só atrás de proxy; desligado, `X-Forwarded-For` é ignorado                                                                                                                              |
| Tamanho do corpo | **Ativo** — 64 KB para JSON (`JSON_BODY_LIMIT_BYTES`); upload com limite próprio                                                                                                                                              |
| Logs             | **Ativo** — sem `authorization`, cookies, senha, hash, token de acesso e refresh token, com teste                                                                                                                             |
| Sondas           | **Ativo** — `/ready` não revela o motivo da falha do banco em produção                                                                                                                                                        |
| HTTPS            | Responsabilidade do ambiente de deploy                                                                                                                                                                                        |

O limite global conta na memória do processo. Com mais de uma instância em produção isso vira um
limite por instância; um armazenamento compartilhado entra junto do deploy (ROADMAP).

---

## 9. Upload de arquivos — **em vigor**

| Risco                                          | Defesa                                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| Arquivo malicioso com extensão de imagem       | Tipo detectado pelos bytes; extensão e `Content-Type` ignorados                   |
| Localização GPS e dados do aparelho na foto    | Imagem refeita a partir dos pixels: sai sem EXIF, XMP, IPTC nem perfil de cor     |
| Conteúdo escondido dentro de uma imagem válida | O arquivo enviado nunca é guardado; só a imagem refeita, em WebP                  |
| Imagem pequena em bytes e enorme em pixels     | Teto de 50 MP na entrada, conferido antes de decodificar; 15 s por imagem         |
| SVG com script (XSS armazenado)                | SVG recusado                                                                      |
| Path traversal pelo nome do arquivo            | Nome enviado não é usado; chave com formato fixo; caminho conferido contra a raiz |
| Upload gigante esgotando memória               | Limite aplicado durante o recebimento                                             |
| Sobrescrever a imagem de outra entidade        | Chave com UUID novo a cada envio; escrita falha se o arquivo já existir           |
| Listagem do diretório                          | Desabilitada; arquivos ocultos recusados                                          |
| Upload por quem só pode ler                    | Exige `settings:update`                                                           |

**Os metadados são removidos** (Fase 20). Uma foto tirada no celular carrega a localização GPS de
onde foi feita — em foto de produto tirada em casa, é o endereço de quem tirou, num cardápio
público. Toda imagem enviada é refeita a partir dos pixels antes de ser guardada, e há teste que
envia uma foto com GPS e confere, no arquivo que qualquer pessoa baixa, que ele não está mais lá.

A biblioteca que refaz a imagem (`sharp`, sobre a libvips) abre mais formatos do que os três
aceitos — SVG inclusive. Quem os mantém fora é a conferência dos primeiros bytes, que vem **antes**:
há teste que tira essa conferência e vê o SVG passar. O teto do envio é de 15 MB, e o que fica
guardado é a versão tratada, bem menor.

**Limite de produtos e categorias no plano gratuito** (20 e 10): o cadastro é aberto, e cada
produto e cada categoria guarda uma imagem. Sem o limite, um cadastro gratuito ocuparia o disco à
vontade. A cota de armazenamento em bytes, por plano, continua no ROADMAP.

## 10. Segredos

- `.env` está no `.gitignore` e **jamais** é commitado.
- `.env.example` documenta as chaves com valores de desenvolvimento, nunca reais.
- Em produção, segredos vêm do gerenciador do ambiente, nunca de arquivo versionado.
- A senha do SMTP (`SMTP_PASSWORD`) é segredo como o `JWT_SECRET`. Em desenvolvimento não há
  nenhuma: o Mailpit aceita qualquer envio, e nada sai da máquina.
- Credencial e token são redigidos no logger, não no ponto de chamada — para não depender de
  alguém lembrar em cada log novo.
- O CI não tem segredo nenhum: roda só com os valores de desenvolvimento (seção 12).

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

## 12. CI — **pronto, desligado até a Fase 28**

O workflow está guardado em `CI_PARA_IMPLEMENTAR_DEPOIS.txt` e volta antes de colocar o sistema no ar
(DEVELOPMENT.md, "CI"). Quando voltar, ele roda código do repositório a cada PR, e por isso já
foi fechado como qualquer outra fronteira:

| Risco                                              | Defesa                                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Action de terceiro trocada depois de adotada       | Fixada pelo **commit**, não pela tag — uma tag pode ser movida por quem controla a action                                                        |
| Token do workflow usado para alterar o repositório | `permissions: contents: read`; o checkout não grava o token no `.git/config`                                                                     |
| PR de fork — o repositório é público               | O gatilho é `pull_request`, nunca `pull_request_target`: o PR de fork roda com token só de leitura e sem segredos; e o CI não tem segredo nenhum |
| Dependência executando código na instalação        | `pnpm install --frozen-lockfile`: só o lockfile, e só o `esbuild` roda script de instalação                                                      |

## Como relatar uma vulnerabilidade

O repositório ainda é público, e o produto ainda não tem usuários. **Não abra uma issue pública**
para relatar uma vulnerabilidade: ela ficaria visível para todo mundo antes da correção.

**Antes da publicação oficial, o repositório fica privado** — decisão do Junio, obrigatória na Fase 28. A partir daí o relato privado de vulnerabilidades do GitHub deixa de fazer sentido (só quem tem
acesso vê o código), e o canal passa a ser um contato de segurança no próprio produto, com o prazo
de resposta — os dois definidos na Fase 28, antes do primeiro estabelecimento real.
