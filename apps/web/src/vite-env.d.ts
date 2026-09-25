/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base da API. Sem valor definido, cai no servidor local de desenvolvimento. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
