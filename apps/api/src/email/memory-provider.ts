import type { EmailService, MensagemDeEmail } from './email-service.js'

/**
 * Guarda os e-mails na memória, em vez de enviá-los. É o provider dos testes:
 * eles leem a caixa de saída para conferir destinatário, assunto e o link de
 * confirmação. A configuração de ambiente o recusa em produção.
 */
export class MemoryEmailProvider implements EmailService {
  readonly enviados: MensagemDeEmail[] = []
  private falhasPendentes = 0

  enviar(mensagem: MensagemDeEmail): Promise<void> {
    if (this.falhasPendentes > 0) {
      this.falhasPendentes -= 1
      return Promise.reject(new Error('falha simulada no envio de e-mail'))
    }
    this.enviados.push(mensagem)
    return Promise.resolve()
  }

  /** Os próximos `quantidade` envios falham — para testar o servidor de e-mail fora do ar. */
  falharOsProximos(quantidade: number): void {
    this.falhasPendentes = quantidade
  }

  limpar(): void {
    this.enviados.length = 0
    this.falhasPendentes = 0
  }
}
