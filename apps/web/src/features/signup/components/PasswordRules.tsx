import { REGRAS_DA_SENHA } from '@repo/shared'

/**
 * As regras da senha, marcadas conforme a pessoa digita — as mesmas que a API
 * aplica (`REGRAS_DA_SENHA`, em `packages/shared`). Quem usa leitor de tela
 * ouve "atendida" ou "falta" em cada uma, e não só vê a cor.
 */
export function PasswordRules({ id, senha }: { id: string; senha: string }) {
  return (
    <ul id={id} aria-label="Regras da senha" className="text-caption flex flex-col gap-0.5">
      {REGRAS_DA_SENHA.map((regra) => {
        const atendida = regra.atende(senha)
        return (
          <li
            key={regra.descricao}
            className={`flex items-center gap-1.5 ${atendida ? 'text-success' : 'text-content-muted'}`}
          >
            <span aria-hidden="true" className="w-3 text-center">
              {atendida ? '✓' : '○'}
            </span>
            <span>
              {regra.descricao}
              <span className="sr-only">{atendida ? ': atendida' : ': falta'}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
