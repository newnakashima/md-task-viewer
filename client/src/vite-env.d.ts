/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_READONLY?: string;
  readonly VITE_READONLY_ENCRYPTED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
