import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'

import { AdminOrdersPage } from '@/pages/AdminOrdersPage'
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
 * pedido, `/lanchonete-do-ze/pedido-enviado` confirma e
 * `/lanchonete-do-ze/admin/pedidos` é o painel do estabelecimento. Qualquer
 * outro segundo segmento cai no não encontrado.
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
      <Route path="/:tenantSlug/admin/pedidos" element={<AdminOrdersPage />} />
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
