import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'

import { AdminLayout } from '@/features/admin/components/AdminLayout'
import { CardapioTabs } from '@/features/admin/components/CardapioTabs'
import { SettingsTabs } from '@/features/admin/components/SettingsTabs'
import { TeamTabs } from '@/features/admin/components/TeamTabs'
import { AdminDeliveryPage } from '@/pages/AdminDeliveryPage'
import { AdminHomePage } from '@/pages/AdminHomePage'
import { AdminHoursPage } from '@/pages/AdminHoursPage'
import { AdminMenuPage } from '@/pages/AdminMenuPage'
import { AdminOptionGroupsPage } from '@/pages/AdminOptionGroupsPage'
import { AdminOrdersPage } from '@/pages/AdminOrdersPage'
import { AdminPaymentPage } from '@/pages/AdminPaymentPage'
import { AdminProductPage } from '@/pages/AdminProductPage'
import { AdminProfilesPage } from '@/pages/AdminProfilesPage'
import { AdminSettingsPage } from '@/pages/AdminSettingsPage'
import { AdminTeamPage } from '@/pages/AdminTeamPage'
import { CheckoutPage } from '@/pages/CheckoutPage'
import { ConfirmEmailPage } from '@/pages/ConfirmEmailPage'
import { EnterPage } from '@/pages/EnterPage'
import { LandingPage } from '@/pages/LandingPage'
import { PrivacyPage, TermsPage } from '@/pages/LegalPages'
import { MenuPage } from '@/pages/MenuPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { OrderSentPage } from '@/pages/OrderSentPage'
import { SignupPage } from '@/pages/SignupPage'

/**
 * As rotas da aplicação, separadas dos providers para os testes montarem com
 * `MemoryRouter` num endereço qualquer.
 *
 * As páginas do produto — `/cadastro`, `/entrar`, `/termos` — ficam no mesmo
 * nível do cardápio de cada estabelecimento, `/:tenantSlug`. Rota fixa ganha
 * da rota com parâmetro, e é por isso que esses endereços são reservados no
 * cadastro (`SLUGS_RESERVADOS`, em `packages/shared`): um estabelecimento
 * chamado `cadastro` ficaria inacessível.
 *
 * `/lanchonete-do-ze` abre o cardápio, `/lanchonete-do-ze/checkout` finaliza o
 * pedido e `/lanchonete-do-ze/pedido-enviado` confirma. Qualquer outro segundo
 * segmento cai no não encontrado.
 *
 * `/lanchonete-do-ze/admin` é o painel do estabelecimento: a moldura
 * (`AdminLayout`) confere a sessão e traz o menu, e cada tela é uma rota filha
 * — o Início no índice, os pedidos em `/admin/pedidos`. Tela nova do painel:
 * uma rota filha aqui e uma entrada em `features/admin/menu.ts`.
 *
 * O cardápio tem duas abas (`CardapioTabs`): os produtos, em `/admin/cardapio`,
 * e os opcionais, em `/admin/cardapio/opcionais`. O produto se cadastra e se
 * edita em passos, fora das abas (`cardapio/produtos/novo` e
 * `cardapio/produtos/:id`, com `?passo=`); a categoria e os grupos de
 * opcionais se criam e se editam em janelas, sobre as listas.
 *
 * A equipe também tem duas abas (`TeamTabs`): as pessoas, em `/admin/equipe`,
 * e os perfis, em `/admin/equipe/perfis`. Cadastrar e editar uma pessoa ou um
 * perfil é numa janela, sobre a lista.
 *
 * As configurações têm abas, e cada aba é uma rota filha de
 * `/admin/configuracoes` (`SettingsTabs`): a do estabelecimento no índice, e
 * `horarios`, `entrega` e `pagamento`.
 *
 * O login é um só, em `/entrar`, com e-mail e senha: a pessoa não precisa
 * saber o endereço do estabelecimento para entrar.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/cadastro" element={<SignupPage />} />
      <Route path="/entrar" element={<EnterPage />} />
      <Route path="/confirmar-email" element={<ConfirmEmailPage />} />
      <Route path="/termos" element={<TermsPage />} />
      <Route path="/privacidade" element={<PrivacyPage />} />
      <Route path="/:tenantSlug" element={<MenuPage />} />
      <Route path="/:tenantSlug/checkout" element={<CheckoutPage />} />
      <Route path="/:tenantSlug/pedido-enviado" element={<OrderSentPage />} />
      <Route path="/:tenantSlug/admin" element={<AdminLayout />}>
        <Route index element={<AdminHomePage />} />
        <Route path="pedidos" element={<AdminOrdersPage />} />
        <Route path="cardapio" element={<CardapioTabs />}>
          <Route index element={<AdminMenuPage />} />
          <Route path="opcionais" element={<AdminOptionGroupsPage />} />
        </Route>
        <Route path="cardapio/produtos/novo" element={<AdminProductPage />} />
        <Route path="cardapio/produtos/:produtoId" element={<AdminProductPage />} />
        <Route path="equipe" element={<TeamTabs />}>
          <Route index element={<AdminTeamPage />} />
          <Route path="perfis" element={<AdminProfilesPage />} />
        </Route>
        <Route path="configuracoes" element={<SettingsTabs />}>
          <Route index element={<AdminSettingsPage />} />
          <Route path="horarios" element={<AdminHoursPage />} />
          <Route path="entrega" element={<AdminDeliveryPage />} />
          <Route path="pagamento" element={<AdminPaymentPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export function App() {
  // Um cliente por montagem da aplicação, e não no escopo do módulo: nos
  // testes, cada render começa com o cache vazio.
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
