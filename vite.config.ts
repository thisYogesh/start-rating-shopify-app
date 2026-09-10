import { existsSync, readFileSync, writeFileSync } from "fs";
import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the Vite server.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

// Bridge Shopify CLI env vars into the Cloudflare worker dev runtime.
// `shopify app dev` sets these in the Node host process, but the
// @cloudflare/vite-plugin runs the worker in workerd which only sees
// bindings from wrangler.jsonc vars + .dev.vars. Writing them here
// makes the plugin pick them up automatically.
if (process.env.SHOPIFY_APP_URL) {
  const SHOPIFY_VARS = [
    "SHOPIFY_API_KEY",
    "SHOPIFY_API_SECRET",
    "SHOPIFY_APP_URL",
    "SCOPES",
    "SHOP_CUSTOM_DOMAIN",
  ] as const;

  // Read existing .dev.vars so we don't clobber manually-added entries
  const devVarsPath = ".dev.vars";
  const existing = existsSync(devVarsPath)
    ? readFileSync(devVarsPath, "utf-8")
    : "";
  const parsed = new Map(
    existing
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => {
        const idx = l.indexOf("=");
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()] as const;
      }),
  );

  for (const key of SHOPIFY_VARS) {
    if (process.env[key]) {
      parsed.set(key, process.env[key]!);
    }
  }

  writeFileSync(
    devVarsPath,
    Array.from(parsed.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
  );
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
  .hostname;

let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT!) || 8002,
    clientPort: 443,
  };
}

export default defineConfig({
  server: {
    allowedHosts: [host],
    cors: {
      preflightContinue: true,
    },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      allow: ["app", "node_modules", "workers"],
    },
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    reactRouter(),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react"],
  },
}) satisfies UserConfig;
