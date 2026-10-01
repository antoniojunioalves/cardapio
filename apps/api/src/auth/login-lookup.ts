import { eq, sql } from 'drizzle-orm'

import { db } from '../db/index.js'
import { users } from '../db/schema/index.js'

/**
 * Acha o estabelecimento de um e-mail, para o login.
 *
 * O login pede só e-mail e senha, então não há slug de onde tirar o tenant — e
 * sem tenant a tabela `users` não mostra linha nenhuma. Esta consulta roda
 * fora de contexto de tenant, como `findTenantBySlug`, pelo mesmo motivo: é
 * ela que estabelece o contexto.
 *
 * O que a contém é o banco, e não o cuidado de quem chama: a policy
 * `login_por_email` só deixa ler a linha cujo e-mail é igual a
 * `app.login_email`. Definir a variável com o e-mail de quem está entrando
 * mostra aquela linha e nenhuma outra — não há como listar usuários por aqui.
 * O `true` do `set_config` faz a variável valer só nesta transação.
 *
 * Devolve só o `tenant_id`. A senha é conferida depois, dentro do contexto do
 * estabelecimento, e é ela que decide se alguém entra.
 */
export async function tenantDoEmail(email: string): Promise<string | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.login_email', ${email}, true)`)

    const [usuario] = await tx
      .select({ tenantId: users.tenantId })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    return usuario?.tenantId ?? null
  })
}
