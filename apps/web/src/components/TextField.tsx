import { useId, type ComponentProps } from 'react'

interface TextFieldProps extends ComponentProps<'input'> {
  rotulo: string
  erro?: string | undefined
  dica?: string | undefined
}

/**
 * Campo de texto com rótulo, dica e mensagem de erro.
 *
 * O erro fica ligado ao campo por `aria-describedby` e marcado com
 * `aria-invalid`: quem usa leitor de tela ouve a mensagem ao voltar ao campo,
 * e não só vê um contorno vermelho.
 */
export function TextField({ rotulo, erro, dica, id, className = '', ...props }: TextFieldProps) {
  const gerado = useId()
  const idDoCampo = id ?? gerado
  const idDaDica = `${idDoCampo}-dica`
  const idDoErro = `${idDoCampo}-erro`
  const descricao = [dica && idDaDica, erro && idDoErro].filter(Boolean).join(' ')

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={idDoCampo} className="text-body font-semibold text-content">
        {rotulo}
      </label>
      <input
        id={idDoCampo}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descricao || undefined}
        className={`text-body w-full rounded-control border bg-surface px-3 py-2 ${
          erro ? 'border-danger' : 'border-border'
        }`}
        {...props}
      />
      {dica && (
        <p id={idDaDica} className="text-caption text-content-muted">
          {dica}
        </p>
      )}
      {erro && (
        <p id={idDoErro} className="text-caption text-danger">
          {erro}
        </p>
      )}
    </div>
  )
}
