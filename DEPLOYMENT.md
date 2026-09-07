# Deploying to Cloudflare Workers

This app runs on Cloudflare Workers with D1 (SQLite) for rating data and KV for Shopify session storage.

## Prerequisites

- A Cloudflare account (free tier works — no queues are used)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (bundled as a dev dependency)
- Shopify CLI authenticated (`shopify auth`)

## 1. Authenticate with Cloudflare

```bash
npx wrangler login
```

This opens a browser for OAuth — one-time per machine.
Alternatively, set the `CLOUDFLARE_API_TOKEN` env var for CI/servers (needs Workers/D1/KV permissions).

## 2. Provision resources

Create the D1 database and KV namespace. Paste the returned IDs into `wrangler.jsonc`.

```bash
npx wrangler d1 create star-rating-db          # → database_id
npx wrangler kv namespace create SESSION_STORAGE  # → id
```

Open `wrangler.jsonc` and replace the placeholder values:

```jsonc
"d1_databases": [{ "database_id": "<PASTE_D1_DATABASE_ID_HERE>" ... }]
"kv_namespaces": [{ "id": "<PASTE_KV_NAMESPACE_ID_HERE>" }]
```

## 3. Run the D1 migration

```bash
npx wrangler d1 migrations apply star-rating-db --remote
```

This creates the `Rating` table in the production D1 database.

## 4. First deploy (get the workers.dev URL)

```bash
npx wrangler deploy
```

Note the printed URL, e.g. `https://star-rating.<account>.workers.dev`.

> **A Worker that 500s right after its first deploy is almost always missing secrets.** See step 5.

## 5. Set Worker secrets

Get your app credentials with `shopify app env show`, then set them:

```bash
printf '%s' "<SHOPIFY_API_KEY>"    | npx wrangler secret put SHOPIFY_API_KEY
printf '%s' "<SHOPIFY_API_SECRET>" | npx wrangler secret put SHOPIFY_API_SECRET
printf '%s' "https://star-rating.<account>.workers.dev" | npx wrangler secret put SHOPIFY_APP_URL
```

## 6. Update `shopify.app.toml` with the real URL

Replace the placeholder URLs:

```toml
application_url = "https://star-rating.<account>.workers.dev"

[app_proxy]
url = "https://star-rating.<account>.workers.dev/proxy"

[auth]
redirect_urls = [ "https://star-rating.<account>.workers.dev/api/auth" ]
```

## 7. Push the Shopify config

```bash
shopify app deploy
```

This syncs the corrected `application_url`, redirect URLs, scopes, webhooks, and metafield definitions with the Partner Dashboard.

## Ongoing deploys

After the first deploy, a single command builds, deploys the Worker, and syncs Shopify config:

```bash
npm run deploy:cf
```

This runs: `npm run build && npx wrangler deploy && shopify app deploy`

## Local development

Local dev still uses the Shopify CLI tunnel as before:

```bash
npm run dev
```

Wrangler's local D1/KV emulation is wired in automatically via the Cloudflare Vite plugin during `shopify app dev`.
