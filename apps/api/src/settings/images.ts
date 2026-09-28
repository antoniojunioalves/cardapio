import { recordAudit } from '../audit/record.js'
import { tenantSettings, type TenantSettings } from '../db/schema/index.js'
import { novaChaveDeImagem, type StorageService } from '../storage/index.js'
import { removerImagem as removerImagemReferenciada, trocarImagem } from '../storage/replace.js'
import type { TenantContext } from '../tenant/context.js'
import { withTenant } from '../tenant/with-tenant.js'
import { ensureSettings } from './repository.js'

export { ImagemInvalidaError } from '../storage/replace.js'

export type ImagemDoEstabelecimento = 'logo' | 'cover'

const COLUNA = { logo: 'logoKey', cover: 'coverKey' } as const

/** Troca o logo ou a capa. A ordem das operações está em `trocarImagem`. */
export async function substituirImagem(
  service: StorageService,
  context: TenantContext,
  actorUserId: string,
  qual: ImagemDoEstabelecimento,
  conteudo: Uint8Array,
): Promise<TenantSettings> {
  return trocarImagem({
    service,
    conteudo,
    montarChave: (tipo) => novaChaveDeImagem(context.tenantId, qual, tipo),
    gravar: (chaveNova, tipo) =>
      withTenant(context, async (tx) => {
        const atual = await ensureSettings(tx, context)
        const chaveAntiga = atual[COLUNA[qual]]

        const [atualizado] = await tx
          .update(tenantSettings)
          .set({ [COLUNA[qual]]: chaveNova, updatedAt: new Date() })
          .returning()
        if (!atualizado) throw new Error('falha ao gravar a imagem nas configurações')

        await recordAudit(tx, context, {
          action: `settings.${qual}_changed`,
          entityType: 'tenant_settings',
          entityId: atualizado.id,
          actorUserId,
          metadata: { de: chaveAntiga, para: chaveNova, tipo, bytes: conteudo.byteLength },
        })

        return { resultado: atualizado, chaveAntiga }
      }),
  })
}

export async function removerImagem(
  service: StorageService,
  context: TenantContext,
  actorUserId: string,
  qual: ImagemDoEstabelecimento,
): Promise<TenantSettings> {
  return removerImagemReferenciada({
    service,
    remover: () =>
      withTenant(context, async (tx) => {
        const atual = await ensureSettings(tx, context)
        const chaveAntiga = atual[COLUNA[qual]]

        const [atualizado] = await tx
          .update(tenantSettings)
          .set({ [COLUNA[qual]]: null, updatedAt: new Date() })
          .returning()
        if (!atualizado) throw new Error('falha ao remover a imagem das configurações')

        if (chaveAntiga) {
          await recordAudit(tx, context, {
            action: `settings.${qual}_removed`,
            entityType: 'tenant_settings',
            entityId: atualizado.id,
            actorUserId,
            metadata: { removida: chaveAntiga },
          })
        }

        return { resultado: atualizado, chaveAntiga }
      }),
  })
}
