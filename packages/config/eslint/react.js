import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

import { baseConfig } from './base.js'

/**
 * Lint para apps React. Estende a base e acrescenta as regras de hooks
 * e de fast-refresh do Vite.
 *
 * @param {{ tsconfigRootDir: string }} options
 */
export function reactConfig({ tsconfigRootDir }) {
  return [
    ...baseConfig({ tsconfigRootDir }),
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: { globals: { ...globals.browser } },
      plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
      rules: {
        ...reactHooks.configs.recommended.rules,
        'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      },
    },
  ]
}
