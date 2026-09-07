import type { Config } from "@react-router/dev/config";

export default {
  // Embedded Shopify apps use session-token auth (not cookies),
  // so React Router's origin-based CSRF check is redundant and
  // causes false positives inside the admin iframe.
  allowedActionOrigins: ["**"],
  future: {
    v8_viteEnvironmentApi: true,
  },
} satisfies Config;
