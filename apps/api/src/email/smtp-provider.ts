import { createTransport, type Transporter } from 'nodemailer'

import type { EmailService, MensagemDeEmail } from './email-service.js'

export interface OpcoesDoSmtp {
  host: string
  port: number
  secure: boolean
  usuario: string | undefined
  senha: string | undefined
  remetente: string
}

/**
 * Envio por SMTP — o Mailpit em desenvolvimento, o provedor escolhido no
 * deploy em produção (Fase 28). Qualquer provedor sério fala SMTP, então
 * trocá-lo é mudar variável de ambiente, não código.
 *
 * Os tempos-limite são curtos de propósito: o padrão do nodemailer espera até
 * dois minutos por um servidor calado, e quem espera é a pessoa que acabou de
 * se cadastrar.
 */
export class SmtpEmailProvider implements EmailService {
  private readonly transporte: Transporter
  private readonly remetente: string

  constructor(opcoes: OpcoesDoSmtp) {
    this.remetente = opcoes.remetente
    this.transporte = createTransport({
      host: opcoes.host,
      port: opcoes.port,
      secure: opcoes.secure,
      ...(opcoes.usuario ? { auth: { user: opcoes.usuario, pass: opcoes.senha ?? '' } } : {}),
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
    })
  }

  async enviar(mensagem: MensagemDeEmail): Promise<void> {
    await this.transporte.sendMail({
      from: this.remetente,
      to: mensagem.para,
      subject: mensagem.assunto,
      text: mensagem.texto,
    })
  }
}
