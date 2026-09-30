import { app as product } from '@repo/config'

import type { MensagemDeEmail } from '../email/index.js'

/**
 * Os e-mails do cadastro — regra pura, sem banco nem envio.
 */

export const VALIDADE_DO_LINK_EM_HORAS = 48

/**
 * O token vai no fragmento (`#`), e não na query: o navegador não envia o
 * fragmento ao servidor nem o repassa como `Referer`, então o token não
 * aparece em log de servidor nenhum. A página de confirmação o lê e o manda à
 * API no corpo de um POST.
 */
export function linkDeConfirmacao(webOrigin: string, token: string): string {
  const url = new URL('/confirmar-email', webOrigin)
  url.hash = `token=${token}`
  return url.toString()
}

/**
 * O e-mail de confirmação vai para um endereço **digitado por quem se
 * cadastrou**, que pode ser de outra pessoa. Por isso ele não repete nenhum
 * texto livre do cadastro — nem o nome do estabelecimento, nem o da pessoa. Sem
 * essa regra, o cadastro viraria um jeito de mandar, pelo nosso remetente, um
 * texto qualquer para qualquer endereço. O endereço do cardápio pode ir: só tem
 * letras minúsculas, números e hífen.
 */
export function mensagemDeConfirmacao(dados: {
  para: string
  slug: string
  token: string
  webOrigin: string
}): MensagemDeEmail {
  const cardapio = new URL(`/${dados.slug}`, dados.webOrigin).toString()

  return {
    para: dados.para,
    assunto: `Confirme seu e-mail para publicar o cardápio — ${product.name}`,
    texto: [
      'Olá!',
      '',
      `Recebemos o cadastro de um estabelecimento no ${product.name} com este e-mail.`,
      `Para publicar o cardápio em ${cardapio}, confirme o e-mail pelo link:`,
      '',
      linkDeConfirmacao(dados.webOrigin, dados.token),
      '',
      `O link vale por ${String(VALIDADE_DO_LINK_EM_HORAS)} horas. Se expirar, peça outro no painel.`,
      '',
      'Não foi você? Ignore esta mensagem: sem a confirmação, o cardápio não é publicado.',
    ].join('\n'),
  }
}

const dataEHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

/** Aviso de estabelecimento novo para a plataforma. Vai para nós, então leva o que foi digitado. */
export function avisoDeNovoCadastro(dados: {
  para: string
  nome: string
  slug: string
  donoNome: string
  donoEmail: string
  plano: string
  quando: Date
}): MensagemDeEmail {
  return {
    para: dados.para,
    assunto: `Novo cadastro: ${dados.slug}`,
    texto: [
      'Um estabelecimento se cadastrou pela página inicial.',
      '',
      `Estabelecimento: ${dados.nome}`,
      `Endereço: /${dados.slug}`,
      `Plano: ${dados.plano}`,
      `Responsável: ${dados.donoNome} <${dados.donoEmail}>`,
      `Quando: ${dataEHora.format(dados.quando)} (Brasília)`,
      '',
      'O cardápio só fica público depois que o responsável confirmar o e-mail.',
    ].join('\n'),
  }
}
