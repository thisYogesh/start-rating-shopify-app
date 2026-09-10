import { useEffect, useState, useCallback, useMemo } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getDb } from "../db.server";
import {
  METAFIELD_NAMESPACE,
  METAFIELD_KEYS,
  ensureMetafieldDefinitions,
} from "../metafields.server";

/* ─── Types ─── */

interface ProductNode {
  id: string;
  title: string;
  featuredImage: { url: string; altText: string | null } | null;
  avgRating: { value: string } | null;
  ratingCount: { value: string } | null;
}

interface LoaderData {
  products: ProductNode[];
  totalReviews: number;
  overallAverage: number;
}

/* ─── Loader ─── */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  await ensureMetafieldDefinitions(admin);

  const response = await admin.graphql(
    `#graphql
      query getProducts($ns: String!) {
        products(first: 50) {
          edges {
            node {
              id
              title
              featuredImage {
                url
                altText
              }
              avgRating: metafield(namespace: $ns, key: "avg_rating") {
                value
              }
              ratingCount: metafield(namespace: $ns, key: "rating_count") {
                value
              }
            }
          }
        }
      }
    `,
    { variables: { ns: METAFIELD_NAMESPACE } },
  );

  const responseJson = await response.json();
  const products: ProductNode[] =
    responseJson.data?.products?.edges?.map(
      (edge: { node: ProductNode }) => edge.node,
    ) ?? [];

  const totalReviews = products.reduce(
    (sum, p) => sum + (p.ratingCount ? parseInt(p.ratingCount.value, 10) : 0),
    0,
  );
  const rated = products.filter(
    (p) => p.avgRating && parseFloat(p.avgRating.value) > 0,
  );
  const overallAverage =
    rated.length > 0
      ? rated.reduce((s, p) => s + parseFloat(p.avgRating!.value), 0) /
        rated.length
      : 0;

  return { products, totalReviews, overallAverage };
};

/* ─── Action ─── */

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType === "updateRating") {
    const productId = formData.get("productId") as string;
    const newRating = parseInt(formData.get("newRating") as string, 10);

    if (!productId || isNaN(newRating) || newRating < 1 || newRating > 5) {
      return { error: "Invalid product ID or rating (must be 1-5)." };
    }

    const db = getDb();
    const numericId = productId.replace("gid://shopify/Product/", "");

    // Delete ALL existing ratings for this product (full reset)
    await db
      .prepare(
        `DELETE FROM "Rating" WHERE "shop" = ? AND "productId" = ?`,
      )
      .bind(session.shop, numericId)
      .run();

    // Insert a single admin rating as the new baseline
    await db
      .prepare(
        `INSERT INTO "Rating" ("id", "shop", "productId", "customerIdentifier", "rating", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .bind(
        crypto.randomUUID(),
        session.shop,
        numericId,
        "admin",
        newRating,
      )
      .run();

    const ratingCount = 1;
    const avgRating = newRating;

    const gqlResponse = await admin.graphql(
      `#graphql
        mutation setProductRating($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { id key namespace value }
            userErrors { field message }
          }
        }
      `,
      {
        variables: {
          metafields: [
            {
              namespace: METAFIELD_NAMESPACE,
              key: METAFIELD_KEYS.AVG_RATING,
              ownerId: productId,
              type: "number_decimal",
              value: avgRating.toFixed(1),
            },
            {
              namespace: METAFIELD_NAMESPACE,
              key: METAFIELD_KEYS.RATING_COUNT,
              ownerId: productId,
              type: "number_integer",
              value: String(ratingCount),
            },
          ],
        },
      },
    );

    const gqlJson: any = await gqlResponse.json();

    if (gqlJson.errors?.length > 0) {
      return { error: gqlJson.errors[0].message };
    }
    const userErrors = gqlJson.data?.metafieldsSet?.userErrors;
    if (userErrors?.length > 0) {
      return { error: userErrors[0].message };
    }
    if (!gqlJson.data?.metafieldsSet?.metafields?.length) {
      return { error: "Metafields were not created — check server logs." };
    }

    return { success: true };
  }

  return { error: "Unknown action" };
};

/* ═══════════════════════════════════════════════
   Visual Components
   ═══════════════════════════════════════════════ */

/** SVG-based stars with fractional fill support */
function Stars({
  rating,
  size = 18,
  id = "stars",
}: {
  rating: number;
  size?: number;
  id?: string;
}) {
  return (
    <span style={{ display: "inline-flex", gap: "2px", verticalAlign: "middle" }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.min(1, Math.max(0, rating - (i - 1)));
        return (
          <svg
            key={i}
            width={size}
            height={size}
            viewBox="0 0 20 20"
            style={{ display: "block" }}
          >
            <defs>
              <linearGradient id={`sg-${id}-${i}`}>
                <stop offset={`${fill * 100}%`} stopColor="#FFB800" />
                <stop offset={`${fill * 100}%`} stopColor="#E0E0E0" />
              </linearGradient>
            </defs>
            <path
              d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7 6 11.21l-4-3.9 5.53-.8L10 1.5z"
              fill={`url(#sg-${id}-${i})`}
            />
          </svg>
        );
      })}
    </span>
  );
}

/** Interactive star picker */
function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hovered, setHovered] = useState(0);

  return (
    <span
      style={{ display: "inline-flex", gap: "4px", cursor: "pointer" }}
      onMouseLeave={() => setHovered(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= (hovered || value);
        return (
          <span
            key={star}
            role="button"
            tabIndex={0}
            onMouseEnter={() => setHovered(star)}
            onClick={() => onChange(star)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onChange(star);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              background: active ? "#FFF8E1" : "#f6f6f7",
              border: active ? "1.5px solid #FFB800" : "1.5px solid transparent",
              transition: "all 0.15s ease",
              fontSize: "20px",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20">
              <path
                d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7 6 11.21l-4-3.9 5.53-.8L10 1.5z"
                fill={active ? "#FFB800" : "#CBCBCB"}
                style={{ transition: "fill 0.15s ease" }}
              />
            </svg>
          </span>
        );
      })}
    </span>
  );
}

/** Compact stat pill */
function StatPill({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        background: "#fff",
        borderRadius: "12px",
        padding: "16px 20px",
        border: "1px solid #e3e3e3",
        flex: "1 1 0",
        minWidth: "140px",
      }}
    >
      <span
        style={{
          fontSize: "18px",
          width: "36px",
          height: "36px",
          borderRadius: "8px",
          background: "#f6f6f7",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <div>
        <div
          style={{
            fontSize: "22px",
            fontWeight: 650,
            color: "#1a1a1a",
            lineHeight: 1.2,
            letterSpacing: "-0.01em",
          }}
        >
          {value}
        </div>
        <div style={{ fontSize: "12px", color: "#8c9196", marginTop: "1px" }}>
          {label}
        </div>
      </div>
    </div>
  );
}

/** Product rating card */
function ProductCard({
  product,
  selectedRating,
  onSelectRating,
  onSubmit,
  isSubmitting,
}: {
  product: ProductNode;
  selectedRating: number;
  onSelectRating: (v: number) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  const avgRating = product.avgRating
    ? parseFloat(product.avgRating.value)
    : 0;
  const ratingCount = product.ratingCount
    ? parseInt(product.ratingCount.value, 10)
    : 0;

  const hasRatings = ratingCount > 0;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "12px",
        border: "1px solid #e3e3e3",
        overflow: "hidden",
        transition: "box-shadow 0.2s ease",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "20px",
          padding: "20px 24px",
          alignItems: "flex-start",
        }}
      >
        {/* Product thumbnail */}
        <div
          style={{
            width: "60px",
            height: "60px",
            borderRadius: "10px",
            overflow: "hidden",
            flexShrink: 0,
            background: "#f6f6f7",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {product.featuredImage ? (
            <img
              src={product.featuredImage.url}
              alt={product.featuredImage.altText || product.title}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <span style={{ fontSize: "24px", color: "#c1c1c1" }}>📦</span>
          )}
        </div>

        {/* Product info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: "15px",
              color: "#1a1a1a",
              marginBottom: "8px",
              lineHeight: 1.3,
            }}
          >
            {product.title}
          </div>

          {hasRatings ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <Stars
                rating={avgRating}
                size={18}
                id={`prod-${product.id.split("/").pop()}`}
              />
              <span
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "#1a1a1a",
                }}
              >
                {avgRating.toFixed(1)}
              </span>
              <span
                style={{
                  fontSize: "13px",
                  color: "#8c9196",
                }}
              >
                {ratingCount} {ratingCount === 1 ? "review" : "reviews"}
              </span>
            </div>
          ) : (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px",
                borderRadius: "6px",
                background: "#f6f6f7",
                fontSize: "12px",
                color: "#8c9196",
                fontWeight: 500,
              }}
            >
              <span>—</span> No ratings yet
            </div>
          )}
        </div>
      </div>

      {/* Rating action bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          padding: "14px 24px",
          background: "#fafafa",
          borderTop: "1px solid #f0f0f0",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "#6d7175",
            whiteSpace: "nowrap",
          }}
        >
          Reset rating:
        </span>
        <StarPicker value={selectedRating} onChange={onSelectRating} />
        <s-button
          variant="primary"
          onClick={onSubmit}
          {...(isSubmitting ? { loading: true } : {})}
          {...(selectedRating === 0 || isSubmitting ? { disabled: true } : {})}
        >
          Reset Rating
        </s-button>
      </div>
    </div>
  );
}

/** Empty state when no products exist */
function EmptyState({ onPickProduct }: { onPickProduct: () => void }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "60px 24px",
        background: "#fff",
        borderRadius: "12px",
        border: "1px solid #e3e3e3",
      }}
    >
      <div style={{ fontSize: "48px", marginBottom: "16px" }}>📦</div>
      <div
        style={{
          fontSize: "17px",
          fontWeight: 600,
          color: "#1a1a1a",
          marginBottom: "8px",
        }}
      >
        No products found
      </div>
      <div
        style={{
          fontSize: "14px",
          color: "#6d7175",
          marginBottom: "24px",
          maxWidth: "360px",
          marginLeft: "auto",
          marginRight: "auto",
          lineHeight: 1.5,
        }}
      >
        Create some products in your Shopify store, then come back here to manage
        their ratings.
      </div>
      <s-button variant="primary" onClick={onPickProduct}>
        Browse Products
      </s-button>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════ */

export default function RatingsPage() {
  const { products, totalReviews, overallAverage } =
    useLoaderData<LoaderData>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [selectedRatings, setSelectedRatings] = useState<
    Record<string, number>
  >({});
  const [submittingProductId, setSubmittingProductId] = useState<string | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");

  const isSubmitting =
    fetcher.state === "submitting" || fetcher.state === "loading";

  useEffect(() => {
    if (!isSubmitting) setSubmittingProductId(null);
  }, [isSubmitting]);

  useEffect(() => {
    if (fetcher.data && "success" in fetcher.data && fetcher.data.success) {
      shopify.toast.show("Rating updated successfully");
    }
    if (fetcher.data && "error" in fetcher.data && fetcher.data.error) {
      shopify.toast.show(String(fetcher.data.error), { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handlePickProduct = useCallback(async () => {
    const selected = await shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: false,
    });
    if (selected && selected.length > 0) {
      shopify.toast.show("Product selected — set a rating and save.");
    }
  }, [shopify]);

  const handleSetRating = (productId: string, rating: number) => {
    setSelectedRatings((prev) => ({ ...prev, [productId]: rating }));
  };

  const handleSubmitRating = (productId: string) => {
    const rating = selectedRatings[productId];
    if (!rating) return;
    setSubmittingProductId(productId);
    fetcher.submit(
      { _action: "updateRating", productId, newRating: String(rating) },
      { method: "POST" },
    );
  };

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase();
    return products.filter((p) => p.title.toLowerCase().includes(q));
  }, [products, searchQuery]);

  const ratedCount = products.filter(
    (p) => p.ratingCount && parseInt(p.ratingCount.value, 10) > 0,
  ).length;

  return (
    <s-page heading="Product Ratings">
      <s-button slot="primary-action" onClick={handlePickProduct}>
        Pick a product
      </s-button>

      {/* ── Summary Stats ── */}
      <s-section>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <StatPill
            icon="📦"
            label="Total products"
            value={String(products.length)}
          />
          <StatPill
            icon="⭐"
            label="Rated products"
            value={`${ratedCount}/${products.length}`}
          />
          <StatPill
            icon="📊"
            label="Overall average"
            value={overallAverage > 0 ? overallAverage.toFixed(1) : "—"}
          />
          <StatPill
            icon="💬"
            label="Total reviews"
            value={String(totalReviews)}
          />
        </div>
      </s-section>

      {/* ── Search ── */}
      {products.length > 0 && (
        <s-section>
          <div style={{ maxWidth: "400px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid #d4d4d4",
                background: "#fff",
                transition: "border-color 0.15s",
              }}
            >
              <span style={{ color: "#8c9196", fontSize: "16px" }}>🔍</span>
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  border: "none",
                  outline: "none",
                  fontSize: "14px",
                  flex: 1,
                  background: "transparent",
                  color: "#1a1a1a",
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  style={{
                    border: "none",
                    background: "#e3e3e3",
                    borderRadius: "50%",
                    width: "20px",
                    height: "20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    fontSize: "12px",
                    color: "#6d7175",
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </s-section>
      )}

      {/* ── Product List ── */}
      <s-section heading={searchQuery ? `Results for "${searchQuery}"` : "All Products"}>
        {products.length === 0 ? (
          <EmptyState onPickProduct={handlePickProduct} />
        ) : filteredProducts.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 24px",
              background: "#fff",
              borderRadius: "12px",
              border: "1px solid #e3e3e3",
            }}
          >
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>🔍</div>
            <div
              style={{
                fontSize: "15px",
                fontWeight: 600,
                color: "#1a1a1a",
                marginBottom: "6px",
              }}
            >
              No products match "{searchQuery}"
            </div>
            <div style={{ fontSize: "13px", color: "#8c9196" }}>
              Try a different search term
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                selectedRating={selectedRatings[product.id] || 0}
                onSelectRating={(v) => handleSetRating(product.id, v)}
                onSubmit={() => handleSubmitRating(product.id)}
                isSubmitting={
                  isSubmitting && submittingProductId === product.id
                }
              />
            ))}
          </div>
        )}
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
