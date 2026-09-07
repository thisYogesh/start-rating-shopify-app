/// <reference types="vite/client" />
/// <reference types="@cloudflare/workers-types" />

interface Env {
  SESSION_STORAGE: KVNamespace;
  STAR_RATING_DB: D1Database;
  SHOPIFY_API_KEY: string;
  SHOPIFY_API_SECRET: string;
  SHOPIFY_APP_URL: string;
  SCOPES: string;
  SHOP_CUSTOM_DOMAIN?: string;
}

// Set by workers/app.ts before the first request is handled.
// eslint-disable-next-line no-var
declare var __env: Env;
