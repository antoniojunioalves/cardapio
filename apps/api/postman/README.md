# Coleção do Postman

`api.postman_collection.json` tem **todas as rotas da API**, com corpo de exemplo, token e ids
preenchidos sozinhos. Ela é **gerada**: não edite o arquivo à mão, porque a próxima geração
desfaz.

## Importar

No Postman: **Import** → escolha `api.postman_collection.json`. Pronto — não há ambiente a
importar; os valores ficam nas variáveis da própria coleção (aba **Variables**).

**Importar de novo** (depois que rotas mudarem): o mesmo **Import**. O Postman reconhece a
coleção e pergunta se substitui — escolha **Replace**. As variáveis voltam aos valores iniciais:
é só rodar o login de novo.

## Usar

1. Suba o ambiente: `pnpm db:up` e `pnpm dev`.
2. Rode **Autenticação → Autentica um usuário administrativo**. Ele usa `tenantSlug`, `email` e
   `password` das variáveis — por padrão, a Lanchonete do Zé do seed — e guarda o token em
   `accessToken`. Todas as rotas do painel já o usam.
3. As listagens guardam o primeiro id (`categoryId`, `productId`, `orderId`…) e as criações guardam
   o id criado. As rotas seguintes já apontam para ele.

Fluxos que precisam de uma rota antes da outra:

| Para…                    | Rode antes                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------ |
| Enviar um pedido público | **Cardápio, status e condições de entrega** — escolhe o produto e calcula o total    |
| Reordenar categorias     | **Categorias, na ordem de exibição** — guarda todos os ids                           |
| Habilitar pagamentos     | **Formas de pagamento disponíveis** — guarda `paymentMethodId`                       |
| Componentes de um combo  | **Produtos, opcionalmente de uma categoria** — guarda `comboId` e `comboComponentId` |
| Confirmar o e-mail       | **Cadastra um estabelecimento** — a confirmação busca o link no Mailpit sozinha      |

**Cadastro:** cadastrar troca `tenantSlug`, `email`, `password` e `accessToken` para o
estabelecimento criado. Para voltar à Lanchonete do Zé, restaure os valores iniciais das
variáveis (ou importe de novo).

**Pedido público** só entra com o estabelecimento aberto. A Lanchonete do Zé abre das 18:00 às
02:00; a `padaria-pao-quente`, das 08:00 às 18:00 — troque `tenantSlug` para ela durante o dia.

**Imagens:** nas rotas de upload, escolha o arquivo no campo `file` da aba **Body**.

**Tempo real** não cabe numa coleção: no Postman, **New → WebSocket**, conecte em
`ws://localhost:3333/api/v1/admin/orders/stream` e envie
`{"type": "auth", "token": "<accessToken>"}`.

## Quando uma rota muda

```bash
pnpm postman
```

Regenera o arquivo a partir das rotas registradas — rota nova entra sozinha. Não precisa do
banco de pé. Depois, importe de novo no Postman.

Rota nova **com corpo** precisa de exemplo em `apps/api/src/postman/exemplos.ts`. O teste
`tests/postman.test.ts` (roda no `pnpm verify`) falha se:

- este arquivo não for o que `pnpm postman` gera hoje;
- uma rota com corpo obrigatório não tiver exemplo;
- um exemplo não passar na validação da própria rota;
- a coleção usar uma variável que não declarou.
