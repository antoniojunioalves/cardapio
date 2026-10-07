import { useLocation } from 'react-router'

/** Marcadores do endereço atual, para os testes conferirem aonde a navegação levou. */
export function OndeEstou() {
  const { pathname, search } = useLocation()
  return (
    <>
      <span data-testid="local">{pathname}</span>
      <span data-testid="busca">{search}</span>
    </>
  )
}
