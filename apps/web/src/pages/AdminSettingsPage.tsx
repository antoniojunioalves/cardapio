import { SettingsForm } from '@/features/admin/components/SettingsForm'
import { usePainel, useTituloDoPainel } from '@/features/admin/panel'
import { useConfiguracoes } from '@/features/admin/settings'

/**
 * As configurações do estabelecimento, em `/{tenantSlug}/admin/configuracoes`:
 * nome, descrição, imagens, contato, endereço e as regras do pedido.
 */
export function AdminSettingsPage() {
  const { slug, permissoes } = usePainel()
  const consulta = useConfiguracoes(slug)

  useTituloDoPainel('Configurações')

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-section-y">
      <h1 className="text-heading text-content">Configurações</h1>

      {consulta.isPending ? (
        <p className="text-body text-content-muted">Carregando as configurações…</p>
      ) : consulta.isError ? (
        <p role="alert" className="text-body text-content-muted">
          Não foi possível carregar as configurações. Recarregue a página para tentar de novo.
        </p>
      ) : (
        <SettingsForm
          slug={slug}
          configuracoes={consulta.data}
          podeEditar={permissoes.includes('settings:update')}
        />
      )}
    </div>
  )
}
