-- Rating table (sessions are stored in KV, not D1)
CREATE TABLE IF NOT EXISTS "Rating" (
  "id"                  TEXT NOT NULL PRIMARY KEY,
  "shop"                TEXT NOT NULL,
  "productId"           TEXT NOT NULL,
  "customerIdentifier"  TEXT NOT NULL,
  "rating"              INTEGER NOT NULL,
  "createdAt"           TEXT NOT NULL DEFAULT (datetime('now')),
  "updatedAt"           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "Rating_shop_productId_customerIdentifier_key"
  ON "Rating" ("shop", "productId", "customerIdentifier");

CREATE INDEX IF NOT EXISTS "Rating_shop_productId_idx"
  ON "Rating" ("shop", "productId");
