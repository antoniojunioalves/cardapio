import { app as product } from '@repo/config'

import type { MensagemDeEmail } from '../email/index.js'

/**
 * O e-mail do convite para a equipe — regra pura, sem banco nem envio.
 */

export const VALIDADE_DO_CONVITE_EM_DIAS = 7

/** O token vai no fragmento, como no link de confirmação (`signup/messages.ts`). */
export function linkDoConvite(webOrigin: string, token: string): string {
  const url = new URL('/convite', webOrigin)
  url.hash = `token=${token}`
  return url.toString()
}

/**
 * O convite vai para um endereço **digitado por alguém do estabelecimento**,
 * que pode ser de qualquer pessoa. Por isso ele não repete texto livre — nem o
 * nome do estabelecimento, nem o de quem convidou, nem o do perfil —, pela
 * mesma regra do e-mail de confirmação: sem ela, convidar viraria um jeito de
 * mandar, pelo nosso remetente, um texto qualquer para qualquer endereço. O
 * endereço do cardápio pode ir: só tem letras minúsculas, números e hífen. Os
 * nomes aparecem na página do convite, para quem abriu o link.
 */
export function mensagemDeConvite(dados: {
  para: string
  slug: string
  token: string
  webOrigin: string
}): MensagemDeEmail {
  const cardapio = new URL(`/${dados.slug}`, dados.webOrigin).toString()

  return {
    para: dados.para,
    assunto: `Convite para a equipe de um estabelecimento — ${product.name}`,
    texto: [
      'Olá!',
      '',
      `Você recebeu um convite para a equipe do estabelecimento de ${cardapio}, no ${product.name}.`,
      'Para aceitar e entrar no painel dele, abra o link:',
      '',
      linkDoConvite(dados.webOrigin, dados.token),
      '',
      `O convite vale por ${String(VALIDADE_DO_CONVITE_EM_DIAS)} dias. Se você já tem conta no ` +
        `${product.name}, entre com a mesma senha de sempre; se não tem, você a cria ao aceitar.`,
      '',
      'Não esperava este convite? Ignore esta mensagem: sem o aceite, nada acontece.',
    ].join('\n'),
  }
}
