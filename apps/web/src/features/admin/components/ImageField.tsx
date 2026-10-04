import { useId, type ChangeEvent } from 'react'

import { ApiError } from '@/services/api'

import { useEnviarImagem, useRemoverImagem, type ImagemDoEstabelecimento } from '../settings'

/** O que a pessoa lê quando o envio da imagem é recusado. */
function mensagemDaFalha(erro: unknown): string {
  if (erro instanceof ApiError) {
    if (erro.status === 413) return 'A imagem é grande demais. Envie uma de até 15 MB.'
    if (erro.status === 415) return 'Envie uma imagem JPEG, PNG ou WebP.'
    // "Não foi possível ler esta imagem", "pixels demais": a API já fala com a pessoa.
    if (erro.status === 422) return erro.message
  }
  return 'Não foi possível enviar a imagem agora. Tente de novo.'
}

interface ImageFieldProps {
  slug: string
  qual: ImagemDoEstabelecimento
  rotulo: string
  dica: string
  url: string | null
  podeEditar: boolean
  /** A proporção da moldura da prévia: o logo é quadrado, a capa é larga. */
  moldura: string
}

/**
 * Uma imagem do estabelecimento — logo ou capa —, com a prévia e os botões de
 * enviar e remover. A imagem é gravada na hora, e não com o "Salvar" do
 * formulário: é outra rota, e a pessoa vê o resultado ao escolher o arquivo.
 */
export function ImageField({
  slug,
  qual,
  rotulo,
  dica,
  url,
  podeEditar,
  moldura,
}: ImageFieldProps) {
  const id = useId()
  const envio = useEnviarImagem(slug, qual)
  const remocao = useRemoverImagem(slug, qual)
  const ocupado = envio.isPending || remocao.isPending
  const falha = envio.error ?? remocao.error

  function aoEscolher(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0]
    // Limpa o campo: escolher de novo o mesmo arquivo precisa disparar a mudança.
    evento.target.value = ''
    if (!arquivo) return
    remocao.reset()
    envio.mutate(arquivo)
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body font-semibold text-content">{rotulo}</p>

      <div
        className={`flex items-center justify-center overflow-hidden rounded-control border border-border bg-surface-muted ${moldura}`}
      >
        {url ? (
          <img src={url} alt={`${rotulo} atual`} className="size-full object-cover" />
        ) : (
          <span className="text-caption text-content-muted">Sem imagem</span>
        )}
      </div>

      <p className="text-caption text-content-muted">{dica}</p>

      {podeEditar && (
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={id}
            className={`text-caption rounded-control border border-border-strong px-3 py-1.5 font-semibold text-content ${
              ocupado ? 'opacity-50' : 'cursor-pointer hover:bg-surface-muted'
            }`}
          >
            {envio.isPending
              ? 'Enviando…'
              : url
                ? `Trocar ${rotulo.toLowerCase()}`
                : `Enviar ${rotulo.toLowerCase()}`}
          </label>
          <input
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={ocupado}
            onChange={aoEscolher}
            className="sr-only"
          />
          {url && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => {
                envio.reset()
                remocao.mutate()
              }}
              className="text-caption font-semibold text-danger hover:underline disabled:opacity-50"
            >
              {remocao.isPending ? 'Removendo…' : 'Remover'}
            </button>
          )}
        </div>
      )}

      {falha && (
        <p role="alert" className="text-caption text-danger">
          {mensagemDaFalha(falha)}
        </p>
      )}
    </div>
  )
}
