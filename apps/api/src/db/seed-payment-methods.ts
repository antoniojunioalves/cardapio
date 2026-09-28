import { FORMAS_DE_PAGAMENTO } from './catalogs.js'
import { db } from './index.js'
import { paymentMethods } from './schema/index.js'

export { FORMAS_DE_PAGAMENTO }

/**
 * Semeia o catálogo de formas de pagamento da plataforma.
 *
 * Nenhuma fica habilitada para um estabelecimento: quem escolhe o que aceita é
 * o lojista, em `tenant_payment_methods`. Uma lista que já viesse toda ligada
 * acabaria com estabelecimento aceitando vale-refeição sem ter máquina.
 *
 * Acrescentar uma bandeira nova é editar `catalogs.ts` e rodar de novo — não
 * é uma migration. Idempotente.
 */
export async function seedPaymentMethods(): Promise<void> {
  for (const forma of FORMAS_DE_PAGAMENTO) {
    await db.insert(paymentMethods).values(forma).onConflictDoNothing({
      target: paymentMethods.code,
    })
  }
}
