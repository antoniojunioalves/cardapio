import { recordAudit } from '../audit/record.js'
import { tenantSettings, type TenantSettings } from '../db/schema/index.js'
import { AppError } from '../lib/errors.js'
import { detectarTipoDeImagem, novaChaveDeImagem, type StorageService } from '../storage/index.js'
import type { TenantContext } from '../tenant/context.js'
import { withTenant } from '../tenant/with-tenant.js'
import { ensureSettings } from './repository.js'

export type ImagemDoEstabelecimento = 'logo' | 'cover'

const COLUNA = { logo: 'logoKey', cover: 'coverKey' } as const

export class ImagemInvalidaError extends AppError {
  constructor() {
    super('Envie uma imagem JPEG, PNG ou WebP.', 415, 'UNSUPPORTED_MEDIA_TYPE')
    this.name = 'ImagemInvalidaError'
  }
}

/**
 * Troca o logo ou a capa do estabelecimento.
 *
 * A ordem das três operações é o que mantém banco e disco coerentes quando
 * algo falha no meio:
 *
 * 1. **Grava o arquivo novo.** Se falhar, nada mudou.
 * 2. **Aponta o banco para ele**, na transação, junto com a auditoria. Se a
 *    transação falhar, o arquivo novo é apagado — sobraria órfão.
 * 3. **Só depois do commit apaga o antigo.** Apagá-lo antes deixaria, num
 *    rollback, o banco apontando para um arquivo que não existe mais: um logo
 *    quebrado no cardápio público.
 *
 * Se o passo 3 falhar, sobra um arquivo sem referência. É a falha mais barata
 * possível — ocupa disco e não quebra nada que o cliente veja.
 */
export async function substituirImagem(
  service: StorageService,
  context: TenantContext,
  actorUserId: string,
  qual: ImagemDoEstabelecimento,
  conteudo: Uint8Array,
): Promise<TenantSettings> {
  const tipo = detectarTipoDeImagem(conteudo)
  if (!tipo) throw new ImagemInvalidaError()

  const chaveNova = novaChaveDeImagem(context.tenantId, qual, tipo)
  await service.put(chaveNova, conteudo, tipo)

  let chaveAntiga: string | null = null
  let resultado: TenantSettings

  try {
    resultado = await withTenant(context, async (tx) => {
      const atual = await ensureSettings(tx, context)
      chaveAntiga = atual[COLUNA[qual]]

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

      return atualizado
    })
  } catch (error) {
    await service.delete(chaveNova)
    throw error
  }

  if (chaveAntiga) await service.delete(chaveAntiga)

  return resultado
}

/** Remove o logo ou a capa. Mesma ordem: banco primeiro, arquivo depois do commit. */
export async function removerImagem(
  service: StorageService,
  context: TenantContext,
  actorUserId: string,
  qual: ImagemDoEstabelecimento,
): Promise<TenantSettings> {
  let chaveAntiga: string | null = null

  const resultado = await withTenant(context, async (tx) => {
    const atual = await ensureSettings(tx, context)
    chaveAntiga = atual[COLUNA[qual]]

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

    return atualizado
  })

  if (chaveAntiga) await service.delete(chaveAntiga)

  return resultado
}
