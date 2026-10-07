import { useEffect, useRef, useState } from 'react'

/**
 * A imagem de algo que ainda não existe — a foto de um produto sendo
 * cadastrado: escolhida agora, enviada depois de criar.
 */

export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp']
/** O mesmo teto da API (`UPLOAD_MAX_BYTES`), para avisar antes de enviar. */
const TAMANHO_MAXIMO = 15 * 1024 * 1024

export const GRANDE_DEMAIS = 'A imagem é grande demais. Envie uma de até 15 MB.'
export const TIPO_RECUSADO = 'Envie uma imagem JPEG, PNG ou WebP.'

/** Uma imagem escolhida e ainda não enviada: o arquivo e o endereço da prévia. */
export interface ImagemEscolhida {
  arquivo: File
  previa: string
}

/**
 * A imagem de algo que ainda não existe — a foto de um produto sendo
 * cadastrado. Guarda o arquivo e a prévia; quem usa o envia depois de criar.
 * A prévia é um endereço do navegador, liberado ao trocar, remover e sair.
 */
export function useImagemEscolhida() {
  const [escolhida, setEscolhida] = useState<ImagemEscolhida | null>(null)
  const [recusa, setRecusa] = useState<string>()
  const atual = useRef<ImagemEscolhida | null>(null)

  const trocar = (nova: ImagemEscolhida | null) => {
    if (atual.current) URL.revokeObjectURL(atual.current.previa)
    atual.current = nova
    setEscolhida(nova)
  }

  useEffect(
    () => () => {
      if (atual.current) URL.revokeObjectURL(atual.current.previa)
    },
    [],
  )

  return {
    escolhida,
    recusa,
    escolher: (arquivo: File) => {
      // As mesmas recusas da API, ditas antes: aqui ainda não há para onde enviar.
      if (!TIPOS_ACEITOS.includes(arquivo.type)) {
        setRecusa(TIPO_RECUSADO)
        return
      }
      if (arquivo.size > TAMANHO_MAXIMO) {
        setRecusa(GRANDE_DEMAIS)
        return
      }
      setRecusa(undefined)
      trocar({ arquivo, previa: URL.createObjectURL(arquivo) })
    },
    remover: () => {
      setRecusa(undefined)
      trocar(null)
    },
  }
}
