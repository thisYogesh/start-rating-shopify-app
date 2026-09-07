/**
 * D1 database accessor.
 *
 * The D1 binding is stored on globalThis.__env by the Worker entry
 * (workers/app.ts) before the first request is handled.
 */
export function getDb(): D1Database {
  const db = globalThis.__env?.STAR_RATING_DB;
  if (!db) {
    throw new Error(
      "D1 database binding STAR_RATING_DB is not available. " +
        "Make sure wrangler.jsonc declares the binding and the Worker entry sets globalThis.__env.",
    );
  }
  return db;
}
