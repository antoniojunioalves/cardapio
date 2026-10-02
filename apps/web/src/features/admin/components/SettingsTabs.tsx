import { useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'

import { ABAS_DAS_CONFIGURACOES, caminhoDoPainel } from '../menu'
import { usePainel, useTituloDoPainel } from '../panel'

/**
 * A moldura de Configurações: o título, as abas e, abaixo, a aba aberta. Cada
 * aba é um endereço — `/{tenantSlug}/admin/configuracoes/horarios` —, e por
 * isso são links, e não botões: dá para abrir numa aba do navegador, voltar
 * com o botão de voltar e chegar direto pela lista do Início.
 */
export function SettingsTabs() {
  const painel = usePainel()
  const faixa = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  useTituloDoPainel('Configurações')

  // Quem chega direto numa aba do fim da faixa — pelo link da lista do Início,
  // por exemplo — precisa vê-la marcada, e no celular ela estaria fora da vista.
  useEffect(() => {
    const ativa = faixa.current?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!faixa.current || !ativa) return
    faixa.current.scrollLeft =
      ativa.offsetLeft - (faixa.current.clientWidth - ativa.offsetWidth) / 2
  }, [pathname])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-section-y">
      <h1 className="text-heading text-content">Configurações</h1>

      {/* No celular as abas não cabem lado a lado: a faixa rola, e a página não. */}
      <nav
        ref={faixa}
        aria-label="Configurações"
        // `relative`: é em relação à faixa que a posição da aba ativa é medida.
        className="relative -mx-page-x overflow-x-auto px-page-x"
      >
        <ul className="flex min-w-max gap-1 border-b border-border">
          {ABAS_DAS_CONFIGURACOES.map((aba) => (
            <li key={aba.caminho}>
              <NavLink
                to={caminhoDoPainel(painel.slug, aba.caminho)}
                // Sem `end`, "Estabelecimento" ficaria marcada em todas as abas.
                end
                className={({ isActive }) =>
                  `text-body -mb-px block border-b-2 px-3 py-2.5 font-semibold whitespace-nowrap ${
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-content-muted hover:text-content'
                  }`
                }
              >
                {aba.rotulo}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* As abas são telas do painel como as outras: recebem o mesmo contexto. */}
      <Outlet context={painel} />
    </div>
  )
}
