import { useId, type ComponentProps } from 'react'

interface SelectFieldProps extends ComponentProps<'select'> {
  rotulo: string
  erro?: string | undefined
  dica?: string | undefined
}

/** Como o `TextField`, para escolher uma opção de uma lista. As opções vêm como filhos. */
export function SelectField({
  rotulo,
  erro,
  dica,
  id,
  className = '',
  children,
  ...props
}: SelectFieldProps) {
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
      <select
        id={idDoCampo}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descricao || undefined}
        className={`text-body w-full rounded-control border bg-surface px-3 py-2 disabled:bg-surface-muted disabled:text-content-muted ${
          erro ? 'border-danger' : 'border-border'
        }`}
        {...props}
      >
        {children}
      </select>
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
