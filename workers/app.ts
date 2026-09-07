import { createRequestHandler } from "react-router";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module "react-router" {
  interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  // @ts-ignore virtual module provided by @cloudflare/vite-plugin
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    // Populate process.env with string bindings so the Shopify adapter
    // (which reads process.env at module-init time) picks them up.
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === "string") {
        process.env[key] = value;
      }
    }

    // Stash the full env (incl. D1/KV objects) on globalThis so server
    // modules that are loaded lazily on the first request can access them.
    (globalThis as Record<string, unknown>).__env = env;

    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;
