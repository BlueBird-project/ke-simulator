/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENTSOE_BIDDING_ZONE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
