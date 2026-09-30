import { app as product } from '@repo/config'
import { describe, expect, it } from 'vitest'

import { envSchema } from '../src/config/env.js'
import { email, enviarSemDerrubar, MemoryEmailProvider } from '../src/email/index.js'
import {
  avisoDeNovoCadastro,
  linkDeConfirmacao,
  mensagemDeConfirmacao,
} from '../src/signup/messages.js'

const BASE = {
  DATABASE_URL: 'postgresql://x:y@localhost:5432/z',
  JWT_SECRET: 'a'.repeat(32),
}

describe('configuração de e-mail', () => {
  it('o driver em memória, que descarta os e-mails, é recusado em produção', () => {
    const producao = { ...BASE, NODE_ENV: 'production' }
    expect(envSchema.safeParse({ ...producao, EMAIL_DRIVER: 'memory' }).success).toBe(false)
    expect(envSchema.safeParse({ ...producao, EMAIL_DRIVER: 'smtp' }).success).toBe(true)
    expect(envSchema.safeParse({ ...BASE, EMAIL_DRIVER: 'memory' }).success).toBe(true)
  })

  it('variável vazia no .env vale como ausente, e o remetente padrão leva o nome do produto', () => {
    const lido = envSchema.parse({
      ...BASE,
      SMTP_USER: '',
      SMTP_PASSWORD: '',
      EMAIL_FROM: '',
      PLATFORM_NOTIFY_EMAIL: '',
    })
    expect(lido.SMTP_USER).toBeUndefined()
    expect(lido.SMTP_PASSWORD).toBeUndefined()
    expect(lido.PLATFORM_NOTIFY_EMAIL).toBeUndefined()
    expect(lido.EMAIL_FROM).toBe(`${product.name} <nao-responda@localhost>`)
  })

  it('aviso para um endereço que não é e-mail é erro de configuração, não silêncio', () => {
    expect(envSchema.safeParse({ ...BASE, PLATFORM_NOTIFY_EMAIL: 'junio' }).success).toBe(false)
  })
})

describe('envio que não derruba quem chamou', () => {
  it('uma falha do servidor de e-mail vira `false`, e não exceção', async () => {
    if (!(email instanceof MemoryEmailProvider))
      throw new Error('os testes usam EMAIL_DRIVER=memory')
    email.limpar()
    email.falharOsProximos(1)

    const mensagem = { para: 'a@exemplo.com', assunto: 'x', texto: 'y' }
    expect(await enviarSemDerrubar(mensagem, { motivo: 'teste', tenantId: 't' })).toBe(false)
    expect(await enviarSemDerrubar(mensagem, { motivo: 'teste', tenantId: 't' })).toBe(true)
    expect(email.enviados).toEqual([mensagem])
  })
})

describe('mensagens do cadastro', () => {
  it('o token vai no fragmento do link, que não chega a log de servidor nenhum', () => {
    const link = new URL(linkDeConfirmacao('https://cardapio.exemplo', 'tenant.segredo'))
    expect(link.pathname).toBe('/confirmar-email')
    expect(link.search).toBe('')
    expect(link.hash).toBe('#token=tenant.segredo')
  })

  it('a confirmação leva o endereço do cardápio, o link e a validade', () => {
    const mensagem = mensagemDeConfirmacao({
      para: 'dono@exemplo.com',
      slug: 'lanchonete-do-ze',
      token: 'tenant.segredo',
      webOrigin: 'https://cardapio.exemplo',
    })
    expect(mensagem.para).toBe('dono@exemplo.com')
    expect(mensagem.texto).toContain('https://cardapio.exemplo/lanchonete-do-ze')
    expect(mensagem.texto).toContain(
      'https://cardapio.exemplo/confirmar-email#token=tenant.segredo',
    )
    expect(mensagem.texto).toContain('48 horas')
  })

  it('o aviso para a plataforma leva tudo o que foi digitado', () => {
    const aviso = avisoDeNovoCadastro({
      para: 'plataforma@exemplo.com',
      nome: 'Lanchonete do Zé',
      slug: 'lanchonete-do-ze',
      donoNome: 'Zé',
      donoEmail: 'ze@exemplo.com',
      plano: 'FREE',
      quando: new Date('2026-09-30T15:00:00Z'),
    })
    expect(aviso.texto).toContain('Lanchonete do Zé')
    expect(aviso.texto).toContain('Zé <ze@exemplo.com>')
    expect(aviso.texto).toContain('30/09/2026, 12:00')
  })
})
