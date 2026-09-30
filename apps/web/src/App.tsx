import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'

import { AdminLoginPage } from '@/pages/AdminLoginPage'
import { AdminOrdersPage } from '@/pages/AdminOrdersPage'
import { CheckoutPage } from '@/pages/CheckoutPage'
import { HomePage } from '@/pages/HomePage'
import { MenuPage } from '@/pages/MenuPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { OrderSentPage } from '@/pages/OrderSentPage'

/**
 * As rotas da aplicação, separadas dos providers para os testes montarem com
 * `MemoryRouter` num endereço qualquer.
 *
 * `/:tenantSlug` casa com um segmento só, então `/lanchonete-do-ze` abre o
 * cardápio, `/lanchonete-do-ze/checkout` finaliza o pedido,
 * `/lanchonete-do-ze/pedido-enviado` confirma, `/lanchonete-do-ze/admin` é o
 * painel do estabelecimento, e qualquer outro
 * segundo segmento cai no não encontrado. As
 * rotas administrativas, quando vierem, ficam sob um prefixo próprio.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/:tenantSlug" element={<MenuPage />} />
      <Route path="/:tenantSlug/checkout" element={<CheckoutPage />} />
      <Route path="/:tenantSlug/pedido-enviado" element={<OrderSentPage />} />
      <Route path="/:tenantSlug/admin" element={<AdminLoginPage />} />
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
