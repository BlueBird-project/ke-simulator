/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENTSOE_BIDDING_ZONE?: string;
  readonly VITE_USE_KE?: string;
  readonly VITE_KE_BRIDGE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
