# Escopo do MVP

O MVP está pronto quando **um estabelecimento real consegue receber pedidos pela plataforma**.
Tudo que não serve a essa frase fica de fora — e a lista do que fica de fora é tão importante
quanto a do que fica dentro, porque é ela que impede o escopo de crescer sem decisão.

---

## Dentro do MVP

### Plataforma

- [x] Cadastro aberto do estabelecimento, no plano gratuito e sem pagamento, com confirmação de
      e-mail
- [x] Página inicial do produto, com "Começar grátis" e "Entrar"
- [x] Termos de uso e política de privacidade, aceitos no cadastro — _texto provisório; o
      definitivo entra antes do lançamento (Fase 28)_
- [x] Super Admin lista, suspende, reativa e troca o plano de um estabelecimento, por comando
- [x] Modelo de planos preparado — `plans`, `plan_features`, `subscriptions` — sem cobrança

### Administração do estabelecimento

- [x] Login de usuário administrativo, só com e-mail e senha — o sistema acha o estabelecimento
- [x] Múltiplos usuários por tenant, com papéis `OWNER`, `ADMIN`, `STAFF` — _pela API; a tela é
      da Fase 25_
- [ ] Troca da própria senha, redefinição pelo dono e "Esqueci minha senha" por e-mail —
      _Fase 25_
- [x] Painel com menu lateral e tela Início, com o resumo dos pedidos de hoje
- [ ] Lista do que falta para receber pedidos, no Início — _Fase 21_
- [ ] Configuração do estabelecimento: nome, logo, descrição, contato, WhatsApp — _Fase 21_
- [ ] Horário de funcionamento, com múltiplos intervalos no mesmo dia — _Fase 22_
- [ ] Taxa de entrega: valor fixo ou por região — _Fase 22_
- [ ] Retirada no estabelecimento, quando habilitada — _Fase 22_
- [ ] Pedido mínimo — _Fase 21_
- [ ] Formas de pagamento habilitáveis por tenant — _Fase 22_
- [ ] Categorias com ordenação — _Fase 23_
- [ ] Produtos com nome, descrição, imagem, preço, disponibilidade e ordem — _Fase 23_
- [ ] Grupos de opções com mínimo, máximo e obrigatoriedade — _Fase 24_
- [ ] Adicionais com alteração de preço — _Fase 24_
- [ ] Combos — _Fase 24_
- [x] Upload de imagens, sem metadados (como a localização GPS) e em tamanho leve — _pela API; as
      telas são das Fases 21 e 23_
- [x] Lista de pedidos com atualização de status
- [x] Pedidos novos chegando em tempo real
- [ ] Lista de clientes e histórico de pedidos — _Fase 26_
- [x] Registro de auditoria das ações administrativas — _a consulta no painel está no ROADMAP_

### Cardápio público

- [x] Acesso por `/{tenantSlug}`, sem login
- [x] Cabeçalho do estabelecimento com status aberto/fechado e horário
- [x] Taxa de entrega e pedido mínimo visíveis
- [x] Busca
- [x] Navegação por categorias
- [x] Cartões de produto com imagem, descrição, preço e disponibilidade
- [x] Seleção de opções e adicionais
- [x] Carrinho persistido no navegador, com indicador de quantidade
- [x] Checkout: telefone, nome, endereço, forma de pagamento, observações
- [x] Identificação do cliente por telefone (ver a dívida registrada em SECURITY.md)
- [x] Pedido validado e **recalculado no servidor**
- [x] Abertura do WhatsApp do estabelecimento com a mensagem formatada

### Fundações não negociáveis

- [x] Isolamento entre tenants com RLS e testes que o comprovam
- [x] Preço, taxa, total e disponibilidade calculados sempre no backend
- [x] Snapshot dos dados do produto dentro do pedido
- [x] Validação com Zod em toda fronteira
- [ ] Mobile-first e acessível — _Fase 27_

### No ar

- [ ] CI: formatação, typecheck, lint, testes e build a cada PR e na `main` — _pronto na Fase
      16 e guardado; volta na Fase 28_
- [ ] Hospedagem, HTTPS, backup e seed essencial de produção — _Fase 28_

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
- Acompanhamento de status pelo cliente — o Junio vai pensar em como fazer
- Consulta do registro de auditoria no painel — o registro existe
- Avaliações de estabelecimento ou de produto

### Crescimento

- Cupons, promoções, fidelidade, pontos, cashback
- Relatórios avançados e analytics
- Assinar um plano pago no cadastro — no MVP o cadastro é só no plano gratuito

### Plataforma

- Subdomínio por tenant e domínio próprio
- SSR, SEO, sitemap, Open Graph, structured data
- PWA e notificações push
- Storage externo (S3) — no MVP o armazenamento é local
- Multi-unidade e franquias
- WhatsApp Business API — no MVP é um link `wa.me`
- Robô no WhatsApp para responder os clientes
- Painel da plataforma para o Super Admin — no MVP, comandos
- Editor de temas — a arquitetura existe, a interface não

---

## Como saber que acabou

Uma pessoa que nunca viu o sistema consegue, do zero:

1. Cadastrar o estabelecimento pela página inicial, no plano gratuito, e confirmar o e-mail
2. Entrar, configurar o estabelecimento, horários, entrega e pagamentos
3. Cadastrar categorias, produtos, opções, adicionais e combos
4. Abrir `/{tenantSlug}` no celular
5. Montar um pedido, fazer checkout e cair no WhatsApp com a mensagem pronta
6. Ver o pedido aparecer no painel **sem recarregar a página**
7. Atualizar o status

E os testes provam que o Tenant A não enxerga nada do Tenant B. Tudo isso no ar, com HTTPS, e
não só na máquina de desenvolvimento.

> **Situação ao fim da Fase 20:** o passo 1 — cadastrar pela página inicial e confirmar o e-mail
> — e os passos 4 a 7 funcionam de ponta a ponta, e os testes provam o isolamento. Os passos 2 e 3
> ainda só funcionam pela API, e o sistema ainda não está no ar. As fases 21 a 28 fecham o MVP —
> ver PROJECT_PLAN.md, "O que falta para o MVP".
