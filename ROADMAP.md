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

1. **Mascarar** o endereço recuperado ("Rua das Flores, 1•• — Centro") até haver confirmação.
2. **OTP** por WhatsApp ou SMS antes de exibir qualquer dado pessoal por telefone.

### Rate limiting na consulta por telefone

Sem ele, o endpoint de identificação vira uma ferramenta de varredura de endereços. Limite
específico, mais estrito que o global.

### Retenção e eliminação de dados pessoais

Anonimização de cliente preservando o histórico de pedidos, exportação de dados do titular e
política de retenção. O MVP não implementa fluxo de titular de dados.

---

## Autenticação e contas

- OTP por SMS e WhatsApp
- Login via WhatsApp
- Login com Google
- Login com Apple
- Recuperação de conta mais robusta
- Autenticação em dois fatores para usuários administrativos
- Bloqueio temporário de conta após N tentativas falhas — hoje há apenas o limite por IP
- Histórico de senhas, para impedir reuso da anterior
- Papéis personalizados por estabelecimento — hoje OWNER, ADMIN e STAFF são globais
- Painel da plataforma para o Super Admin — hoje existe só a estrutura de dados

## Endereço e entrega

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

## Experiência do cliente

- Acompanhamento do status do pedido em tempo real
- Notificações push
- Avaliação do estabelecimento
- Avaliação de produtos
- Pedir novamente a partir do histórico
- Lista de favoritos

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

- Autosserviço de cadastro de estabelecimento
- Subdomínio por tenant — `tenant.dominio.com`
- Domínio próprio do tenant
- Cores do estabelecimento no cardápio público: guardar o tema em `tenant_settings`, devolvê-lo
  na rota pública e aplicá-lo com `applyTenantTheme()` _(os tokens já suportam; falta o dado)_
- Editor visual de temas _(a arquitetura já existe; falta a interface)_
- Horário de funcionamento 24 horas sem interrupção — hoje se escreve 00:00–23:59
- Isolamento físico opcional para tenants de plano CUSTOM — banco dedicado, trocando apenas a
  obtenção de conexão dentro de `withTenant`
- Multi-unidade e franquias
- Internacionalização _(o MVP é pt-BR, sem biblioteca de i18n)_

## Infraestrutura

- Storage externo (S3 ou equivalente), atrás do `StorageService` que já existe
- **Processamento de imagem no upload:** remover metadados EXIF (podem conter a localização GPS
  de onde a foto foi tirada), redimensionar e converter para WebP. Hoje uma foto de celular de
  5 MB é entregue inteira ao cliente no 4G
- Limpeza periódica de arquivos órfãos — sobram quando a remoção do arquivo antigo falha depois
  do commit
- Cota de armazenamento por plano
- Dockerfiles de produção para API e web
- Armazenamento compartilhado para o rate limit (Redis) — hoje o contador vive na memória do
  processo, o que vira um limite por instância assim que houver mais de uma
- CI/CD
- Backup automatizado e restauração testada
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

| Assunto           | Gatilho para revisitar                                             |
| ----------------- | ------------------------------------------------------------------ |
| TypeScript 7      | Quando o `typescript-eslint` publicar suporte                      |
| `packages/shared` | Quando houver o primeiro schema Zod realmente usado nos dois lados |
| Editor de temas   | Quando um tenant pedir identidade visual própria                   |
| Isolamento físico | Quando existir um cliente de plano CUSTOM que justifique o custo   |
