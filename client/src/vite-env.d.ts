/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_READONLY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
