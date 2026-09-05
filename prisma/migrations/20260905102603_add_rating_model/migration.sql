-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerIdentifier" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Rating_shop_productId_idx" ON "Rating"("shop", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_shop_productId_customerIdentifier_key" ON "Rating"("shop", "productId", "customerIdentifier");
