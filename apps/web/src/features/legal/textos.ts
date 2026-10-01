import { app as product } from '@repo/config'

/**
 * Os termos de uso e a política de privacidade.
 *
 * **Texto provisório**, escrito para o cadastro ter o que mostrar e aceitar.
 * O definitivo é do Junio (com orientação jurídica) e precisa estar aqui antes
 * do primeiro estabelecimento real (Fase 28). Ao trocar o texto, troque também
 * `VERSAO_DOS_TERMOS` em `packages/shared` — é a versão que cada cadastro
 * registra como aceita.
 */

export interface SecaoLegal {
  titulo: string
  paragrafos: string[]
}

export interface DocumentoLegal {
  titulo: string
  secoes: SecaoLegal[]
}

const nome = product.name

export const TERMOS_DE_USO: DocumentoLegal = {
  titulo: 'Termos de uso',
  secoes: [
    {
      titulo: 'O serviço',
      paragrafos: [
        `O ${nome} é uma plataforma para estabelecimentos de alimentação publicarem o cardápio na internet e receberem pedidos. O pedido vai para o estabelecimento; o pagamento é combinado entre o cliente e o estabelecimento, na entrega ou na retirada.`,
      ],
    },
    {
      titulo: 'Cadastro e conta',
      paragrafos: [
        'Quem cadastra o estabelecimento declara ter autorização para representá-lo e responde pela conta. O cardápio só é publicado depois da confirmação do e-mail informado no cadastro.',
        'A senha é pessoal. Cada pessoa da equipe deve ter o próprio usuário, criado pelo dono ou por um administrador no painel.',
      ],
    },
    {
      titulo: 'Responsabilidades do estabelecimento',
      paragrafos: [
        'O estabelecimento responde pelo que publica — produtos, preços, fotos, horários e taxas — e pelo atendimento de cada pedido: preparo, entrega e cobrança.',
        'É proibido usar a plataforma para enganar clientes, como publicar um estabelecimento que não existe, se passar por outro ou cobrar antecipadamente em nome de quem não vai entregar.',
      ],
    },
    {
      titulo: 'Plano gratuito',
      paragrafos: [
        'O plano gratuito tem limites de uso, que o painel mostra. Atingido o limite de pedidos do mês, o cardápio deixa de receber pedidos até o mês seguinte.',
      ],
    },
    {
      titulo: 'Dados pessoais',
      paragrafos: [
        'Nos pedidos, o estabelecimento é o controlador dos dados dos seus clientes, e a plataforma atua como operadora: trata esses dados para que o pedido chegue ao estabelecimento. Os detalhes estão na política de privacidade.',
      ],
    },
    {
      titulo: 'Suspensão',
      paragrafos: [
        'A plataforma pode suspender um estabelecimento que descumpra estes termos. Enquanto suspenso, o cardápio sai do ar.',
      ],
    },
    {
      titulo: 'Mudanças nestes termos',
      paragrafos: [
        'Estes termos podem mudar. A versão aceita em cada cadastro fica registrada, e mudanças relevantes são avisadas por e-mail.',
      ],
    },
    {
      titulo: 'Contato',
      paragrafos: ['[Canal de contato a definir antes do lançamento.]'],
    },
  ],
}

export const POLITICA_DE_PRIVACIDADE: DocumentoLegal = {
  titulo: 'Política de privacidade',
  secoes: [
    {
      titulo: 'A quem esta política se aplica',
      paragrafos: [
        `A quem cadastra e administra um estabelecimento no ${nome}, e a quem faz pedidos pelo cardápio de um estabelecimento.`,
      ],
    },
    {
      titulo: 'Dados que tratamos',
      paragrafos: [
        'De quem administra um estabelecimento: nome, e-mail e senha — a senha é guardada de forma que ninguém consegue lê-la, nem a plataforma.',
        'De quem faz um pedido: nome, telefone, endereço de entrega, os itens e as observações do pedido.',
        'De todos: o endereço IP e registros de acesso, para segurança e prevenção de abuso.',
      ],
    },
    {
      titulo: 'Para que usamos',
      paragrafos: [
        'Para entregar o pedido ao estabelecimento e permitir que ele o prepare e entregue.',
        'Para reconhecer o cliente pelo telefone nos pedidos seguintes ao mesmo estabelecimento: ao informar o telefone no checkout, o cardápio mostra o primeiro nome e os endereços salvos, com o número do endereço escondido, para a pessoa confirmar.',
        'Para enviar os e-mails da conta do estabelecimento, como a confirmação do cadastro.',
      ],
    },
    {
      titulo: 'Com quem compartilhamos',
      paragrafos: [
        'Os dados de um pedido vão para o estabelecimento que o recebe, e só para ele: cada estabelecimento vê apenas os próprios clientes e pedidos.',
        'Não vendemos dados. Fornecedores de infraestrutura — hospedagem e envio de e-mail — tratam dados em nosso nome, só para prestar o serviço.',
      ],
    },
    {
      titulo: 'Papéis na LGPD',
      paragrafos: [
        'Nos pedidos, o estabelecimento é o controlador dos dados dos seus clientes, e a plataforma, operadora. Nos dados de quem administra um estabelecimento, a plataforma é a controladora.',
      ],
    },
    {
      titulo: 'Seus direitos',
      paragrafos: [
        'Pela LGPD, você pode pedir acesso, correção, anonimização ou eliminação dos seus dados, entre outros direitos. Pedidos sobre os dados de um pedido devem ser feitos ao estabelecimento; a plataforma ajuda no que couber.',
      ],
    },
    {
      titulo: 'Por quanto tempo guardamos',
      paragrafos: ['[Prazos de retenção a definir antes do lançamento.]'],
    },
    {
      titulo: 'Contato',
      paragrafos: ['[Contato do encarregado de dados a definir antes do lançamento.]'],
    },
  ],
}
