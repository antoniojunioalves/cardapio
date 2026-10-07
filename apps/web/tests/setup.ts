import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/**
 * Nenhum teste fala com a rede de verdade. Cada teste instala a sua API
 * simulada (`vi.stubGlobal('fetch', …)`) e a tira no fim; o que sobra, entre
 * um teste e outro, é este `fetch`, que recusa.
 *
 * Sem ele sobrava o `fetch` de verdade, e uma chamada atrasada do painel — uma
 * releitura que ainda estava a caminho quando o teste acabou — ia para a API
 * de quem estivesse com o `pnpm dev` de pé. Ela respondia 401 (o token do teste
 * não vale nada), o painel tentava renovar a sessão, e a renovação caía na API
 * simulada do teste seguinte: três envios a mais num teste que não os fez, de
 * vez em quando (Fases 24 e 24b).
 */
export const SEM_REDE = 'Os testes não usam a rede: falta a API simulada deste teste.'
globalThis.fetch = () => Promise.reject(new Error(SEM_REDE))

afterEach(() => {
  cleanup()
})
