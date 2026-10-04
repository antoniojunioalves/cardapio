# Plano do projeto

**Atualizado em:** 2026-10-02
**Fase atual:** 22 — concluída, aguardando validação
**Próxima:** 23 — categorias e produtos. As fases 23 a 28 fecham o MVP (ver "O que falta para o
MVP")

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

**O estabelecimento recebe os pedidos ao vivo.** Em `/entrar` o lojista entra só com e-mail e
senha e cai no painel, `/{tenantSlug}/admin`; em `/{tenantSlug}/admin/pedidos` vê os pedidos
chegarem sem recarregar — com endereço completo,
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

**E pela página inicial (Fase 18).** Em `/`, a página do produto leva a `/cadastro`, que sugere
o endereço do cardápio pelo nome e confere se está livre enquanto a pessoa digita; o cadastro já
abre o painel, onde um aviso lembra de confirmar o e-mail — com o botão de reenviar. O link do
e-mail abre `/confirmar-email`, que publica o cardápio. `/termos` e `/privacidade` têm o texto
(provisório) que o cadastro aceita. O
checkout avisa para onde vão os dados do cliente.

**Entra-se só com e-mail e senha (Fase 18b).** `/entrar` não pergunta o estabelecimento: o
e-mail é único na plataforma, a API acha de qual estabelecimento a pessoa é e a tela segue para o
painel dele. Vale para o dono e para os funcionários, cada um com o seu e-mail e a sua senha.

**O painel tem moldura e menu (Fase 18c).** `/{tenantSlug}/admin` abre o Início, com o resumo dos
pedidos de hoje e os avisos do estabelecimento; o menu lateral — gaveta no celular, fixo em tela
grande — leva aos Pedidos e vai ganhar um item a cada tela nova. O pedido novo toca e aparece no
menu em qualquer tela do painel.

**A plataforma modera por comando (Fase 19).** `pnpm plataforma` lista os estabelecimentos,
suspende (com motivo), reativa, troca o plano e reenvia a confirmação. Suspender tira o cardápio
do ar e derruba na hora quem estava logado. Tudo fica na auditoria do estabelecimento.

**As imagens são tratadas no envio (Fase 20).** Toda foto enviada é refeita antes de ser guardada:
sai sem metadados — inclusive a localização GPS —, de pé, no tamanho do uso e em WebP. E o plano
gratuito passou a limitar o cardápio a 20 produtos e 10 categorias.

**O estabelecimento já é configurado pelo painel (Fase 21).** A tela Configurações altera o nome,
a descrição, o fuso, o logo e a capa, o contato, o endereço, o pedido mínimo e o tempo de preparo —
tudo num "Salvar" só. E o Início mostra o que ainda falta para receber pedidos.

**Horários, entrega e pagamento também (Fase 22).** Configurações ganhou abas — Estabelecimento,
Horários, Entrega e Pagamento —, cada uma com o seu endereço e o seu "Salvar". Um estabelecimento
novo nasce com a entrega e a retirada desligadas, e o cardápio só recebe pedidos depois que o dono
escolhe como entrega e como recebe.

**Ainda não existe:** as telas do cardápio, de usuários e de clientes — isso ainda é configurado
pela API. As fases 23 a 28 fecham o MVP; ver "O que falta para o MVP".

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
| 18  | Telas do cadastro: landing page, cadastro, confirmação de e-mail, termos e privacidade                              | ✅ Concluída |
| 18b | Login só com e-mail e senha: e-mail único na plataforma, `/entrar` como login único                                 | ✅ Concluída |
| 18c | Painel do estabelecimento: moldura com menu lateral, tela Início e resumo dos pedidos                               | ✅ Concluída |
| 19  | Comandos do Super Admin: listar, suspender, reativar, trocar o plano, reenviar a confirmação                        | ✅ Concluída |
| 19b | Ajustes visuais do cardápio: janela "Info" e menu de baixo                                                          | ✅ Concluída |
| 20  | Tratamento de imagens no upload e limites do plano gratuito (20 produtos, 10 categorias)                            | ✅ Concluída |
| 21  | Configuração do estabelecimento e a lista "o que falta para receber pedidos"                                        | ✅ Concluída |
| 22  | Horários, entrega e retirada, formas de pagamento                                                                   | ✅ Concluída |
| 23  | Categorias e produtos                                                                                               | ⬜ Próxima   |
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

## Fase 22 — concluída

As três configurações que faltavam para um estabelecimento receber pedidos sem tocar na API:
horário de funcionamento, entrega e retirada, e formas de pagamento.

### Microtasks

| #   | Tarefa                                                                                        | Status |
| --- | --------------------------------------------------------------------------------------------- | ------ |
| 1   | Configurações com abas: Estabelecimento, Horários, Entrega e Pagamento, cada uma num endereço | ✅     |
| 2   | Aba Horários: a semana, vários horários por dia, "repetir nos outros dias"                    | ✅     |
| 3   | Aba Entrega: entrega, retirada, taxa fixa ou por região, tempo de entrega                     | ✅     |
| 4   | Aba Pagamento: liga e desliga as formas do catálogo                                           | ✅     |
| 5   | Regras do horário em `@repo/shared`, as mesmas na tela e na API                               | ✅     |
| 6   | Estabelecimento novo nasce com entrega e retirada desligadas (migration `0023`)               | ✅     |
| 7   | Cardápio sem como receber ou sem forma de pagamento não recebe pedidos                        | ✅     |
| 8   | Lista do Início: os passos de horário, entrega e pagamento levam à aba certa                  | ✅     |
| 9   | Testes: regras, API, as três abas, a navegação e a lista                                      | ✅     |

### Decisões e achados desta fase

**Abas dentro de Configurações, e não itens novos no menu** (decisão do Junio). O menu continua
com um item só. Cada aba é uma rota filha de `/admin/configuracoes` — `horarios`, `entrega`,
`pagamento` —, e por isso é um link: abre direto pelo endereço, volta com o botão de voltar e é
para onde a lista do Início leva. Cada aba tem o seu "Salvar". No celular a faixa de abas rola de
lado, e a aba aberta é trazida para a vista.

**O estabelecimento nasce com a entrega e a retirada desligadas** (decisão do Junio). Fecha o
achado da Fase 21: antes nascia com entrega ligada e grátis, sem o dono ter decidido. A migration
`0023` só troca o padrão da coluna; quem já tinha a entrega configurada continua como estava.

**Sem como receber ou sem como pagar, o cardápio não recebe pedidos.** É a consequência da decisão
acima. O cardápio público responde `NAO_RECEBENDO` — o mesmo status do limite do plano, sem dizer
qual é o motivo — quando não há entrega nem retirada funcionando, ou quando nenhuma forma de
pagamento está habilitada. A criação do pedido já recusava com esse status; não mudou. "Entrega
funcionando" é uma função só (`temComoReceber`), usada pelo cardápio e pela lista do Início:
entrega por região sem nenhuma região ativa não conta.

**As regras do horário foram para `@repo/shared`.** Hora válida, abrir e fechar na mesma hora e
sobreposição no mesmo dia são conferidas pela mesma função na tela e na API. A tela mostra o erro
no horário que tem o problema; a API recusa a grade.

**A API ganhou uma regra: o tempo mínimo de entrega não passa do máximo.** O tempo de preparo já
tinha; o de entrega aceitava invertido.

**A tela só deixa salvar o que a API aceita.** Ao menos entrega ou retirada; com taxa por região,
ao menos uma região ativa; nomes de região sem repetição. Uma parte do formulário que esteja com
erro não some da tela ao desligar a entrega ou trocar o tipo de taxa — escondida, seria um
"Salvar" que não faz nada, sem explicação.

**A regra entre campos roda mesmo com outro campo inválido.** Como na Fase 21, com o `when` do
`refine` — agora num auxiliar só (`comCamposValidos`). A checagem por mutação mostrou que o
primeiro teste disso passava sem o `when`: o Zod só pula a regra quando o campo vizinho falha numa
conversão, não num tamanho. O teste foi refeito com uma taxa que não é valor.

**Corrigido na validação do Junio: a mensagem de uma regra ficava na tela depois de corrigida.**
Ele marcou "Taxa fixa" e continuou vendo "Com a taxa por região, cadastre ao menos uma região
ativa". O erro de uma regra entre campos fica guardado num campo só, e o formulário só conferia de
novo o campo em que a pessoa mexia; corrigir pelo outro lado deixava a mensagem até o próximo
"Salvar". Agora mexer num campo confere de novo os que dependem dele (`reconferir`, em
`form-fields.ts`) — só os que já estão com erro, para não cobrar antes da hora. O mesmo defeito
existia em mais sete lugares, todos corrigidos e com teste: desligar a entrega, ligar a entrega
com "ligue a entrega ou a retirada" na tela, o tempo mínimo de entrega, o nome repetido e a região
ativa, a hora de fechar e o outro horário do dia na aba Horários, e o tempo de preparo na aba
Estabelecimento, que vinha da Fase 21.

**Uma linha de região em branco não é uma região.** Achado ao repetir o caso dele no navegador:
quem clicava em "Adicionar região", desistia e marcava "Taxa fixa" ficava impedido de salvar por
causa da linha vazia. Sem nome e sem taxa, a linha não é cobrada, não conta como região ativa e
não é enviada. Com a taxa preenchida, o nome passa a ser cobrado.

**Um teste que olha uma vez só pode passar por acaso.** O primeiro teste de "a mensagem some ao
acrescentar uma região" passava, e no navegador a mensagem voltava: o formulário confere a lista
de novo logo depois, e o teste olhava antes. As esperas por "a mensagem sumiu" agora olham, dão
tempo ao formulário e olham de novo (`sumiuDeVez`).

**Salvar marca a lista do Início para ser relida.** O teste que eu tinha passava sem a marca — ao
voltar ao Início a lista seria relida de qualquer jeito. Ficou um teste direto da marca, para os
três "Salvar".

**As peças comuns das abas viraram componentes** (`form-parts.tsx`): o cartão da seção, o aviso de
quem só pode ver, o rodapé com o "Salvar", a espera dos dados e a caixa de marcar com explicação.
A aba Estabelecimento passou a usá-las.

**Visto num navegador de verdade**, em 360, 390 e 1280 px, num estabelecimento descartável criado
do zero: o cardápio respondeu `NAO_RECEBENDO` recém-criado, com horário e sem entrega, e com
entrega e sem pagamento; abriu depois da forma de pagamento. Três ajustes saíram das capturas: o
campo de hora era estreito para um navegador em inglês (AM/PM), o "Remover" da região estava
desalinhado e a aba aberta ficava fora da vista no celular.

Nenhuma rota nova. A coleção do Postman mudou só nas descrições — importe de novo.

### Verificação executada

| Verificação                                       | Resultado                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm verify`                                     | **900 testes** (583 API + 277 web + 40 shared); formatação, typecheck, lint e build   |
| Clone limpo, `--frozen-lockfile`                  | os mesmos 900 testes                                                                  |
| Cardápio sem a regra de entrega ou retirada       | falha "entrega por região sem nenhuma região ativa não é entrega" e o pedido recusado |
| Cardápio sem a regra da forma de pagamento        | falha "com retirada e sem forma de pagamento, continua sem receber"                   |
| Tempo de entrega invertido aceito pela API        | falha "recusa tempo de entrega invertido"                                             |
| Encostar dois horários contando como sobreposição | falha "encostar não é sobrepor"                                                       |
| Erro do horário no intervalo errado               | falha "o erro vai para o intervalo que tem o problema"                                |
| Parte com erro sumindo ao desligar a entrega      | falha "uma parte com erro não some da tela ao desligar a entrega"                     |
| Regra entre campos sem o `when`                   | falham os dois testes de regra com campo vizinho inválido                             |
| Menu do painel marcando só o endereço exato       | falha "o menu do painel continua marcando Configurações dentro de uma aba"            |
| Salvar sem marcar a lista do Início               | falha "gravar … marca a lista do que falta para ser relida", nos três                 |
| Campo sem conferir de novo os que dependem dele   | falha o teste de cada um dos oito casos, um por mutação                               |
| Conferir de novo mesmo sem erro na tela           | falha "escolher taxa por região pela primeira vez não cobra a região antes da hora"   |
| Linha de região em branco enviada, ou contando    | falha "uma linha de região em branco não é região" e o de salvar com taxa fixa        |
| O caso do Junio, num navegador de verdade         | por região → salvar → taxa fixa: a mensagem some; com a linha em branco, salva        |
| Navegador de verdade, em 360, 390 e 1280 px       | as três abas, de um cadastro novo até o cardápio abrir; sem erro no console           |
| Validação do Junio                                | a fazer                                                                               |

O clone limpo recebeu as alterações da árvore de trabalho por cima, porque nada foi commitado.

**O que não conferi.** O navegador que uso aqui mostra o campo de hora no formato de 12 horas
(AM/PM), qualquer que seja o idioma pedido. Num navegador em português ele aparece em 24 horas;
isso fica para a validação do Junio.

---

## Fase 21 — concluída

A primeira tela de gestão do painel: as configurações do estabelecimento. E o Início ganhou a
lista do que falta para receber pedidos.

### Microtasks

| #   | Tarefa                                                                                              | Status |
| --- | --------------------------------------------------------------------------------------------------- | ------ |
| 1   | API: `GET` e `PATCH /settings` passam a trazer e alterar o nome e o fuso, na mesma transação        | ✅     |
| 2   | API: `GET /api/v1/admin/setup-checklist`, com os seis passos                                        | ✅     |
| 3   | Tela Configurações, no menu: estabelecimento, contato, endereço e regras do pedido, num "Salvar" só | ✅     |
| 4   | Logo e capa pela tela, gravados ao escolher o arquivo                                               | ✅     |
| 5   | Só leitura para quem não tem `settings:update`                                                      | ✅     |
| 6   | Início: a lista "o que falta para receber pedidos"                                                  | ✅     |
| 7   | Cardápio público: o telefone de contato aparece formatado                                           | ✅     |
| 8   | Testes: API, regra da lista, conversões do formulário, tela, imagens e a lista no Início            | ✅     |

### Decisões e achados desta fase

**O nome e o fuso entraram na rota de configurações que já existia**, em vez de numa rota nova,
como o plano dizia. Para quem configura é um formulário só, e assim o "Salvar" grava tudo ou nada:
as duas tabelas são alteradas na mesma transação, com uma auditoria só.

**`tenants` não tem RLS, então o filtro pelo estabelecimento é explícito.** É o único lugar do
painel em que quem isola é o código, e não o banco. Há teste que tira o filtro e vê o nome de
outro estabelecimento mudar.

**O endereço do cardápio não é editável.** Está em links e cartazes já divulgados. Trocar o
endereço foi para o ROADMAP.

**O fuso virou um seletor com os cinco fusos do Brasil**, com o nome que a pessoa reconhece. O
fuso de quem se cadastrou de fora entra no seletor também: salvar o formulário não pode trocá-lo
sem a pessoa pedir.

**Configurações fica no fim do menu, abaixo de "Ver cardápio"** (pedido do Junio na validação), e
não entre Início e Pedidos: é tela que se ajusta de vez em quando. O menu ganhou a marca `rodape`
para isso.

**As imagens ficam fora do "Salvar".** São outra rota, e a pessoa vê o resultado ao escolher o
arquivo. As recusas da Fase 20 viram frases: grande demais, formato errado, imagem que não abre.

**A lista do Início é calculada na API, numa transação.** Seis passos: e-mail confirmado,
WhatsApp, horário, entrega ou retirada, forma de pagamento e ao menos um produto à venda. Ela só
informa; quem decide se um pedido é aceito continua sendo a criação do pedido. Some quando tudo
está feito, e volta se algo deixar de estar.

**Só um passo já tem tela: o WhatsApp.** Os de horário, entrega, pagamento e produtos aparecem na
lista sem link, porque as telas são das Fases 22 e 23. Cada tela que nascer acrescenta o seu
caminho em `features/admin/checklist.ts`.

**Achado — a entrega nasce ligada e grátis.** Desde a Fase 5, um estabelecimento novo começa com
entrega habilitada e taxa zero. Por isso o passo "entrega ou retirada" já aparece feito num
cadastro recém-criado, sem o dono ter decidido nada, e um cardápio poderia ir ao ar com entrega
grátis sem ele saber. A tela para ajustar é da Fase 22; a decisão do padrão ficou nas pendências.

**Uma regra entre dois campos precisa dizer quando roda.** O Zod só avalia a regra "tempo máximo
menor que o mínimo" se o formulário inteiro estiver válido; a pessoa só veria o erro depois de
corrigir os outros. O `when` do `refine` resolve.

**Visto num navegador de verdade**, em 390 e 1280 px, num estabelecimento descartável: a lista no
Início, o formulário, salvar e o envio do logo. Em tela grande os botões do logo quebravam em duas
linhas; a coluna foi alargada.

A coleção do Postman ganhou a rota da lista e o exemplo com nome e fuso — importe de novo.

### Verificação executada

| Verificação                                    | Resultado                                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                  | **825 testes** (571 API + 226 web + 28 shared); formatação, typecheck, lint e build                                                                                                                                                                                           |
| Clone limpo, `--frozen-lockfile`               | os mesmos 825 testes                                                                                                                                                                                                                                                          |
| Nome alterado sem filtrar pelo estabelecimento | falha "mudar o nome de um estabelecimento não mexe no de outro"                                                                                                                                                                                                               |
| Produto indisponível contando como à venda     | falha "cada configuração feita sai da lista"                                                                                                                                                                                                                                  |
| Lista do Início aparecendo com tudo feito      | falha "com tudo feito, a lista some"                                                                                                                                                                                                                                          |
| Quem só pode ver conseguindo editar            | falha "quem só pode ver não altera"                                                                                                                                                                                                                                           |
| Navegador de verdade, em 390 e 1280 px         | num estabelecimento descartável: lista no Início (1 de 6), configurações, salvar o WhatsApp, enviar o logo (guardado em WebP) e a lista acompanhando o que foi salvo, sem recarregar. Sem rolagem lateral nem erro no console. Descartável, arquivo e e-mails apagados no fim |
| Validação do Junio                             | a fazer                                                                                                                                                                                                                                                                       |

O clone limpo recebeu as alterações da árvore de trabalho por cima, porque nada foi commitado.

**Uma falha que não se repetiu.** Na primeira verificação completa, o teste de pedidos "o status só
avança, cancelar exige motivo, e tudo vai para a auditoria" falhou uma vez; passou nas seis
rodadas seguintes, sozinho e na suíte inteira. Não capturei a mensagem. O teste comparava os
registros de auditoria pela ordem sem pedir ordem ao banco, e passou a pedir — o que remove essa
fonte de variação, mas não prova que era a causa.

---

## Fase 20 — concluída

### Microtasks

| #   | Tarefa                                                                                        | Status |
| --- | --------------------------------------------------------------------------------------------- | ------ |
| 1   | `sharp` como dependência, em versão exata — sem script de instalação, sem exceção no pnpm     | ✅     |
| 2   | `tratarImagem`: sem metadados, girada pela orientação, reduzida ao tamanho do uso, em WebP    | ✅     |
| 3   | `trocarImagem` passa a tratar toda imagem; a chave é sempre `.webp`                           | ✅     |
| 4   | Recusas: imagem que não abre (422), pixels demais (422); SVG e afins continuam barrados antes | ✅     |
| 5   | Teto do envio de 5 para 15 MB                                                                 | ✅     |
| 6   | Plano gratuito: `maxProducts` 20 e `maxCategories` 10, conferidos ao criar, com trava         | ✅     |
| 7   | `GET /api/v1/admin/plan` mostra o uso de produtos e categorias                                | ✅     |
| 8   | Testes: GPS, giro, redução, transparência, recusas, limites e duas criações ao mesmo tempo    | ✅     |
| 9   | O limite de usuários passa a travar antes de contar, como produtos e categorias               | ✅     |

### Decisões e achados desta fase

**A imagem é refeita, não "limpa".** O que fica guardado é outra imagem, gerada a partir dos
pixels. Isso tira os metadados — a localização GPS de uma foto de celular, o modelo do aparelho —
e também o que estivesse escondido dentro de um arquivo de imagem válido. O arquivo enviado nunca
é guardado.

**Os tamanhos:** maior lado de 512 px no logo, 800 na categoria, 1200 no produto e 1600 na capa,
sem cortar e sem aumentar imagem pequena. Na API de verdade, uma foto de 8,1 MB e 4000×3000 virou
um WebP de 253 KB e 900×1200.

**A conferência dos primeiros bytes continua na frente, e ficou mais importante.** A biblioteca de
imagem abre SVG, GIF e TIFF. Tirando a conferência num teste, o SVG com `<script>` passa — é ela
que o barra.

**Dois limites além dos bytes:** 50 megapixels na entrada (uma imagem enorme e lisa cabe em poucos
KB e, aberta, ocuparia gigabytes) e 15 segundos por imagem.

**O teto do envio subiu para 15 MB.** Com 5 MB, a foto do celular era recusada antes de ser
reduzida. **Quem tem um `.env` antigo precisa trocar a linha** `UPLOAD_MAX_BYTES` — o teste na API
de verdade recebeu 413 por causa disso.

**Todo produto conta para o limite:** combo, indisponível, sem foto. O limite contém o espaço que
um cadastro gratuito pode ocupar. Excluir abre vaga; quem já passou do limite (um plano rebaixado)
mantém o que tem e só não cria mais.

**A conferência trava antes de contar.** Sem isso, duas criações ao mesmo tempo contam "19 de 20"
e as duas passam. O primeiro teste que escrevi para isso — cinco criações em paralelo — passava
**com e sem** a trava: as criações são tão rápidas que quase nunca se cruzavam, e o teste não
provava nada. Foi a checagem por mutação que mostrou. O teste que ficou segura a primeira criação
no meio e confere que a segunda espera por ela.

**O limite de usuários ganhou a mesma trava** (correção pedida pelo Junio na validação). Desde a
Fase 14 ele contava sem trava, com a mesma brecha: duas criações — ou uma criação e uma
reativação — ao mesmo tempo podiam passar de um. A brecha foi reproduzida em teste antes da
correção. A trava virou uma função só, `travarLimiteDoPlano`, usada pelos três limites exatos.

**As imagens enviadas antes desta fase não foram reprocessadas** — não há dado de produção. No
banco de desenvolvimento, as antigas continuam em JPEG ou PNG, com os metadados que tinham.

Os limites novos entram no banco pelo seed de planos: `pnpm db:seed` (idempotente, não mexe no
que já existe). A coleção do Postman mudou só nas descrições — importe de novo.

### Verificação executada

| Verificação                            | Resultado                                                                                                                                                                                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                          | **783 testes** (550 API + 205 web + 28 shared); formatação, typecheck, lint e build                                                                                                                                                                            |
| Clone limpo, `--frozen-lockfile`       | os mesmos 783 testes; o `sharp` instalou do zero, sem exceção no pnpm                                                                                                                                                                                          |
| Sem girar pela orientação              | falham os dois testes do giro                                                                                                                                                                                                                                  |
| Mantendo os metadados                  | falham os três testes da foto de celular com GPS                                                                                                                                                                                                               |
| Sem reduzir                            | falham os cinco testes de tamanho                                                                                                                                                                                                                              |
| Sem conferir o formato antes de tratar | falham "recusa SVG" e "recusa HTML disfarçado de PNG"                                                                                                                                                                                                          |
| Sem a trava antes da contagem          | falha "duas criações ao mesmo tempo" — a segunda é criada, furando o limite                                                                                                                                                                                    |
| Usuário criado sem a trava             | falha "duas criações ao mesmo tempo", no teste de usuários                                                                                                                                                                                                     |
| Produto criado sem conferir o plano    | falham o teste do limite e o das duas criações                                                                                                                                                                                                                 |
| API de verdade, na porta 3334          | num estabelecimento descartável: a 11ª categoria e o 21º produto recusados com a mensagem do plano; foto de 8,1 MB, 4000×3000, com GPS → WebP de 253 KB, 900×1200, de pé e sem EXIF; SVG 415; JPEG cortado 422. Descartável, arquivo e e-mails apagados no fim |
| Validação do Junio                     | a fazer                                                                                                                                                                                                                                                        |

O clone limpo recebeu as alterações da árvore de trabalho por cima, porque nada foi commitado.

---

## Fase 19b — concluída

Ajustes visuais do cardápio público, pedidos pelo Junio antes da Fase 20. Só o web: a API não
mudou.

- **Botão "Info"**, ao lado do status, abre uma janela como a do produto (`?info` na URL, para o
  "voltar" do celular fechá-la). Foram para ela as informações que ficavam no fim da página —
  horários, endereço, contato, formas de pagamento — e as condições de entrega que ficavam
  abaixo do status: taxa, tempo, pedido mínimo e retirada.
- **Menu de baixo** no cardápio, com Início, Histórico e Perfil. **Só o visual:** Histórico e
  Perfil ainda não levam a lugar nenhum, e são anunciados como indisponíveis para quem usa leitor
  de tela. A barra "Ver carrinho" fica logo acima dele, numa pilha só.
- **Os ícones** passaram a um arquivo comum, `components/icons.tsx`, usado pelo painel e pelo
  cardápio.

Um efeito a ter em mente: a taxa de entrega e o pedido mínimo deixaram de aparecer ao abrir o
cardápio — estão a um toque, em "Info". O pedido mínimo continua no carrinho, e a taxa, no
checkout.

Verificação: `pnpm verify` com **760 testes** (527 API + 205 web + 28 shared), e o cardápio visto
num navegador de verdade em 390 e 1280 px — janela "Info", menu de baixo com e sem o carrinho, e o
fim da página sem produto escondido atrás das barras.

---

## Fase 19 — concluída

O Super Admin age por comando: `pnpm plataforma <ação>`, rodado no servidor. Sem tela e sem rota
HTTP — quem não tem acesso ao servidor não alcança as ações.

### Microtasks

| #   | Tarefa                                                                                                   | Status |
| --- | -------------------------------------------------------------------------------------------------------- | ------ |
| 1   | `listar`, com status, plano, dono, e-mail confirmado e usuários ativos; filtro por status                | ✅     |
| 2   | `suspender`, com motivo obrigatório: status, sessões encerradas e conexões ao vivo fechadas              | ✅     |
| 3   | Middleware e renovação de sessão passam a recusar estabelecimento suspenso                               | ✅     |
| 4   | `reativar`: devolve o status de antes da suspensão                                                       | ✅     |
| 5   | `plano`: encerra a assinatura vigente e abre outra, com histórico                                        | ✅     |
| 6   | `reenviar-confirmacao`, pelo mesmo caminho do painel                                                     | ✅     |
| 7   | Auditoria de cada ação, sem usuário, com o operador e o motivo; origem `tenantContextFromPlatform`       | ✅     |
| 8   | Testes: linha de comando, as cinco ações, o corte das sessões e o isolamento entre estabelecimentos      | ✅     |
| 9   | Sessão encerrada por nós é apagada, não revogada: sem alerta falso de roubo nem derrubada da sessão nova | ✅     |

### Decisões e achados desta fase

**Suspender derruba quem já estava logado** — o achado da Fase 17, fechado. Três caminhos na mesma
transação: as sessões abertas são apagadas, o status vira `SUSPENDED` (e o usuário deixa de ser
carregado a cada requisição, então o token de acesso para de valer na hora) e um aviso fecha as
conexões ao vivo. O comando roda em outro processo e a API em execução recebe o aviso pelo
`NOTIFY` do banco.

**Sessão encerrada por nós é apagada, não revogada** (correção pedida pelo Junio na validação).
`revoked_at` é a marca da rotação: token revogado que reaparece é sinal de roubo e derruba todas
as sessões da pessoa. A desativação de usuário (Fase 14) e a suspensão marcavam as sessões como
revogadas, e isso tinha dois efeitos errados: a renovação recusada deixava um
`auth.refresh_reuse_detected` falso na auditoria; e, com a pessoa ou o estabelecimento
**reativado**, o aparelho que ficou com a sessão antiga derrubava as sessões novas. Agora a linha
é apagada, e o token que reaparece recebe só "sessão inválida". Os três casos foram reproduzidos
em teste antes da correção.

**Reativar devolve o status de antes da suspensão**, que a suspensão registra na auditoria. A
primeira regra — publicar só se o dono confirmou o e-mail — tiraria do ar os estabelecimentos do
seed, que estão ativos sem e-mail confirmado; a listagem no banco de desenvolvimento mostrou o
caso antes de a regra ir para os testes.

**O motivo da suspensão é obrigatório**, e fica na auditoria. O dono ainda não o vê: ao tentar
entrar, lê "Este estabelecimento está suspenso. Fale com o suporte." Avisar por e-mail e mostrar
o motivo estão no ROADMAP, porque dependem do contato de suporte (Fase 28).

**O operador vai para a auditoria** (`--operador`, ou o usuário do sistema). Não é autenticação:
quem roda o comando já tem acesso ao servidor. A tabela `platform_admins` continua para o painel
da plataforma, no ROADMAP.

**Sem privilégio a mais no banco.** O comando usa a role da API e abre o contexto de cada
estabelecimento. A única consulta nova fora de contexto é a listagem do registro, que nenhuma
rota usa.

Nenhuma rota mudou: a coleção do Postman continua a mesma.

### Verificação executada

| Verificação                                                         | Resultado                                                                                                                                                                                                               |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                                       | **757 testes** (527 API + 202 web + 28 shared); formatação, typecheck, lint e build                                                                                                                                     |
| Clone limpo, `--frozen-lockfile`                                    | os mesmos 757 testes, formatação, typecheck, lint e build                                                                                                                                                               |
| Middleware sem olhar o status                                       | falha "derruba quem já estava logado"                                                                                                                                                                                   |
| Renovação sem recusar o suspenso                                    | falha "segunda barreira: suspenso por fora do comando, a sessão aberta também não renova"                                                                                                                               |
| Suspensão sem encerrar as sessões                                   | falham o da auditoria, o do corte e "a sessão de antes não volta a valer"                                                                                                                                               |
| Sessões marcadas como revogadas, como era (desativação e suspensão) | falham os três testes do alerta falso de roubo e o do corte                                                                                                                                                             |
| Suspensão sem o aviso ao vivo                                       | falha "fecha na hora as conexões ao vivo"                                                                                                                                                                               |
| Reativação só pelo e-mail confirmado                                | falha "publicado sem e-mail confirmado volta ao ar"                                                                                                                                                                     |
| Comando de verdade, com uma API rodando na porta 3334               | num estabelecimento descartável: plano, suspender (a sessão aberta na API caiu: 401; login: 403), reativar e reenviar (e-mail no Mailpit); a auditoria ficou com as quatro ações. Descartável e e-mails apagados no fim |
| Comando compilado (`node dist/platform/cli.js`)                     | roda, como rodará em produção                                                                                                                                                                                           |
| Validação do Junio                                                  | a fazer                                                                                                                                                                                                                 |

O clone limpo recebeu as alterações da árvore de trabalho por cima, porque nada foi commitado.

---

## Fase 18c — concluída

Pedido do Junio antes de seguir para a Fase 19: as próximas fases criam várias telas de gestão, e
todas precisam de um lugar para morar. Em `/{slug}/admin`, um painel com menu lateral, parecido
com a referência que ele enviou (Anota AI, em tela grande).

### Decisões do Junio (2026-10-01)

- **A primeira tela é "Início", com o resumo do dia:** pedidos novos, em andamento e concluídos
  hoje, os avisos e o atalho para os pedidos.
- **A tela de Pedidos entra como está** (lista com as abas "Em andamento" e "Encerrados"). O quadro
  em colunas da referência vira uma fase própria.
- **Mobile-first e responsivo.** A referência é a versão de tela grande; o painel nasce pelo
  celular.

### Microtasks

| #   | Tarefa                                                                                                    | Status |
| --- | --------------------------------------------------------------------------------------------------------- | ------ |
| 1   | API: `GET /api/v1/admin/orders/summary` — novos, em andamento e concluídos hoje, no fuso do tenant        | ✅     |
| 2   | `lib/timezone.ts`: `inicioDoDia` ao lado de `inicioDoMes`, que saiu de `plans/limits.ts`                  | ✅     |
| 3   | Moldura (`AdminLayout`): sessão, conexão ao vivo, som e título da aba num lugar só                        | ✅     |
| 4   | Menu (`menu.ts` + `AdminNav`): itens por permissão, pedidos novos ao lado de "Pedidos", gaveta no celular | ✅     |
| 5   | Tela Início em `/{slug}/admin`; login e cadastro passam a levar a ela                                     | ✅     |
| 6   | Tela de Pedidos dentro da moldura, só com o que é dela                                                    | ✅     |
| 7   | Testes: resumo e fuso na API; menu, moldura, Início, pedido novo e som fora da tela de pedidos no web     | ✅     |

### Decisões e achados desta fase

**O que vale para o painel inteiro subiu para a moldura.** A conferência da sessão, a conexão ao
vivo, o alerta sonoro e o número de pedidos novos no título da aba moravam na tela de Pedidos. Com
várias telas, quem estivesse em outra deixaria de ouvir o pedido novo. Agora há uma conexão só, que
não cai ao trocar de tela — e há teste para isso.

**Tela nova no painel é uma linha e uma rota.** Uma entrada em `features/admin/menu.ts`, com a
permissão que a API exige, e uma rota filha de `/:tenantSlug/admin` em `App.tsx`. É o que as Fases
21 a 26 vão fazer; a receita está no DEVELOPMENT.md.

**O resumo vem de uma rota própria, e não da lista.** A lista traz os 50 pedidos mais recentes;
contar "concluídos hoje" a partir dela erraria num dia cheio. A rota também serve ao número do
menu, sem carregar 50 pedidos com itens em toda tela. "Hoje" é o dia do estabelecimento, no fuso
dele.

**O menu é um elemento só.** No celular é gaveta (fechada, fica fora do teclado e do leitor de
tela); a partir de `lg`, coluna fixa. Sem duplicar os links na página.

**O número de pedidos novos tem rótulo próprio para leitor de tela** ("Pedidos, 2 novos"). Sem
isso, o nome do link sairia "Pedidos2".

**O aviso de confirmação do e-mail foi para o Início.** É assunto do estabelecimento, não da lista
de pedidos. O aviso do plano aparece nas duas telas.

**Visto num navegador de verdade:** capturas em 390, 768 e 1280 px de largura mostraram o nome do
estabelecimento cortado na barra do topo (celular) e no menu (tela grande); os dois foram
corrigidos antes da entrega.

**O quadro de pedidos em colunas** (Novos | Em preparo | Prontos e em entrega) ficou fora, por
decisão do Junio: fase própria, a encaixar.

A coleção do Postman ganhou a rota do resumo — importe de novo.

### Verificação executada

| Verificação                                | Resultado                                                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                              | **718 testes** (488 API + 202 web + 28 shared); formatação, typecheck, lint e build                                                 |
| Clone limpo, `--frozen-lockfile`           | os mesmos 718 testes, formatação, typecheck, lint e build                                                                           |
| Menu sem o filtro de permissão             | falham o teste dos itens por permissão e o de quem não vê pedidos                                                                   |
| Moldura sem conferir de quem é a sessão    | falha "sessão de outro estabelecimento não abre este painel"                                                                        |
| Início do dia em UTC                       | falham os quatro testes do fuso e o do resumo "hoje é o dia do estabelecimento"                                                     |
| API de verdade, na porta 3334              | o resumo da Lanchonete do Zé bate com a lista: o pedido concluído hoje conta, o de 29/09 não                                        |
| Navegador de verdade (Chromium sem janela) | login, Início e Pedidos em 390, 768 e 1280 px: gaveta no celular, menu fixo em tela grande, sem rolagem lateral nem erro no console |
| Validação do Junio no navegador            | a fazer                                                                                                                             |

O clone limpo recebeu as alterações da árvore de trabalho por cima, porque nada foi commitado.

---

## Fase 18b — concluída

Pedido do Junio antes de seguir para a Fase 19: o dono pode não saber o endereço do próprio
cardápio, então o login pede **só e-mail e senha**, e o sistema acha o estabelecimento.

### Decisões do Junio (2026-10-01)

- **O mesmo e-mail não existe em dois estabelecimentos.** É o e-mail que diz de qual
  estabelecimento a pessoa é. Cada estabelecimento continua com vários usuários — o dono e os
  funcionários, cada um com o seu e-mail e a sua senha —, e todos entram pela mesma tela. Quem tem
  dois estabelecimentos usa um e-mail em cada.
- **`/{endereço}/admin` deixou de existir.** O login é um só, em `/entrar`. Sem redirecionamento
  para link antigo: a aplicação é nova, e o código fica mais simples.
- **Estabelecimento suspenso só é dito depois de a senha conferir.** Antes disso, a resposta é
  sempre "e-mail ou senha não conferem".

### Microtasks

| #   | Tarefa                                                                                                    | Status |
| --- | --------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Banco: e-mail único na plataforma e em minúsculas; policy `login_por_email`, só de leitura (migration 22) | ✅     |
| 2   | `tenantDoEmail` e a origem `tenantContextFromLoginEmail`; o login deixa de receber `tenantSlug`           | ✅     |
| 3   | A sessão — login, renovação e cadastro — traz o estabelecimento (`establishment`)                         | ✅     |
| 4   | Cadastro e criação de usuário recusam e-mail que já tem conta (`EMAIL_TAKEN`, `USER_EMAIL_TAKEN`)         | ✅     |
| 5   | Web: `/entrar` vira o login; sai `/{endereço}/admin`; o painel sem sessão volta para `/entrar`            | ✅     |
| 6   | Coleção do Postman: login só com e-mail e senha, guardando o `tenantSlug` da resposta                     | ✅     |
| 7   | Testes: isolamento da leitura por e-mail, guarda das policies, login, cadastro, usuários e telas          | ✅     |

### Decisões e achados desta fase

**Como a API acha o estabelecimento sem furar o isolamento.** `users` está sob RLS, e nenhuma role
ignora RLS. A saída foi uma segunda policy em `users`, só de `SELECT`: quem define
`app.login_email` lê a linha daquele e-mail e nenhuma outra. Não há tabela global de e-mails, que
seria uma lista de dados pessoais legível sem contexto. O teste-guarda passou a listar as policies
que não filtram pelo tenant — uma nova aparece na revisão.

**O cadastro passou a dizer que um e-mail já tem conta.** Antes, o mesmo e-mail podia cadastrar
outro estabelecimento, e a resposta nunca revelava quem tinha conta. É o custo de entrar só com
e-mail e senha, e está em SECURITY.md, seção 3. O limite de 10 cadastros por hora por IP continua.

**Quem já tem sessão e abre `/entrar` vai direto para o painel.** Não é redirecionamento de link
antigo: o dono não sabe o endereço do painel, e sem isso digitaria a senha a cada visita.

**Sessão de outro estabelecimento não abre o painel de um endereço alheio:** a pessoa cai no
painel do dela.

**Saiu código que só servia a versões anteriores:** a tela de login por estabelecimento, a leitura
do endereço digitado em `/entrar` e a limpeza da chave antiga do `localStorage`.

**Para a Fase 25:** o "esqueci minha senha" acha a conta pelo e-mail com `tenantDoEmail`.

**Banco de desenvolvimento com e-mail repetido:** a migration 22 falha num banco que tenha o mesmo
e-mail em dois estabelecimentos. O DEVELOPMENT.md diz como achar e resolver.

A coleção do Postman mudou — importe de novo.

### Verificação executada

| Verificação                        | Resultado                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm verify`                      | **696 testes** (479 API + 189 web + 28 shared); formatação, typecheck, lint e build                                            |
| Clone limpo, `--frozen-lockfile`   | os mesmos 696 testes, formatação, typecheck, lint e build                                                                      |
| Sem a policy `login_por_email`     | o login, a leitura por e-mail e a guarda das policies falham (18 testes)                                                       |
| Sem a unicidade global do e-mail   | falham o teste do banco, o do cadastro e os dois da criação de usuário                                                         |
| Suspensão conferida antes da senha | falha "só revela a suspensão depois de a senha conferir"                                                                       |
| API de verdade, na porta 3334      | login do seed só com e-mail e senha devolve `lanchonete-do-ze`; renovação idem; cadastro com e-mail existente dá `EMAIL_TAKEN` |
| Página no navegador                | a fazer na validação                                                                                                           |

O clone limpo recebeu as alterações da árvore de trabalho por cima, porque nada foi commitado: o
Junio pediu para ver tudo antes.

---

## Fase 18 — concluída

### Microtasks

| #   | Tarefa                                                                                               | Status |
| --- | ---------------------------------------------------------------------------------------------------- | ------ |
| 1   | Página inicial em `/`, no lugar da página de teste do ambiente, com a moldura das páginas do produto | ✅     |
| 2   | `/cadastro`: regras de `@repo/shared`, endereço sugerido pelo nome e conferido enquanto se digita    | ✅     |
| 3   | `/entrar`: pergunta o endereço e leva ao login daquele estabelecimento — _trocado na Fase 18b_       | ✅     |
| 4   | `/confirmar-email`: token do fragmento, tirado do endereço depois de lido; um POST só                | ✅     |
| 5   | `/termos` e `/privacidade`, com texto provisório e a versão em vigor                                 | ✅     |
| 6   | Painel: aviso "seu cardápio ainda não está no ar", com reenvio, para quem cuida das configurações    | ✅     |
| 7   | Checkout: aviso de para onde vão os dados, com a política de privacidade em outra aba                | ✅     |
| 8   | Cardápio não encontrado: dica genérica para quem acabou de se cadastrar                              | ✅     |
| 9   | Testes: página inicial, entrar, cadastro, confirmação, aviso do painel, checkout, regras do endereço | ✅     |

### Decisões e achados desta fase

**O endereço acompanha o nome até a pessoa mexer nele** — "Lanchonete do Zé" sugere
`lanchonete-do-ze` — e volta a acompanhar se ela o apagar. A disponibilidade é conferida 400 ms
depois da última tecla, e só para endereço já no formato certo: fora dele, quem fala é a
validação, com a mesma mensagem da API.

**O cadastro chama a API com `credentials`**, como o login: a resposta traz o refresh token num
cookie, e sem isso o navegador o descartaria — a sessão morreria no primeiro recarregamento. Há
teste para isso.

**A confirmação tira o token do endereço** assim que o lê: ele não fica no histórico nem vai junto
se a pessoa copiar o link. O POST acontece uma vez por token — o React Query não o repete quando o
React monta a página duas vezes —, e um segundo clique no link responde "já estava confirmado", e
não erro.

**O campo-armadilha fica fora da tela, do teclado e do leitor de tela** (`aria-hidden`,
`tabIndex=-1`): só robô o preenche.

**Fuso do aparelho, sem pergunta.** O cadastro manda o fuso do navegador, se o `Intl` o reconhece —
o palpite certo para quase todo mundo, que se cadastra de onde fica o estabelecimento. Achado: o
fuso **não é editável em lugar nenhum** depois do cadastro. Entrou na tela de configurações da
Fase 21.

**A página inicial não cita os números do plano gratuito.** Os limites vivem no catálogo da API
(`catalogs.ts`); escritos na página, ela mentiria na primeira mudança de plano. Diz só "plano
gratuito, sem cartão de crédito".

**Termos e privacidade provisórios**, com o aviso na própria página. O texto mora em
`features/legal/textos.ts`; trocá-lo exige trocar `VERSAO_DOS_TERMOS` (`packages/shared`), que é a
versão que cada cadastro registra. O definitivo é do Junio, antes do primeiro estabelecimento real
(Fase 28).

**A dica do cardápio não encontrado é genérica** — "acabou de cadastrar o seu? Ele aparece depois
que você confirmar o e-mail" — e aparece para qualquer endereço desconhecido: não revela se aquele
espera confirmação.

**O aviso de confirmação é de quem cuida das configurações:** aparece com `settings:read` e reenvia
com `settings:update`; o atendente nem consulta.

**A página de verificação do ambiente saiu.** A sonda de saúde no web só servia a ela; o teste da
troca de tema em tempo de execução, que ela demonstrava, virou teste das próprias funções de tema.

**Na validação, a senha do cadastro ganhou regras** (pedido do Junio): pelo menos 8 caracteres,
uma letra maiúscula, uma minúscula e um caractere especial — letra com ou sem acento; especial é
o que não é letra, número nem espaço. As regras moram em `REGRAS_DA_SENHA` (`packages/shared`): o
schema recusa cada uma com a própria mensagem, e a tela as lista marcadas enquanto a pessoa digita.
A criação de usuários do painel ainda pede só os 8 caracteres; a mesma regra chega lá na Fase 25.
Os exemplos de senha da coleção do Postman mudaram — importe de novo.

### Verificação executada

| Verificação                           | Resultado                                                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                         | **674 testes** (463 API + 187 web + 24 shared); formatação, typecheck, lint e build                                                    |
| Clone limpo, `--frozen-lockfile`      | os mesmos 674 testes, formatação, typecheck, lint e build                                                                              |
| Depois do ajuste da senha (validação) | `pnpm verify`: **680 testes** (463 API + 189 web + 28 shared)                                                                          |
| Testes sensíveis à regra              | cadastro sem `credentials`, token que fica no endereço, nome que sobrescreve o endereço editado, aviso para quem não pode: cada um cai |
| Página no navegador                   | a fazer na validação                                                                                                                   |

---

## O que falta para o MVP

As fases 1 a 22 estão feitas, mas o MVP **ainda não cumpre** o seu próprio critério de pronto
(MVP.md, "Como saber que acabou"). Os passos 1 e 2 — cadastrar pela página inicial, confirmar o
e-mail, entrar e configurar o estabelecimento, os horários, a entrega e o pagamento — e os passos
4 a 7 funcionam de ponta a ponta. O passo 3, o cardápio, só funciona **pela API**, e o sistema
ainda não está no ar. As fases 23 a 28 fecham essa distância.

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

- **Tela nova do painel: uma entrada no menu e uma rota filha** (`features/admin/menu.ts` e
  `App.tsx`), feita pelo celular primeiro. Como fazer: DEVELOPMENT.md, "Acrescentando uma tela ao
  painel".

Começar pelo cadastro permite validar cada tela seguinte num estabelecimento **recém-cadastrado e
vazio**, como faria alguém que nunca viu o sistema.

### Fases 22 a 24 — Configurações restantes e cardápio

- **22 (concluída):** horários, entrega e retirada, formas de pagamento, em abas dentro de
  Configurações. O estabelecimento novo passou a nascer com a entrega e a retirada desligadas.
- **23:** categorias e produtos, com imagem. Reordenação de produtos em lote
  (`PUT /products/order`), como a de categorias, se a tela precisar.
- **24:** grupos de opção, adicionais e combos.
- Todas sobre rotas que já existem: `admin-settings.ts`, `admin-catalog.ts` e
  `admin-customization.ts`.
- As telas de categorias e produtos (Fase 23) mostram o uso do plano — `products` e `categories`,
  em `GET /api/v1/admin/plan` — e a recusa `PLAN_PRODUCT_LIMIT` / `PLAN_CATEGORY_LIMIT` da Fase 20.
- O envio de imagem pelas telas (Fases 21 e 23) trata as recusas da Fase 20: 413 (mais de 15 MB),
  415 (não é JPEG, PNG nem WebP) e 422 (`UNREADABLE_IMAGE`, `IMAGE_TOO_LARGE`).

### Fase 25 — Usuários e senha

- Tela de usuários sobre a API da Fase 14.
- Cada pessoa troca a própria senha, e o dono redefine a de um atendente.
- As regras de senha do cadastro (`REGRAS_DA_SENHA`, Fase 18) passam a valer para toda senha do
  painel: criação de usuário, troca e redefinição.
- "Esqueci minha senha" por e-mail, com o envio da Fase 17 — e o mesmo desenho do link de
  confirmação: token com o tenant embutido, só o hash no banco, no fragmento do link. A conta é
  achada pelo e-mail com `tenantDoEmail` (Fase 18b), e a resposta é a mesma exista o e-mail ou não.

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

> **Repositório privado antes da publicação oficial — obrigatório** (decisão do Junio, validação da
> Fase 18). Hoje o repositório no GitHub é público: o código e o SECURITY.md, que descreve as
> defesas e as fraquezas conhecidas, estão à vista de qualquer um. Antes do primeiro estabelecimento
> real: Settings → General → Danger Zone → Change visibility → Private. Com o repositório
> privado, o CI passa a contar os minutos gratuitos do GitHub (2.000 por mês), e o canal para
> relatar vulnerabilidade vira um contato no próprio produto (SECURITY.md).

- Escolher a hospedagem, no início da fase.
- Dockerfiles de produção, HTTPS e a CSP da aplicação web.
- Backup do banco e das imagens, com a restauração testada.
- **Seed essencial de produção** — papéis, formas de pagamento e planos, sem os estabelecimentos
  de demonstração. Hoje o plano FREE só existe porque o seed de demonstração o cria.
- SMTP de produção com SPF e DKIM; rate limit compartilhado, se houver mais de uma instância; os
  textos jurídicos finais.

---

## Fases anteriores

**Fase 17** entregou o cadastro aberto pela API, no plano gratuito: o estabelecimento nasce
`PENDING` — o mesmo 404 de um endereço inexistente — e é publicado quando o dono confirma o e-mail;
o e-mail de confirmação não repete nada do que foi digitado, e o token vai no fragmento do link. O
envio de e-mail passou a existir (SMTP, com o Mailpit em desenvolvimento), e o seed cria os
estabelecimentos pelo mesmo caminho do cadastro. Depois dela veio a coleção do Postman, gerada
das rotas por `pnpm postman`.

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
| Sair de uma aba das configurações com alterações não salvas perde o que foi digitado, sem aviso                                                                   | A decidir; ver ROADMAP                   |
| Quadro de pedidos em colunas, como na referência do Junio — a tela de Pedidos ainda é uma lista                                                                   | Fase própria, a encaixar                 |
| Histórico e Perfil, no menu de baixo do cardápio, ainda sem função — só o visual existe                                                                           | A definir pelo Junio                     |
| Repositório público no GitHub — tornar privado antes da publicação oficial (obrigatório)                                                                          | Fase 28                                  |
| CI desligado — o workflow está em `CI_PARA_IMPLEMENTAR_DEPOIS.txt`                                                                                                | Fase 28, antes do deploy                 |
| Sem Dockerfile para API e web                                                                                                                                     | Fase 28                                  |
| Rate limit conta em memória — vira limite por instância se houver mais de uma                                                                                     | Fase 28, se houver mais de uma instância |
| Os catálogos (papéis, formas de pagamento, planos) só são semeados pelo seed de demonstração — já separados em `seed-rbac`, `seed-payment-methods` e `seed-plans` | Fase 28 (seed essencial de produção)     |
| Contrato do cardápio público copiado no web, fora do `packages/shared`                                                                                            | Quando o contrato mudar de novo          |
| Checkout não lembra os dados no aparelho ao voltar ao cardápio                                                                                                    | ROADMAP                                  |
