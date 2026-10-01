import { useLocation } from 'react-router'

/** Marcador do endereço atual, para os testes conferirem aonde a navegação levou. */
export function OndeEstou() {
  return <span data-testid="local">{useLocation().pathname}</span>
}
