import { eq } from 'drizzle-orm'

import { PLANOS } from './catalogs.js'
import { db } from './index.js'
import { planFeatures, plans } from './schema/index.js'

export { PLANOS }

/**
 * Semeia os planos da plataforma e os recursos de cada um.
 *
 * Catálogo, e não dado de demonstração: o cadastro pela página inicial assina
 * o plano FREE, e sem ele no banco o cadastro fica indisponível. Por isso vive
 * separado do seed de demonstração — os testes e o seed de produção (Fase 28)
 * o chamam sem semear estabelecimentos. Idempotente.
 */
export async function seedPlans(): Promise<void> {
  for (const plano of PLANOS) {
    await db
      .insert(plans)
      .values({
        code: plano.code,
        name: plano.name,
        description: plano.description,
        sortOrder: plano.sortOrder,
      })
      .onConflictDoNothing({ target: plans.code })

    const [registro] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.code, plano.code))
      .limit(1)

    if (!registro) throw new Error(`plano ${plano.code} não foi criado`)

    for (const feature of plano.features) {
      await db
        .insert(planFeatures)
        .values({ planId: registro.id, ...feature })
        .onConflictDoNothing()
    }
  }
}
