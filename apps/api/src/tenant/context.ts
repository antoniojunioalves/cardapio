/**
 * De onde o tenant da requisição foi determinado.
 *
 * Guardar a origem não é decoração: ela aparece nos logs e na auditoria, e
 * permite responder "como este pedido soube que era o tenant X?" meses depois.
 */
export type TenantSource = 'authenticated-user' | 'public-slug' | 'token' | 'signup'

export interface TenantContext {
  readonly tenantId: string
  readonly source: TenantSource
}

/**
 * O tenant do usuário autenticado, lido do vínculo dele no banco.
 * Área administrativa.
 */
export function tenantContextFromUser(tenantId: string): TenantContext {
  return { tenantId, source: 'authenticated-user' }
}

/**
 * O tenant resolvido a partir do `tenantSlug` da URL pública, já traduzido
 * para id pelo servidor. Área pública, sem login.
 */
export function tenantContextFromPublicSlug(tenantId: string): TenantContext {
  return { tenantId, source: 'public-slug' }
}

/**
 * O tenant embutido num token que nós mesmos emitimos — refresh token e link de
 * confirmação de e-mail. É dica de roteamento, não credencial: o hash do token
 * inteiro precisa existir dentro desse tenant, então trocar o prefixo só faz a
 * busca falhar (`auth/tokens.ts`).
 */
export function tenantContextFromToken(tenantId: string): TenantContext {
  return { tenantId, source: 'token' }
}

/**
 * O estabelecimento que o cadastro está criando. O id é gerado pelo banco antes
 * da transação que cria o estabelecimento, e o contexto nasce dele — não há
 * tenant anterior de onde tirá-lo. Só a criação de estabelecimento usa esta
 * origem (`signup/establishment.ts`).
 */
export function tenantContextFromSignup(tenantId: string): TenantContext {
  return { tenantId, source: 'signup' }
}

/*
 * Não existe um construtor genérico de TenantContext, e a ausência é o ponto.
 *
 * As funções acima nomeiam as ÚNICAS origens legítimas de um tenant. Não
 * há como escrever `tenantContextFrom(request.body.tenantId)` — seria preciso
 * inventar uma terceira função e batizá-la de algo como
 * `tenantContextFromRequestBody`, o que deixaria o problema visível em qualquer
 * revisão de código. É mais difícil errar por acidente do que por decisão.
 */
