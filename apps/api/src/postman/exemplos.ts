import { VERSAO_DOS_TERMOS } from '@repo/shared'

/**
 * O que a descrição da API (OpenAPI) não sabe e a coleção do Postman precisa:
 * corpos de exemplo com valores que fazem sentido, e os scripts que guardam o
 * token e os ids para as requisições seguintes.
 *
 * **Rota nova com corpo precisa de exemplo aqui** — o teste
 * `tests/postman.test.ts` recusa rota sem exemplo, exemplo de rota que não
 * existe mais e exemplo que a validação da própria rota recusaria. Depois de
 * mexer aqui ou numa rota, `pnpm postman` regenera a coleção.
 *
 * As chaves usam o caminho do Fastify: `PATCH /api/v1/admin/products/:id`.
 *
 * Nos corpos, `{{variavel}}` dentro de um texto vira variável do Postman. Para
 * número, `null` ou lista, use `'{{json:variavel}}'`: sai sem aspas no JSON.
 * Os exemplos que alteram configuração repetem os dados de demonstração da
 * Lanchonete do Zé, para que rodá-los no seed não bagunce nada.
 */

export interface ExemploDeRota {
  /** Corpo JSON da requisição. */
  corpo?: unknown
  /** Corpo multipart com um arquivo, neste campo. */
  arquivo?: string
  /** Valores de query. Os opcionais vão desligados, prontos para ligar. */
  query?: Record<string, string>
  /** Valor de um parâmetro do caminho, quando não é o id padrão do recurso. */
  caminho?: Record<string, string>
  /** Roda antes de enviar (aba "Pre-request" do Postman). */
  antes?: string[]
  /** Roda com a resposta (aba "Post-response"). */
  depois?: string[]
  /** Aviso acrescentado à descrição da requisição. */
  nota?: string
}

export interface VariavelDaColecao {
  chave: string
  valor: string
  descricao: string
}

/** Senha fixa do estabelecimento criado pelo Postman: o script do cadastro a guarda para o login. */
const SENHA_DO_CADASTRO = 'Senha-do-teste-123'

export const VARIAVEIS: VariavelDaColecao[] = [
  { chave: 'baseUrl', valor: 'http://localhost:3333', descricao: 'Endereço da API.' },
  {
    chave: 'mailpitUrl',
    valor: 'http://localhost:8025',
    descricao: 'Caixa de e-mail de desenvolvimento, lida pelo "Confirmar e-mail".',
  },
  {
    chave: 'tenantSlug',
    valor: 'lanchonete-do-ze',
    descricao: 'Estabelecimento das rotas públicas. O login e o cadastro trocam para o da sessão.',
  },
  { chave: 'email', valor: 'ze@exemplo.com', descricao: 'Login do painel (seed).' },
  { chave: 'password', valor: 'cardapio123', descricao: 'Senha do painel (seed).' },
  { chave: 'accessToken', valor: '', descricao: 'Preenchido pelo login, renovação e cadastro.' },
  {
    chave: 'confirmationToken',
    valor: '',
    descricao: 'Preenchido do Mailpit pelo "Confirmar e-mail".',
  },
  { chave: 'categoryId', valor: '', descricao: 'Primeira categoria listada, ou a criada.' },
  { chave: 'categoryIdsJson', valor: '[]', descricao: 'Todas as categorias, para reordenar.' },
  { chave: 'productId', valor: '', descricao: 'Primeiro produto listado, ou o criado.' },
  { chave: 'comboId', valor: '', descricao: 'Primeiro combo listado.' },
  { chave: 'comboComponentId', valor: '', descricao: 'Produto simples para compor o combo.' },
  { chave: 'optionGroupId', valor: '', descricao: 'Primeiro grupo de opção listado, ou o criado.' },
  { chave: 'paymentMethodId', valor: '', descricao: 'Forma de pagamento listada.' },
  { chave: 'orderId', valor: '', descricao: 'Pedido mais recente do painel.' },
  { chave: 'userId', valor: '', descricao: 'Primeiro usuário que não é o dono, ou o criado.' },
  {
    chave: 'menuProductId',
    valor: '',
    descricao: 'Produto escolhido pelo cardápio para o pedido.',
  },
  { chave: 'orderQuantity', valor: '1', descricao: 'Quantidade que atinge o pedido mínimo.' },
  { chave: 'orderTotalInCents', valor: '0', descricao: 'Total calculado pelo cardápio.' },
  { chave: 'fulfillment', valor: 'PICKUP', descricao: 'Retirada, se o estabelecimento aceita.' },
  { chave: 'orderAddressJson', valor: 'null', descricao: 'Endereço do pedido, em JSON.' },
  { chave: 'deliveryRegionIdJson', valor: 'null', descricao: 'Região de entrega, em JSON.' },
]

/**
 * Valores que substituem as variáveis na hora de validar os exemplos contra os
 * schemas das rotas (`tests/postman.test.ts`). Os de `{{json:…}}` são JSON.
 */
export const VALORES_PARA_VALIDAR: Record<string, string> = {
  $guid: '0f8fad5b-d9cb-469f-a165-70867728950e',
  $timestamp: '1790790592',
  tenantSlug: 'lanchonete-do-ze',
  email: 'ze@exemplo.com',
  password: 'cardapio123',
  confirmationToken: '01900000-0000-7000-8000-000000000001.segredo',
  categoryId: '01900000-0000-7000-8000-000000000002',
  categoryIdsJson: '["01900000-0000-7000-8000-000000000002"]',
  productId: '01900000-0000-7000-8000-000000000003',
  comboComponentId: '01900000-0000-7000-8000-000000000004',
  optionGroupId: '01900000-0000-7000-8000-000000000005',
  paymentMethodId: '01900000-0000-7000-8000-000000000006',
  menuProductId: '01900000-0000-7000-8000-000000000007',
  orderQuantity: '2',
  orderTotalInCents: '2580',
  fulfillment: 'PICKUP',
  orderAddressJson: 'null',
  deliveryRegionIdJson: 'null',
}

// --- Trechos de script ---------------------------------------------------------

/**
 * Guarda o token e o estabelecimento da sessão: o login não informa o
 * estabelecimento, então é da resposta que as rotas públicas ficam sabendo de
 * qual cardápio se trata.
 */
const guardarSessao = [
  'const sessao = pm.response.json();',
  'if (pm.response.code < 300 && sessao.accessToken) {',
  "  pm.collectionVariables.set('accessToken', sessao.accessToken);",
  "  pm.collectionVariables.set('tenantSlug', sessao.establishment.slug);",
  '}',
]

const guardarIdCriado = (variavel: string) => [
  `if (pm.response.code === 201) pm.collectionVariables.set('${variavel}', pm.response.json().id);`,
]

const guardarPrimeiroId = (variavel: string) => [
  'const lista = pm.response.json();',
  `if (Array.isArray(lista) && lista.length > 0) pm.collectionVariables.set('${variavel}', lista[0].id);`,
]

const ENDERECO_DE_ENTREGA = JSON.stringify({
  newAddress: {
    postalCode: '01452000',
    street: 'Rua dos Ipês',
    number: '450',
    complement: 'apto 12',
    neighborhood: 'Jardim Paulista',
    city: 'São Paulo',
    reference: null,
  },
})

// --- Exemplos por rota ---------------------------------------------------------

export const EXEMPLOS: Record<string, ExemploDeRota> = {
  // Autenticação
  'POST /api/v1/auth/login': {
    corpo: { email: '{{email}}', password: '{{password}}' },
    depois: guardarSessao,
    nota:
      'Só e-mail e senha: a resposta diz de qual estabelecimento a pessoa é. Guarda o token em ' +
      '`accessToken` e o endereço em `tenantSlug`; o refresh token fica no cookie, que o Postman ' +
      'guarda sozinho.',
  },
  'POST /api/v1/auth/refresh': {
    depois: guardarSessao,
    nota: 'Sem corpo: o refresh token vai no cookie guardado pelo login.',
  },
  'POST /api/v1/auth/logout': {
    depois: ["if (pm.response.code === 204) pm.collectionVariables.set('accessToken', '');"],
    nota: 'Sem corpo: revoga o refresh token do cookie.',
  },

  // Cadastro
  'POST /api/v1/public/signup': {
    corpo: {
      establishmentName: 'Minha Lanchonete de Teste',
      slug: 'teste-{{$timestamp}}',
      ownerName: 'Dono de Teste',
      email: 'dono-{{$timestamp}}@exemplo.com',
      password: SENHA_DO_CADASTRO,
      termsVersion: VERSAO_DOS_TERMOS,
      timezone: 'America/Sao_Paulo',
    },
    depois: [
      'const cadastro = pm.response.json();',
      'if (pm.response.code === 201) {',
      "  pm.collectionVariables.set('accessToken', cadastro.accessToken);",
      "  pm.collectionVariables.set('tenantSlug', cadastro.establishment.slug);",
      "  pm.collectionVariables.set('email', cadastro.user.email);",
      `  pm.collectionVariables.set('password', '${SENHA_DO_CADASTRO}');`,
      '}',
    ],
    nota:
      'Troca `tenantSlug`, `email`, `password` e `accessToken` para o estabelecimento criado — ' +
      'para voltar à Lanchonete do Zé, restaure os valores iniciais das variáveis da coleção. ' +
      'O e-mail de confirmação chega no Mailpit (http://localhost:8025).',
  },
  'GET /api/v1/public/signup/slug-availability': {
    query: { slug: 'minha-lanchonete' },
  },
  'POST /api/v1/public/signup/confirm-email': {
    corpo: { token: '{{confirmationToken}}' },
    antes: [
      "const mailpit = pm.collectionVariables.get('mailpitUrl');",
      "const para = pm.collectionVariables.get('email');",
      "pm.sendRequest(mailpit + '/api/v1/messages', (erro, resposta) => {",
      "  if (erro) return console.warn('Mailpit fora do ar: cole o token do link em confirmationToken.');",
      '  const mensagem = resposta.json().messages.find(',
      "    (m) => m.To.some((t) => t.Address === para) && m.Subject.startsWith('Confirme seu e-mail'),",
      '  );',
      "  if (!mensagem) return console.warn('Nenhum e-mail de confirmação para ' + para + ' no Mailpit.');",
      "  pm.sendRequest(mailpit + '/api/v1/message/' + mensagem.ID, (erro2, detalhe) => {",
      '    const achado = !erro2 && /#token=(\\S+)/.exec(detalhe.json().Text);',
      "    if (achado) pm.collectionVariables.set('confirmationToken', achado[1]);",
      '  });',
      '});',
    ],
    nota:
      'Busca sozinho, no Mailpit, o último link de confirmação enviado para `email`. Sem o ' +
      'Mailpit, cole em `confirmationToken` o que vem depois de `#token=` no link.',
  },

  // Configurações
  'PATCH /api/v1/admin/settings': {
    corpo: {
      description: 'Hambúrgueres artesanais e porções. Da terça ao domingo, até tarde.',
      whatsappPhone: '5511999990001',
      prepTimeMinMinutes: 20,
      prepTimeMaxMinutes: 40,
      minimumOrderInCents: 2000,
      isAcceptingOrders: true,
    },
  },
  'PUT /api/v1/admin/business-hours': {
    corpo: {
      intervalos: [2, 3, 4, 5, 6, 0].map((dayOfWeek) => ({
        dayOfWeek,
        opensAt: '18:00',
        closesAt: '02:00',
      })),
    },
    nota:
      'Substitui a semana inteira. O exemplo é o horário da Lanchonete do Zé: 18:00 às 02:00, ' +
      'terça a domingo. Num estabelecimento de teste, para pedir a qualquer hora, use ' +
      '`"opensAt": "00:00", "closesAt": "23:59"` nos sete dias (0 a 6).',
  },
  'PUT /api/v1/admin/delivery': {
    corpo: {
      configuracao: {
        deliveryEnabled: true,
        pickupEnabled: true,
        feeMode: 'FIXED',
        fixedFeeInCents: 500,
        estimatedMinMinutes: 30,
        estimatedMaxMinutes: 60,
      },
      regioes: [],
    },
    nota:
      'Substitui a configuração e as regiões. Para taxa por região: `feeMode: "BY_REGION"` e ' +
      '`regioes: [{ "name": "Centro", "feeInCents": 500 }]`.',
  },
  'GET /api/v1/admin/payment-methods': {
    depois: guardarPrimeiroId('paymentMethodId'),
  },
  'PUT /api/v1/admin/payment-methods': {
    corpo: { formas: [{ paymentMethodId: '{{paymentMethodId}}', isEnabled: true, sortOrder: 0 }] },
    nota: 'Rode antes "Formas de pagamento disponíveis e quais estão habilitadas", que guarda `paymentMethodId`.',
  },
  'PUT /api/v1/admin/settings/logo': { arquivo: 'file' },
  'PUT /api/v1/admin/settings/cover': { arquivo: 'file' },

  // Catálogo
  'GET /api/v1/admin/categories': {
    depois: [
      'const categorias = pm.response.json();',
      'if (Array.isArray(categorias) && categorias.length > 0) {',
      "  pm.collectionVariables.set('categoryId', categorias[0].id);",
      "  pm.collectionVariables.set('categoryIdsJson', JSON.stringify(categorias.map((c) => c.id)));",
      '}',
    ],
  },
  'POST /api/v1/admin/categories': {
    corpo: { name: 'Sobremesas {{$timestamp}}', description: 'Doces da casa', isActive: true },
    depois: guardarIdCriado('categoryId'),
    nota: 'O nome é único no estabelecimento; o `{{$timestamp}}` evita repetir ao rodar de novo.',
  },
  'PUT /api/v1/admin/categories/order': {
    corpo: { ids: '{{json:categoryIdsJson}}' },
    nota: 'Precisa de todas as categorias: rode antes "Categorias, na ordem de exibição". Reordene a lista à vontade.',
  },
  'PATCH /api/v1/admin/categories/:id': {
    corpo: { description: 'Doces da casa, feitos no dia', isActive: true },
  },
  'PUT /api/v1/admin/categories/:id/image': { arquivo: 'file' },
  'GET /api/v1/admin/products': {
    query: { categoryId: '{{categoryId}}' },
    depois: [
      'const produtos = pm.response.json();',
      'if (Array.isArray(produtos) && produtos.length > 0) {',
      "  pm.collectionVariables.set('productId', produtos[0].id);",
      "  const combo = produtos.find((p) => p.type === 'COMBO');",
      "  const simples = produtos.find((p) => p.type === 'SIMPLE');",
      "  if (combo) pm.collectionVariables.set('comboId', combo.id);",
      "  if (simples) pm.collectionVariables.set('comboComponentId', simples.id);",
      '}',
    ],
  },
  'POST /api/v1/admin/products': {
    corpo: {
      categoryId: '{{categoryId}}',
      name: 'Pudim de leite',
      description: 'Fatia generosa, com calda de caramelo.',
      priceInCents: 1290,
      isAvailable: true,
    },
    depois: guardarIdCriado('productId'),
  },
  'PATCH /api/v1/admin/products/:id': {
    corpo: { priceInCents: 1390, isAvailable: true },
  },
  'PUT /api/v1/admin/products/:id/image': { arquivo: 'file' },

  // Personalização
  'GET /api/v1/admin/option-groups': {
    depois: guardarPrimeiroId('optionGroupId'),
  },
  'POST /api/v1/admin/option-groups': {
    corpo: {
      name: 'Calda extra',
      description: 'Escolha até 2',
      minSelections: 0,
      maxSelections: 2,
      options: [
        { name: 'Chocolate', priceDeltaInCents: 300 },
        { name: 'Doce de leite', priceDeltaInCents: 300 },
      ],
    },
    depois: guardarIdCriado('optionGroupId'),
  },
  'PUT /api/v1/admin/option-groups/:id': {
    corpo: {
      name: 'Calda extra',
      description: 'Escolha até 2',
      minSelections: 0,
      maxSelections: 2,
      options: [
        { name: 'Chocolate', priceDeltaInCents: 300 },
        { name: 'Doce de leite', priceDeltaInCents: 350 },
        { name: 'Morango', priceDeltaInCents: 350 },
      ],
    },
    nota: 'Opção sem `id` é criada; para manter uma opção existente, mande o `id` dela.',
  },
  'PUT /api/v1/admin/products/:id/option-groups': {
    corpo: { groupIds: ['{{optionGroupId}}'] },
    nota: 'Substitui os grupos do produto, na ordem da lista.',
  },
  'GET /api/v1/admin/products/:id/combo-items': {
    caminho: { id: '{{comboId}}' },
  },
  'PUT /api/v1/admin/products/:id/combo-items': {
    caminho: { id: '{{comboId}}' },
    corpo: { items: [{ productId: '{{comboComponentId}}', quantity: 1 }] },
    nota: 'O produto do caminho precisa ser um combo. "Produtos, opcionalmente de uma categoria" guarda `comboId` e `comboComponentId`.',
  },

  // Pedidos
  'GET /api/v1/admin/orders': {
    query: { status: 'RECEIVED', before: '10', limit: '20' },
    depois: guardarPrimeiroId('orderId'),
  },
  'PATCH /api/v1/admin/orders/:id/status': {
    corpo: { status: 'ACCEPTED' },
    nota: 'O status só avança. Para cancelar: `{ "status": "CANCELLED", "reason": "Cliente desistiu" }`.',
  },

  // Usuários
  'GET /api/v1/admin/users': {
    depois: [
      'const usuarios = pm.response.json();',
      "const outro = Array.isArray(usuarios) && usuarios.find((u) => u.role?.code !== 'OWNER');",
      "if (outro) pm.collectionVariables.set('userId', outro.id);",
    ],
  },
  'POST /api/v1/admin/users': {
    corpo: {
      name: 'Atendente de Teste',
      email: 'atendente-{{$timestamp}}@exemplo.com',
      password: 'Senha-do-atendente',
      role: 'STAFF',
    },
    depois: guardarIdCriado('userId'),
    nota: 'O plano gratuito permite 2 usuários ativos.',
  },
  'PATCH /api/v1/admin/users/:id': {
    corpo: { role: 'ADMIN' },
  },

  // Cardápio público
  'GET /api/v1/public/:tenantSlug/menu': {
    depois: [
      'const menu = pm.response.json();',
      'if (pm.response.code === 200) {',
      '  const produto = menu.categories',
      '    .flatMap((c) => c.products)',
      '    .find(',
      '      (p) =>',
      "        p.isAvailable && p.type === 'SIMPLE' && p.priceInCents > 0 &&",
      '        p.optionGroups.every((g) => !g.isRequired),',
      '    );',
      '  const entrega = menu.delivery;',
      '  const retirada = entrega.pickupEnabled || !entrega.deliveryEnabled;',
      "  const regiao = !retirada && entrega.feeMode === 'BY_REGION' ? entrega.regions[0] : null;",
      '  const taxa = retirada ? 0 : regiao ? regiao.feeInCents : entrega.fixedFeeInCents;',
      '  if (produto) {',
      '    const quantidade = Math.max(1, Math.ceil(menu.establishment.minimumOrderInCents / produto.priceInCents));',
      "    pm.collectionVariables.set('menuProductId', produto.id);",
      "    pm.collectionVariables.set('orderQuantity', String(quantidade));",
      "    pm.collectionVariables.set('orderTotalInCents', String(produto.priceInCents * quantidade + taxa));",
      '  }',
      "  pm.collectionVariables.set('fulfillment', retirada ? 'PICKUP' : 'DELIVERY');",
      `  pm.collectionVariables.set('orderAddressJson', retirada ? 'null' : '${ENDERECO_DE_ENTREGA}');`,
      "  pm.collectionVariables.set('deliveryRegionIdJson', regiao ? JSON.stringify(regiao.id) : 'null');",
      "  if (menu.paymentMethods[0]) pm.collectionVariables.set('paymentMethodId', menu.paymentMethods[0].id);",
      "  if (!menu.status.aberto) console.warn('Fechado agora: o pedido será recusado. A padaria-pao-quente abre das 08:00 às 18:00.');",
      '}',
    ],
    nota:
      'Prepara o pedido: escolhe um produto sem opção obrigatória, a quantidade que atinge o ' +
      'pedido mínimo, a retirada ou a entrega, a forma de pagamento e o total esperado.',
  },
  'POST /api/v1/public/:tenantSlug/customers/identify': {
    corpo: { phone: '(11) 98765-4321' },
    nota: 'O telefone é da cliente de demonstração do seed.',
  },
  'POST /api/v1/public/:tenantSlug/orders': {
    corpo: {
      idempotencyKey: '{{$guid}}',
      customer: { phone: '(11) 98765-4321', name: 'Maria' },
      fulfillment: '{{fulfillment}}',
      address: '{{json:orderAddressJson}}',
      deliveryRegionId: '{{json:deliveryRegionIdJson}}',
      paymentMethodId: '{{paymentMethodId}}',
      changeForInCents: null,
      notes: 'Pedido feito pelo Postman',
      items: [
        {
          productId: '{{menuProductId}}',
          quantity: '{{json:orderQuantity}}',
          notes: null,
          options: {},
        },
      ],
      expectedTotalInCents: '{{json:orderTotalInCents}}',
    },
    nota:
      'Rode antes "Cardápio, status e condições de entrega de um estabelecimento", que prepara ' +
      'produto, quantidade e total. O estabelecimento precisa estar aberto.',
  },
}
