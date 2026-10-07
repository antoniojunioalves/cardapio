import type { UseMutationResult } from '@tanstack/react-query'
import { useId, type ChangeEvent } from 'react'

import { IconeEditar, IconeLixeira } from '@/components/icons'
import { ApiError } from '@/services/api'

import {
  GRANDE_DEMAIS,
  TIPO_RECUSADO,
  TIPOS_ACEITOS,
  type useImagemEscolhida,
} from '../image-choice'

/** O que a pessoa lê quando o envio da imagem é recusado. */
function mensagemDaFalha(erro: unknown): string {
  if (erro instanceof ApiError) {
    if (erro.status === 413) return GRANDE_DEMAIS
    if (erro.status === 415) return TIPO_RECUSADO
    // "Não foi possível ler esta imagem", "pixels demais": a API já fala com a pessoa.
    if (erro.status === 422) return erro.message
  }
  return 'Não foi possível enviar a imagem agora. Tente de novo.'
}

/**
 * Como os botões de escolher e remover aparecem: com texto, abaixo da imagem
 * e do título dela ("Logo", "Trocar logo", "Remover"), ou em ícones pequenos —
 * o lápis e a lixeira —, dentro de uma moldura que envolve a imagem, sem título.
 */
type AcoesDaImagem = 'texto' | 'icones'

interface QuadroDaImagemProps {
  /** "Logo", "Capa", "Foto": vira "Foto atual" na prévia. */
  rotulo: string
  /** O que a pessoa precisa saber da imagem. Sem ela, a prévia e os botões bastam. */
  dica?: string | undefined
  url: string | null
  /** A proporção da moldura da prévia: o logo é quadrado, a capa é larga. */
  moldura: string
  acoes: AcoesDaImagem
  podeEditar: boolean
  /** O que abre a escolha do arquivo: "Enviar foto", "Trocar foto". */
  acao: string
  enviando?: boolean
  removendo?: boolean
  aoEscolher: (arquivo: File) => void
  /** Sem ele, não há "Remover". */
  aoRemover?: (() => void) | undefined
  falha?: string | undefined
}

/** O quadradinho de um ícone, abaixo da imagem: pequeno, com a borda da cor do ícone. */
const botaoDeIcone = 'flex size-8 items-center justify-center rounded-control border'

/** A prévia de uma imagem com os botões de escolher e remover: o desenho, sem saber quem grava. */
function QuadroDaImagem({
  rotulo,
  dica,
  url,
  moldura,
  acoes,
  podeEditar,
  acao,
  enviando = false,
  removendo = false,
  aoEscolher,
  aoRemover,
  falha,
}: QuadroDaImagemProps) {
  const id = useId()
  const ocupado = enviando || removendo

  function aoMudar(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0]
    // Limpa o campo: escolher de novo o mesmo arquivo precisa disparar a mudança.
    evento.target.value = ''
    if (arquivo) aoEscolher(arquivo)
  }

  const previa = url ? (
    <img src={url} alt={`${rotulo} atual`} className="size-full object-cover" />
  ) : (
    <span className="text-caption text-content-muted">Sem imagem</span>
  )
  const arquivo = (
    <input
      id={id}
      type="file"
      accept={TIPOS_ACEITOS.join(',')}
      disabled={ocupado}
      onChange={aoMudar}
      className="sr-only"
    />
  )

  return (
    <div className="flex flex-col gap-2">
      {acoes === 'icones' ? (
        // A imagem numa moldura, com o lápis e a lixeira logo abaixo, dentro dela, e sem o título
        // em cima (pedidos do Junio): a moldura já diz o que é. O nome fica para o leitor de tela.
        <div
          role="group"
          aria-label={rotulo}
          className="flex w-fit flex-col items-center gap-2 rounded-card border border-border p-2"
        >
          <div
            className={`flex items-center justify-center overflow-hidden rounded-control bg-surface-muted ${moldura}`}
          >
            {previa}
          </div>
          {podeEditar && (
            <div className="flex items-center gap-2">
              {/*
                O campo do arquivo fica escondido dentro do rótulo: o lápis é o
                que se vê e se toca, e o texto — "Trocar foto" — é o nome que o
                leitor de tela diz. Com o teclado, o contorno aparece no lápis.
              */}
              <label
                htmlFor={id}
                className={`${botaoDeIcone} border-info/40 text-info has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-info ${
                  ocupado ? 'opacity-50' : 'cursor-pointer hover:bg-info/10'
                }`}
              >
                <IconeEditar className="size-4" />
                <span className="sr-only">{acao}</span>
                {arquivo}
              </label>
              {url && aoRemover && (
                <button
                  type="button"
                  aria-label={`Remover ${rotulo.toLowerCase()}`}
                  disabled={ocupado}
                  onClick={aoRemover}
                  className={`${botaoDeIcone} border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-50 disabled:hover:bg-transparent`}
                >
                  <IconeLixeira className="size-4" />
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="text-body font-semibold text-content">{rotulo}</p>
          <div
            className={`flex items-center justify-center overflow-hidden rounded-control border border-border bg-surface-muted ${moldura}`}
          >
            {previa}
          </div>
        </>
      )}

      {/* Só com ícones, não há um botão onde escrever o que está acontecendo. */}
      {acoes === 'icones' && ocupado && (
        <p className="text-caption text-content-muted">{enviando ? 'Enviando…' : 'Removendo…'}</p>
      )}

      {dica && <p className="text-caption text-content-muted">{dica}</p>}

      {acoes === 'texto' && podeEditar && (
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={id}
            className={`text-caption rounded-control border border-border-strong px-3 py-1.5 font-semibold text-content ${
              ocupado ? 'opacity-50' : 'cursor-pointer hover:bg-surface-muted'
            }`}
          >
            {enviando ? 'Enviando…' : acao}
          </label>
          {arquivo}
          {url && aoRemover && (
            <button
              type="button"
              disabled={ocupado}
              onClick={aoRemover}
              className="text-caption font-semibold text-danger hover:underline disabled:opacity-50"
            >
              {removendo ? 'Removendo…' : 'Remover'}
            </button>
          )}
        </div>
      )}

      {falha && (
        <p role="alert" className="text-caption text-danger">
          {falha}
        </p>
      )}
    </div>
  )
}

interface ImageFieldProps {
  /** "Logo", "Capa", "Foto": vira "Enviar foto", "Trocar foto" e "Foto atual". */
  rotulo: string
  dica?: string | undefined
  url: string | null
  podeEditar: boolean
  moldura: string
  /** Com texto, se nada for dito; a foto do produto usa os ícones. */
  acoes?: AcoesDaImagem
  /** A gravação do arquivo escolhido — a rota de imagem de quem usa o campo. */
  envio: UseMutationResult<unknown, Error, File>
  remocao: UseMutationResult<unknown, Error, void>
}

/**
 * Uma imagem — logo, capa, foto de produto —, com a prévia e os botões de
 * enviar e remover. A imagem é gravada na hora, e não com o "Salvar" do
 * formulário: é outra rota, e a pessoa vê o resultado ao escolher o arquivo.
 */
export function ImageField({
  rotulo,
  dica,
  url,
  podeEditar,
  moldura,
  acoes = 'texto',
  envio,
  remocao,
}: ImageFieldProps) {
  const falha = envio.error ?? remocao.error
  const nome = rotulo.toLowerCase()

  return (
    <QuadroDaImagem
      rotulo={rotulo}
      dica={dica}
      url={url}
      moldura={moldura}
      acoes={acoes}
      podeEditar={podeEditar}
      acao={url ? `Trocar ${nome}` : `Enviar ${nome}`}
      enviando={envio.isPending}
      removendo={remocao.isPending}
      aoEscolher={(arquivo) => {
        remocao.reset()
        envio.mutate(arquivo)
      }}
      aoRemover={() => {
        envio.reset()
        remocao.mutate()
      }}
      falha={falha ? mensagemDaFalha(falha) : undefined}
    />
  )
}

interface ImagemAEnviarProps {
  rotulo: string
  dica?: string | undefined
  moldura: string
  acoes?: AcoesDaImagem
  imagem: ReturnType<typeof useImagemEscolhida>
  /** Quem usa o campo está gravando: a imagem escolhida já está a caminho. */
  enviando: boolean
}

/** O campo de uma imagem escolhida e ainda não enviada, com a prévia. */
export function ImagemAEnviar({
  rotulo,
  dica,
  moldura,
  acoes = 'texto',
  imagem,
  enviando,
}: ImagemAEnviarProps) {
  const nome = rotulo.toLowerCase()
  return (
    <QuadroDaImagem
      rotulo={rotulo}
      dica={dica}
      url={imagem.escolhida?.previa ?? null}
      moldura={moldura}
      acoes={acoes}
      podeEditar
      acao={imagem.escolhida ? `Trocar ${nome}` : `Escolher ${nome}`}
      enviando={enviando && Boolean(imagem.escolhida)}
      aoEscolher={imagem.escolher}
      aoRemover={imagem.remover}
      falha={imagem.recusa}
    />
  )
}
