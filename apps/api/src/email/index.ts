import { env } from '../config/env.js'
import { infraLogger } from '../lib/logger.js'
import type { EmailService, MensagemDeEmail } from './email-service.js'
import { MemoryEmailProvider } from './memory-provider.js'
import { SmtpEmailProvider } from './smtp-provider.js'

export type { EmailService, MensagemDeEmail } from './email-service.js'
export { MemoryEmailProvider } from './memory-provider.js'

/**
 * A instância usada pela aplicação. Único lugar que sabe qual provider está
 * ativo — o resto do código recebe um `EmailService`.
 */
export const email: EmailService =
  env.EMAIL_DRIVER === 'memory'
    ? new MemoryEmailProvider()
    : new SmtpEmailProvider({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        usuario: env.SMTP_USER,
        senha: env.SMTP_PASSWORD,
        remetente: env.EMAIL_FROM,
      })

/**
 * Envia sem derrubar quem chamou. Devolve se o envio deu certo.
 *
 * É para envios que acontecem **depois** de a transação confirmar: o
 * estabelecimento já existe, e um servidor de e-mail fora do ar não pode
 * transformar o cadastro num erro. A falha fica no log, e o painel oferece o
 * reenvio. O destinatário não vai para o log — é dado pessoal —, só o motivo.
 */
export async function enviarSemDerrubar(
  mensagem: MensagemDeEmail,
  contexto: { motivo: string; tenantId: string },
): Promise<boolean> {
  try {
    await email.enviar(mensagem)
    return true
  } catch (err) {
    infraLogger.error({ err, ...contexto }, 'falha ao enviar e-mail')
    return false
  }
}
