# Escopo do MVP

O MVP está pronto quando **um estabelecimento real consegue receber pedidos pela plataforma**.
Tudo que não serve a essa frase fica de fora — e a lista do que fica de fora é tão importante
quanto a do que fica dentro, porque é ela que impede o escopo de crescer sem decisão.

---

## Dentro do MVP

### Plataforma

- [ ] Super Admin cria tenants (estrutura mínima, sem painel completo)
- [x] Modelo de planos preparado — `plans`, `plan_features`, `subscriptions` — sem cobrança

### Administração do estabelecimento

- [x] Login de usuário administrativo
- [x] Múltiplos usuários por tenant, com papéis `OWNER`, `ADMIN`, `STAFF` — _pela API; sem tela ainda_
- [ ] Configuração do estabelecimento: nome, logo, descrição, contato, WhatsApp
- [ ] Horário de funcionamento, com múltiplos intervalos no mesmo dia
- [ ] Taxa de entrega: valor fixo ou por região
- [ ] Retirada no estabelecimento, quando habilitada
- [ ] Pedido mínimo
- [ ] Formas de pagamento habilitáveis por tenant
- [ ] Categorias com ordenação
- [ ] Produtos com nome, descrição, imagem, preço, disponibilidade e ordem
- [ ] Grupos de opções com mínimo, máximo e obrigatoriedade
- [ ] Adicionais com alteração de preço
- [ ] Combos
- [ ] Upload de imagens
- [x] Lista de pedidos com atualização de status
- [x] Pedidos novos chegando em tempo real
- [ ] Lista de clientes e histórico de pedidos
- [ ] Registro de auditoria das ações administrativas

### Cardápio público

- [x] Acesso por `/{tenantSlug}`, sem login
- [x] Cabeçalho do estabelecimento com status aberto/fechado e horário
- [x] Taxa de entrega e pedido mínimo visíveis
- [x] Busca
- [x] Navegação por categorias
- [x] Cartões de produto com imagem, descrição, preço e disponibilidade
- [x] Seleção de opções e adicionais
- [x] Carrinho persistido no navegador, com indicador de quantidade
- [x] Checkout: telefone, nome, endereço, forma de pagamento, observações — _o envio é da Fase 11_
- [x] Identificação do cliente por telefone (ver a dívida registrada em SECURITY.md)
- [x] Pedido validado e **recalculado no servidor**
- [x] Abertura do WhatsApp do estabelecimento com a mensagem formatada

### Fundações não negociáveis

- [ ] Isolamento entre tenants com RLS e testes que o comprovam
- [x] Preço, taxa, total e disponibilidade calculados sempre no backend
- [x] Snapshot dos dados do produto dentro do pedido
- [ ] Validação com Zod em toda fronteira
- [ ] Mobile-first e acessível

---

## Explicitamente fora do MVP

Cada item aqui foi considerado e adiado de propósito. Estão detalhados em
[ROADMAP.md](ROADMAP.md).

### Pagamento

- Pagamento online pelo cliente final — no MVP ele apenas **escolhe** como vai pagar ao receber
- Pix integrado, cartão integrado, gateway de qualquer espécie
- "Troco para R$ X" — no MVP existe apenas "Dinheiro"
- Cobrança da assinatura do tenant

### Contas e identidade

- OTP, login por WhatsApp, Google, Apple
- Recuperação avançada de conta
- Autenticação reforçada antes de revelar endereço _(dívida de privacidade assumida)_

### Endereço

- Mapa, geocoding, latitude/longitude, pin de localização
- Cálculo de taxa por distância — no MVP é fixa ou por região cadastrada

### Operação

- Estoque e baixa automática
- Impressão térmica ou automática na cozinha
- Acompanhamento de status pelo cliente
- Avaliações de estabelecimento ou de produto

### Crescimento

- Cupons, promoções, fidelidade, pontos, cashback
- Relatórios avançados e analytics
- Cadastro autosserviço de estabelecimento — no MVP quem cria tenant é o Super Admin

### Plataforma

- Subdomínio por tenant e domínio próprio
- SSR, SEO, sitemap, Open Graph, structured data
- PWA e notificações push
- Storage externo (S3) — no MVP o armazenamento é local
- Multi-unidade e franquias
- WhatsApp Business API — no MVP é um link `wa.me`
- Editor de temas — a arquitetura existe, a interface não

---

## Como saber que acabou

Uma pessoa que nunca viu o sistema consegue, do zero:

1. Receber um tenant criado pelo Super Admin
2. Entrar, configurar o estabelecimento, horários, entrega e pagamentos
3. Cadastrar categorias, produtos, opções, adicionais e combos
4. Abrir `/{tenantSlug}` no celular
5. Montar um pedido, fazer checkout e cair no WhatsApp com a mensagem pronta
6. Ver o pedido aparecer no painel **sem recarregar a página**
7. Atualizar o status

E os testes provam que o Tenant A não enxerga nada do Tenant B.
