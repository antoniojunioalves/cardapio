import path from 'node:path'

import { app as product } from '@repo/config'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * O nome do produto entra no index.html por aqui, a partir de `@repo/config`.
 * É o que evita ter o nome escrito à mão no HTML e sair de sincronia com o
 * resto da aplicação quando ele mudar.
 */
const injectProductIdentity = {
  name: 'inject-product-identity',
  transformIndexHtml(html: string): string {
    return html
      .replaceAll('%APP_NAME%', product.name)
      .replaceAll('%APP_DESCRIPTION%', product.description)
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss(), injectProductIdentity],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
