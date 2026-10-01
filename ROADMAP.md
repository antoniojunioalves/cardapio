# Roadmap

Tudo que está fora do MVP, com o motivo de estar fora. Nada aqui tem data. A ordem dentro de
cada bloco é por prioridade percebida hoje, e muda conforme o produto encontrar usuários reais.

---

## Prioridade alta — dívidas assumidas

Estas não são funcionalidades novas: são consequências de atalhos tomados conscientemente no
MVP, e quitá-las importa mais do que qualquer item das seções seguintes.

### OTP antes de revelar endereço

O MVP recupera o endereço do cliente a partir do telefone, o que significa que digitar o número
de outra pessoa revela o endereço dela. Ver [SECURITY.md](SECURITY.md#5-dívida-de-privacidade-assumida-identificação-por-telefone).

Quitação em duas etapas:

1. ~~**Mascarar** o endereço recuperado ("Rua das Flores, 1•• — Centro")~~ — feito na Fase 10.
2. **OTP** por WhatsApp ou SMS antes de exibir qualquer dado pessoal por telefone. Até lá, o
   primeiro nome, a rua e o bairro continuam visíveis para quem souber o telefone.

Com o OTP, a **mensagem do WhatsApp** (Fase 12) passa a levar o endereço completo também quando
o cliente escolhe um endereço salvo — decisão do Junio. Até lá, endereço salvo sai mascarado na
mensagem, e o estabelecimento vê o completo no pedido.

### Rate limiting na consulta por telefone

Feito na Fase 10: 10 identificações por minuto por IP. O que falta é o contador compartilhado
entre instâncias (Redis, junto com o deploy) e um limite por estabelecimento, contra varredura
distribuída entre muitos IPs.

### Retenção e eliminação de dados pessoais

Anonimização de cliente preservando o histórico de pedidos, exportação de dados do titular e
política de retenção. O MVP não implementa fluxo de titular de dados.

---

## Autenticação e contas

- Convite de usuário por e-mail — hoje o dono define a senha inicial, e a pessoa a troca depois
  (Fase 25)
- Transferência da posse do estabelecimento (papel `OWNER`)
- Troca do próprio e-mail, com nova confirmação — o link de confirmação (Fase 17) vale só para o
  e-mail ao qual foi enviado, então a troca já nasce protegida; falta a funcionalidade
- Captcha no cadastro, se aparecer abuso — hoje há limite por IP, campo-armadilha e o cardápio só
  vai ao ar depois da confirmação do e-mail (Fase 17)

- OTP por SMS e WhatsApp
- Login via WhatsApp
- Login com Google
- Login com Apple
- Recuperação de conta mais robusta
- Autenticação em dois fatores para usuários administrativos
- Bloqueio temporário de conta após N tentativas falhas — hoje há apenas o limite por IP
- Histórico de senhas, para impedir reuso da anterior
- **Conta de cliente final, com os dados completos no checkout.** Hoje o cliente é reconhecido só
  pelo telefone, e por isso o checkout mostra apenas o primeiro nome e os endereços mascarados
  (SECURITY.md, seção 5): telefone não prova quem está digitando. Com o cliente **logado na
  própria conta**, a identidade está provada, e o checkout deve trazer tudo preenchido e visível —
  nome completo, endereços completos (CEP, rua, número, complemento, referência) para conferir e
  editar. O comportamento mascarado continua valendo para quem pede sem login.
- Papéis personalizados por estabelecimento — hoje OWNER, ADMIN e STAFF são globais
- Painel da plataforma para o Super Admin — no MVP ele age por comando (Fase 19); a tabela
  `platform_admins` fica para este painel

## Endereço e entrega

- **Busca do endereço pelo CEP na base dos Correios.** O campo CEP já existe e é o primeiro do
  endereço no checkout (Fase 10); a consulta vai preencher rua, bairro e cidade a partir dele, e
  o cliente só completa número e complemento. A escolha do serviço (API dos Correios ou uma
  intermediária) e o que fazer quando ele estiver fora do ar ficam para essa fase — o cliente
  precisa continuar podendo digitar à mão.
- **Região de entrega atrelada ao endereço.** Hoje, na entrega por região, o cliente escolhe a
  região a cada pedido, inclusive quando usa um endereço salvo — que não guarda a região (Fase
  10). O objetivo é o endereço já trazer a sua região, e o cliente não precisar escolher de novo.
  **A usabilidade ainda vai ser pensada antes de implementar.** Pontos em aberto:
  - como a região se liga ao endereço: escolhida uma vez e guardada nele, deduzida do bairro, ou
    por faixa de CEP cadastrada pelo lojista;
  - as regiões hoje são salvas por substituição do conjunto e mudam de id a cada edição do
    lojista — guardar o id no endereço exige ids estáveis, ou guardar outra chave;
  - o que acontece quando a região do endereço é desativada ou removida, e quando o bairro do
    endereço não corresponde a nenhuma região;
  - se o cliente pode discordar da região sugerida, e como o lojista fica sabendo.
- Integração com Google Maps e Apple Maps
- Geocoding e armazenamento de latitude/longitude
- Seleção de endereço por pin no mapa
- Taxa de entrega calculada por distância
- Integração com serviços de entrega de terceiros

## Pagamento

### Do cliente final

- Pagamento online no app
- Pix integrado com confirmação automática
- Cartão de crédito e débito integrados
- "Troco para R$ X" no pagamento em dinheiro

### Do tenant (assinatura da plataforma)

- **Assinar um plano pago no cadastro.** A visão do Junio: a pessoa navega pela landing page,
  escolhe o plano, assina, faz o cadastro e já começa a usar. O MVP faz o cadastro só no plano
  gratuito (Fases 17 e 18); falta escolher um plano pago e pagar, o que depende da cobrança
  recorrente e do gateway abaixo.
- Cobrança de excedente e mudança de plano pelo próprio lojista — os limites já são aplicados
  (Fase 14), mas passar deles hoje só bloqueia

- Cobrança recorrente
- Escolha de gateway — Stripe, Mercado Pago ou outro; **nenhum foi escolhido**
- Autosserviço de upgrade e downgrade de plano
- Faturas e recibos

## Operação do estabelecimento

- Controle de estoque
- Baixa automática de estoque na confirmação do pedido
- Fornecedores e compras
- Impressão térmica de pedido
- Impressão automática na cozinha
- Painel de cozinha (KDS)
- WhatsApp Business API oficial, substituindo o link `wa.me`
- **Robô no WhatsApp para responder os clientes.** Pedido do Junio. Depende da WhatsApp Business
  API oficial (item acima): com ela, as mensagens dos clientes chegam ao sistema, e o robô
  responde. Pode reaproveitar o que já existe:
  - horário, aberto ou fechado, taxa de entrega, pedido mínimo e formas de pagamento, que vêm do
    cardápio público (Fase 8a);
  - o link do cardápio;
  - o status do pedido, junto com o acompanhamento pelo cliente (em "Experiência do cliente").

  A definir: o que o robô responde e quando passa a conversa para uma pessoa; um número por
  estabelecimento ou um só da plataforma; o custo por conversa cobrado pela Meta; e os dados
  pessoais que passam pela conversa (LGPD).

- Painel: menu recolhível só com ícones e busca no menu, como na referência que o Junio trouxe na
  Fase 18c. Fazem sentido quando o menu tiver itens demais para caber; hoje são dois. O quadro de
  pedidos em colunas não está aqui: é fase própria do MVP (PROJECT_PLAN.md, pendências).
- Consulta do registro de auditoria no painel. O registro existe desde a Fase 4, e a permissão
  `audit:read` já está no RBAC; no MVP basta o registro (decisão do Junio).

## Experiência do cliente

- **Acompanhamento do pedido pelo cliente, com o status atualizado.** Depois de enviar o pedido, o
  cliente acompanha numa página própria cada mudança feita no painel — recebido, aceito, em
  preparo, pronto, saiu para entrega, concluído ou cancelado (com o motivo). O que já existe e
  pode ser reaproveitado: o status do pedido e o seu caminho (Fase 11), os avisos emitidos a cada
  mudança de status e o canal ao vivo (Fase 13). Cuidados já decididos na arquitetura:
  - a página usa um **código público aleatório** do pedido, nunca o id nem o número sequencial
    (ARCHITECTURE.md, 4.2) — número sequencial em URL deixaria qualquer um ver os pedidos dos
    outros trocando um dígito;
  - a página mostra só o que o cliente pode ver: status, itens e valores, sem o endereço completo
    de um endereço salvo (a mesma regra da identificação por telefone);
  - hoje a confirmação não sobrevive a recarregar a página; o link de acompanhamento resolve isso.

  **O Junio vai pensar melhor em como fazer** — saiu do plano do MVP por isso. A ideia dele é
  guardar os dados dos pedidos no `localStorage`, como outros sites fazem. Pontos para essa
  decisão:
  - o status muda no servidor: o navegador guarda o pedido para mostrar, mas a atualização do
    status continua vindo da API;
  - num aparelho compartilhado, quem usar o navegador depois vê o nome, o telefone e o endereço
    dos pedidos anteriores;
  - o `localStorage` pode ser editado por qualquer um: serve para exibir, como o carrinho, e
    nunca como fonte de verdade.

- Notificações push
- Avaliação do estabelecimento
- Avaliação de produtos
- Pedir novamente a partir do histórico
- Lista de favoritos
- Carrinho que expira: hoje ele fica no navegador até ser esvaziado ou enviado
- Carrinho entre aparelhos, ligado ao cliente identificado
- Checkout que lembra nome e telefone no aparelho, sem precisar digitar de novo

## Catálogo

### Preço do combo parametrizável por estabelecimento

Pedido na validação da Fase 7b. Hoje o preço do combo é **fixo**, digitado pelo lojista, e não
acompanha os itens: se o X-Salada sobe de R$ 25,90 para R$ 27,90, o combo continua a R$ 39,90 até
alguém mudá-lo. A API já mostra o preço avulso ao lado, para o lojista perceber a diferença.

A evolução é deixar **cada estabelecimento escolher** o modo, porque a prática varia:

| Modo              | Como o preço é formado    | Exemplo                                   |
| ----------------- | ------------------------- | ----------------------------------------- |
| Fixo (atual)      | Valor digitado            | Combo a R$ 39,90                          |
| Percentual        | Soma dos itens menos X%   | Soma R$ 46,90, 15% de desconto → R$ 39,87 |
| Desconto em valor | Soma dos itens menos R$ Y | Soma R$ 46,90 − R$ 7,00 → R$ 39,90        |

Pontos a decidir quando for implementado:

- **Onde fica o parâmetro:** um padrão por estabelecimento, com possibilidade de sobrescrever
  por combo.
- **Arredondamento:** percentual gera centavos quebrados (R$ 39,87). A regra de arredondamento
  precisa ser única e explícita — é a mesma questão registrada para cupons.
- **O preço do pedido continua congelado** no momento da compra, como hoje: mudar o preço de um
  item não altera pedidos já feitos.
- **Auditoria:** no modo percentual, alterar o preço de um item muda o preço de todos os combos
  que o contêm. O registro precisa deixar isso rastreável.

### Cache do cardápio público

Hoje o cardápio público não usa cache: status e disponibilidade mudam a cada minuto. Com volume, a
evolução é separar o que muda pouco (cardápio, imagens) do que muda sempre (status, esgotados),
cachear a primeira parte na borda e invalidar a cada edição do lojista.

### Personalização dos componentes de um combo

Hoje os componentes de um combo vão no padrão, sem escolha de opções: o X-Salada do combo não
pergunta se o cliente quer bacon. O combo pode ter grupos de opção próprios ("escolha a bebida"),
mas não herda os do componente. Levar os grupos dos componentes para dentro do combo é uma
evolução com impacto no carrinho e no cálculo do pedido.

## Crescimento e retenção

- Cupons de desconto
- Promoções e combos promocionais por período
- Programa de fidelidade
- Pontos e cashback
- Relatórios avançados
- Analytics de produto e de funil

## Plataforma e multi-tenancy

- Subdomínio por tenant — `tenant.dominio.com`
- Domínio próprio do tenant
- Cores do estabelecimento no cardápio público: guardar o tema em `tenant_settings`, devolvê-lo
  na rota pública e aplicá-lo com `applyTenantTheme()` _(os tokens já suportam; falta o dado)_
- Editor visual de temas _(a arquitetura já existe; falta a interface)_
- Horário de funcionamento 24 horas sem interrupção — hoje se escreve 00:00–23:59
- Isolamento físico opcional para tenants de plano CUSTOM — banco dedicado, trocando apenas a
  obtenção de conexão dentro de `withTenant`
- Multi-unidade e franquias
- Uma pessoa em mais de um estabelecimento com a mesma conta. Hoje o e-mail é único na plataforma e
  pertence a um estabelecimento só (é o que permite entrar só com e-mail e senha — Fase 18b); quem
  tem dois usa um e-mail em cada. Para uma conta só, o usuário deixa de pertencer a um tenant: vira
  conta da plataforma, com vínculos a estabelecimentos e uma tela para escolher em qual entrar.
- Internacionalização _(o MVP é pt-BR, sem biblioteca de i18n)_

## Infraestrutura

- Storage externo (S3 ou equivalente), atrás do `StorageService` que já existe
- Limpeza periódica de arquivos órfãos — sobram quando a remoção do arquivo antigo falha depois
  do commit
- Cota de armazenamento por plano
- Armazenamento compartilhado para o rate limit (Redis) — hoje o contador vive na memória do
  processo, o que vira um limite por instância assim que houver mais de uma. A Fase 28 decide se
  já é preciso
- Deploy contínuo (CD) — o CI foi escrito na Fase 16 e volta na Fase 28
- Atualização automática das actions do CI e das dependências (Dependabot ou Renovate) — hoje
  as actions, fixadas pelo commit, são atualizadas à mão (DEVELOPMENT.md, "CI")
- Métricas e tracing distribuído

## SEO e descoberta

Deliberadamente fora do MVP: adotar SSR agora encareceria toda decisão seguinte por um benefício
que o produto ainda não tem como aproveitar.

- Metadata dinâmica por tenant
- Open Graph
- Sitemap
- Structured data (schema.org/Restaurant)
- SSR ou SSG para as páginas públicas
- PWA

---

## Revisões técnicas agendadas

| Assunto           | Gatilho para revisitar                                           |
| ----------------- | ---------------------------------------------------------------- |
| TypeScript 7      | Quando o `typescript-eslint` publicar suporte                    |
| Editor de temas   | Quando um tenant pedir identidade visual própria                 |
| Isolamento físico | Quando existir um cliente de plano CUSTOM que justifique o custo |
