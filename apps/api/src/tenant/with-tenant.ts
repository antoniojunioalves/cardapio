import { sql } from 'drizzle-orm'

import { db } from '../db/index.js'
import type { TenantContext } from './context.js'

/**
 * A transação com o tenant já aplicado. Derivado do tipo do Drizzle em vez de
 * importado de um caminho interno, para não quebrar quando a biblioteca
 * reorganizar os próprios módulos.
 */
export type TenantTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Executa um trabalho com o isolamento de tenant ativo no banco.
 *
 * Tudo que acontece dentro do callback enxerga apenas as linhas do tenant do
 * contexto. Um `WHERE` esquecido devolve zero linhas — nunca linhas de outro
 * estabelecimento.
 *
 * Três detalhes deliberados:
 *
 * **É uma transação.** O `set_config` precisa valer para as consultas
 * seguintes na mesma conexão, e uma transação é o que garante que sejam a
 * mesma conexão do pool.
 *
 * **O terceiro argumento do `set_config` é `true`**, que torna o valor local à
 * transação. Ele desaparece no commit ou no rollback, então a conexão volta
 * limpa para o pool. Sem isso, a próxima requisição a pegar essa conexão
 * herdaria o tenant da anterior — um vazamento silencioso entre
 * estabelecimentos, e o pior tipo de bug possível neste sistema.
 *
 * **O tenantId vai como parâmetro**, não interpolado na string. O valor chega
 * ao PostgreSQL como bind, fora do alcance de qualquer injeção.
 *
 * Envolve a unidade de trabalho, não a requisição inteira: transação por
 * requisição seguraria uma conexão do pool durante um upload e não faz sentido
 * em conexões WebSocket de longa duração.
 */
export async function withTenant<T>(
  context: TenantContext,
  work: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${context.tenantId}, true)`)
    return work(tx)
  })
}
