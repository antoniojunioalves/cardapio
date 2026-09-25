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
- Editor visual de temas _(a arquitetura já existe; falta a interface)_
- Isolamento físico opcional para tenants de plano CUSTOM — banco dedicado, trocando apenas a
  obtenção de conexão dentro de `withTenant`
- Multi-unidade e franquias
- Internacionalização _(o MVP é pt-BR, sem biblioteca de i18n)_

## Infraestrutura

- Storage externo (S3 ou equivalente), atrás do `StorageService` que já existe
- Dockerfiles de produção para API e web
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
