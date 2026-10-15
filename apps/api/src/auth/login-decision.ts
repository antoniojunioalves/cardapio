/**
 * Com que vínculo uma conta entra no painel — ou por que não entra. Sem banco:
 * recebe os vínculos já lidos e decide.
 *
 * Só chega aqui quem já provou quem é (a senha conferiu, ou a sessão é
 * válida). Por isso o motivo da recusa pode ser específico: não há o que
 * revelar a quem não sabia a senha.
 */

export interface VinculoParaEntrar {
  tenantId: string
  userId: string
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING'
  isActive: boolean
  lastLoginAt: Date | null
  createdAt: Date
}

export type MotivoDaRecusa = 'suspenso' | 'desativado' | 'sem-estabelecimento'

export type DecisaoDeEntrada<T> =
  { tipo: 'entrar'; vinculo: T } | { tipo: 'recusar'; motivo: MotivoDaRecusa }

/** O vínculo serve para entrar: está ativo, num estabelecimento que não está suspenso. */
export const vinculoQueEntra = (vinculo: VinculoParaEntrar): boolean =>
  vinculo.isActive && vinculo.status !== 'SUSPENDED'

const instante = (data: Date | null) => data?.getTime() ?? Number.NEGATIVE_INFINITY

/**
 * Os vínculos com que a conta entra, do usado por último ao mais antigo. Quem
 * nunca entrou num deles vai para o fim, o vínculo mais novo antes.
 */
export function vinculosQueEntram<T extends VinculoParaEntrar>(vinculos: readonly T[]): T[] {
  return vinculos
    .filter(vinculoQueEntra)
    .sort(
      (a, b) =>
        instante(b.lastLoginAt) - instante(a.lastLoginAt) ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    )
}

/**
 * Entra no estabelecimento usado por último. Sem nenhum que sirva, a recusa diz
 * o motivo mais útil: um estabelecimento suspenso, se a pessoa está ativa nele;
 * senão, o acesso desativado; e, sem vínculo nenhum, que a conta não está em
 * equipe nenhuma.
 */
export function decidirEntrada<T extends VinculoParaEntrar>(
  vinculos: readonly T[],
): DecisaoDeEntrada<T> {
  const [primeiro] = vinculosQueEntram(vinculos)
  if (primeiro) return { tipo: 'entrar', vinculo: primeiro }

  if (vinculos.some((vinculo) => vinculo.isActive)) return { tipo: 'recusar', motivo: 'suspenso' }
  if (vinculos.length > 0) return { tipo: 'recusar', motivo: 'desativado' }
  return { tipo: 'recusar', motivo: 'sem-estabelecimento' }
}

export const MENSAGEM_DA_RECUSA: Record<MotivoDaRecusa, string> = {
  suspenso: 'Este estabelecimento está suspenso. Fale com o suporte.',
  desativado: 'Seu acesso foi desativado. Fale com o administrador do estabelecimento.',
  'sem-estabelecimento': 'Esta conta não está na equipe de nenhum estabelecimento.',
}
