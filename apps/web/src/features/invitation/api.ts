import { useSessaoStore, type RespostaDeSessao } from '@/features/admin/session'
import { requisitar } from '@/services/api'

/** O convite do link, como `POST /api/v1/auth/invitation` devolve. */
export interface ConviteParaAceitar {
  email: string
  establishment: { name: string; slug: string }
  /** O nome do perfil que a pessoa terá. */
  profile: string
  /** O nome de quem convidou. */
  invitedBy: string | null
  /** O e-mail já tem conta: o aceite pede a senha dela, em vez de criar uma. */
  accountExists: boolean
}

/** O token vai no corpo, nunca na URL: ele veio do fragmento do link. */
export function consultarConvite(token: string): Promise<ConviteParaAceitar> {
  return requisitar<ConviteParaAceitar>('/api/v1/auth/invitation', {
    method: 'POST',
    body: { token },
  })
}

/**
 * Aceita o convite e já abre a sessão do painel, no estabelecimento que
 * convidou — como o login, com o refresh token no cookie. Uma sessão que o
 * navegador tinha acaba. Devolve o slug, para o painel ir até ele.
 */
export async function aceitarConvite(
  token: string,
  dados: { password: string; name?: string },
): Promise<string> {
  const resposta = await requisitar<RespostaDeSessao>('/api/v1/auth/invitation/accept', {
    method: 'POST',
    body: { token, ...dados },
    comCookie: true,
  })
  useSessaoStore.getState().guardar(resposta)
  return resposta.establishment.slug
}
