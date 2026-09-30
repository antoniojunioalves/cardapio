/**
 * Contrato de envio de e-mail.
 *
 * O domínio monta a mensagem e entrega aqui; quem envia de verdade — SMTP em
 * desenvolvimento e produção, a memória nos testes — é escolhido num lugar só
 * (`email/index.ts`), como o provider de imagens em `storage/`.
 *
 * Só texto, sem HTML, de propósito: o e-mail leva texto que chegou de fora (o
 * nome de um estabelecimento, por exemplo), e em texto puro não há marcação a
 * escapar nem link disfarçado para montar.
 */
export interface MensagemDeEmail {
  para: string
  assunto: string
  texto: string
}

export interface EmailService {
  enviar(mensagem: MensagemDeEmail): Promise<void>
}
