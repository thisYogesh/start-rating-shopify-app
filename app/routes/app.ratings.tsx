import { useEffect, useState, useCallback } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";

interface ProductNode {
  id: string;
  title: string;
  avgRating: { value: string } | null;
  ratingCount: { value: string } | null;
}

interface LoaderData {
  products: ProductNode[];
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query getProducts {
        products(first: 50) {
          edges {
            node {
              id
              title
              avgRating: metafield(namespace: "$app", key: "avg_rating") {
                value
              }
              ratingCount: metafield(namespace: "$app", key: "rating_count") {
                value
              }
            }
          }
        }
      }
    `,
  );

  const responseJson = await response.json();
  const products =
    responseJson.data?.products?.edges?.map(
      (edge: { node: ProductNode }) => edge.node,
    ) ?? [];

  return { products };
};

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

    const response = await admin.graphql(
      `#graphql
        mutation setProductRating($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
              key
              value
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          metafields: [
            {
              namespace: "$app",
              key: "avg_rating",
              ownerId: productId,
              type: "number_decimal",
              value: newRating.toFixed(1),
            },
            {
              namespace: "$app",
              key: "rating_count",
              ownerId: productId,
              type: "number_integer",
              value: "1",
            },
          ],
        },
      },
    );

    const responseJson = await response.json();
    const userErrors = responseJson.data?.metafieldsSet?.userErrors;

    if (userErrors && userErrors.length > 0) {
      return { error: userErrors[0].message };
    }

    // Also upsert into local DB so it shows in records
    const numericId = productId.replace("gid://shopify/Product/", "");
    await db.rating.upsert({
      where: {
        shop_productId_customerIdentifier: {
          shop: session.shop,
          productId: numericId,
          customerIdentifier: "admin",
        },
      },
      create: {
        shop: session.shop,
        productId: numericId,
        customerIdentifier: "admin",
        rating: newRating,
      },
      update: {
        rating: newRating,
      },
    });

    return { success: true };
  }

  return { error: "Unknown action" };
};

function StarSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hovered, setHovered] = useState(0);

  return (
    <span
      style={{ display: "inline-flex", gap: "2px", cursor: "pointer" }}
      onMouseLeave={() => setHovered(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
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
            fontSize: "24px",
            color: star <= (hovered || value) ? "#FFD700" : "#ccc",
            transition: "color 0.15s",
          }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function renderStars(avg: number) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <span
        key={i}
        style={{
          fontSize: "18px",
          color: i <= Math.round(avg) ? "#FFD700" : "#ccc",
        }}
      >
        ★
      </span>,
    );
  }
  return <span style={{ display: "inline-flex", gap: "1px" }}>{stars}</span>;
}

export default function RatingsPage() {
  const { products } = useLoaderData<LoaderData>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [selectedRatings, setSelectedRatings] = useState<
    Record<string, number>
  >({});

  const isSubmitting =
    fetcher.state === "submitting" || fetcher.state === "loading";

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
      const product = selected[0];
      // Resource picker returns admin GID
      const productId = product.id;
      if (
        !products.find((p: ProductNode) => p.id === productId) &&
        productId
      ) {
        shopify.toast.show(
          "Product selected. Set a rating and submit to save.",
        );
      }
    }
  }, [shopify, products]);

  const handleSetRating = (productId: string, rating: number) => {
    setSelectedRatings((prev) => ({ ...prev, [productId]: rating }));
  };

  const handleSubmitRating = (productId: string) => {
    const rating = selectedRatings[productId];
    if (!rating) return;

    fetcher.submit(
      {
        _action: "updateRating",
        productId,
        newRating: String(rating),
      },
      { method: "POST" },
    );
  };

  return (
    <s-page heading="Product Ratings">
      <s-button slot="primary-action" onClick={handlePickProduct}>
        Pick a product
      </s-button>

      <s-section heading="Products &amp; Ratings">
        {products.length === 0 ? (
          <s-paragraph>
            No products found. Create some products in your store first.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {products.map((product: ProductNode) => {
              const avgRating = product.avgRating
                ? parseFloat(product.avgRating.value)
                : 0;
              const ratingCount = product.ratingCount
                ? parseInt(product.ratingCount.value, 10)
                : 0;
              const selectedRating = selectedRatings[product.id] || 0;

              return (
                <s-box
                  key={product.id}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                >
                  <s-stack direction="block" gap="small-200">
                    <s-stack direction="inline" gap="base" alignItems="center">
                      <s-text type="strong">{product.title}</s-text>
                      <span>
                        {renderStars(avgRating)}{" "}
                        <s-text>
                          {avgRating > 0
                            ? `${avgRating.toFixed(1)} (${ratingCount} ${ratingCount === 1 ? "rating" : "ratings"})`
                            : "No ratings yet"}
                        </s-text>
                      </span>
                    </s-stack>

                    <s-stack direction="inline" gap="base" alignItems="center">
                      <s-text>Set rating:</s-text>
                      <StarSelector
                        value={selectedRating}
                        onChange={(v) => handleSetRating(product.id, v)}
                      />
                      <s-button
                        variant="primary"
                        onClick={() => handleSubmitRating(product.id)}
                        {...(isSubmitting ? { loading: true } : {})}
                        {...(selectedRating === 0 ? { disabled: true } : {})}
                      >
                        Save
                      </s-button>
                    </s-stack>
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
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
