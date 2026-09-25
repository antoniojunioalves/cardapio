import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * Base de lint compartilhada. É uma função porque o `tsconfigRootDir` precisa
 * apontar para a raiz de cada app — sem isso o lint com tipos não encontra o
 * tsconfig correto num monorepo.
 *
 * @param {{ tsconfigRootDir: string }} options
 */
export function baseConfig({ tsconfigRootDir }) {
  return tseslint.config(
    { ignores: ['dist/**', 'coverage/**', '.turbo/**'] },
    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
        globals: { ...globals.node },
      },
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],
      },
    },
    // Arquivos .js de configuração não fazem parte de nenhum tsconfig.
    { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
    prettier,
  )
}
