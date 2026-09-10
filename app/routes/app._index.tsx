import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useRouteError, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getDb } from "../db.server";
import {
  METAFIELD_NAMESPACE,
  ensureMetafieldDefinitions,
} from "../metafields.server";

interface DashboardStats {
  totalProducts: number;
  ratedProducts: number;
  totalReviews: number;
  averageRating: number;
  recentRatings: { productTitle: string; rating: number; date: string }[];
  ratingDistribution: number[];
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  await ensureMetafieldDefinitions(admin);

  // Fetch products with their metafield ratings
  const response = await admin.graphql(
    `#graphql
      query getDashboardProducts($ns: String!) {
        products(first: 100) {
          edges {
            node {
              id
              title
              avgRating: metafield(namespace: $ns, key: "avg_rating") { value }
              ratingCount: metafield(namespace: $ns, key: "rating_count") { value }
            }
          }
        }
      }
    `,
    { variables: { ns: METAFIELD_NAMESPACE } },
  );

  const responseJson = await response.json();
  const products =
    responseJson.data?.products?.edges?.map((e: any) => e.node) ?? [];

  const totalProducts = products.length;
  const ratedProducts = products.filter(
    (p: any) => p.ratingCount && parseInt(p.ratingCount.value, 10) > 0,
  ).length;
  const totalReviews = products.reduce(
    (sum: number, p: any) =>
      sum + (p.ratingCount ? parseInt(p.ratingCount.value, 10) : 0),
    0,
  );
  const ratedWithAvg = products.filter(
    (p: any) => p.avgRating && parseFloat(p.avgRating.value) > 0,
  );
  const averageRating =
    ratedWithAvg.length > 0
      ? ratedWithAvg.reduce(
          (sum: number, p: any) => sum + parseFloat(p.avgRating.value),
          0,
        ) / ratedWithAvg.length
      : 0;

  // Fetch rating distribution from D1
  const db = getDb();
  const distribution = [0, 0, 0, 0, 0]; // index 0 = 1 star, index 4 = 5 stars
  try {
    const { results } = await db
      .prepare(
        `SELECT "rating", COUNT(*) as count FROM "Rating" WHERE "shop" = ? GROUP BY "rating"`,
      )
      .bind(session.shop)
      .all<{ rating: number; count: number }>();
    for (const row of results) {
      if (row.rating >= 1 && row.rating <= 5) {
        distribution[row.rating - 1] = row.count;
      }
    }
  } catch {
    // D1 may not have data yet
  }

  // Fetch recent ratings from D1
  let recentRatings: DashboardStats["recentRatings"] = [];
  try {
    const { results } = await db
      .prepare(
        `SELECT "productId", "rating", "createdAt" FROM "Rating" WHERE "shop" = ? ORDER BY "createdAt" DESC LIMIT 5`,
      )
      .bind(session.shop)
      .all<{ productId: string; rating: number; createdAt: string }>();
    recentRatings = results.map((r) => {
      const product = products.find(
        (p: any) =>
          p.id === `gid://shopify/Product/${r.productId}` ||
          p.id.endsWith(`/${r.productId}`),
      );
      return {
        productTitle: product?.title ?? `Product #${r.productId}`,
        rating: r.rating,
        date: r.createdAt,
      };
    });
  } catch {
    // D1 may not have data yet
  }

  return {
    stats: {
      totalProducts,
      ratedProducts,
      totalReviews,
      averageRating,
      recentRatings,
      ratingDistribution: distribution,
    } satisfies DashboardStats,
  };
};

/* ─── Visual sub-components ─── */

function StatCard({
  icon,
  label,
  value,
  sublabel,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  sublabel?: string;
  accent: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "12px",
        padding: "20px 24px",
        border: "1px solid #e3e3e3",
        flex: "1 1 0",
        minWidth: "160px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "3px",
          background: accent,
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "12px",
        }}
      >
        <span
          style={{
            fontSize: "20px",
            width: "36px",
            height: "36px",
            borderRadius: "8px",
            background: `${accent}15`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </span>
        <span
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "#6d7175",
            letterSpacing: "0.02em",
            textTransform: "uppercase" as const,
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: "32px",
          fontWeight: 650,
          color: "#1a1a1a",
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      {sublabel && (
        <div
          style={{
            fontSize: "13px",
            color: "#8c9196",
            marginTop: "4px",
          }}
        >
          {sublabel}
        </div>
      )}
    </div>
  );
}

function MiniStars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <span style={{ display: "inline-flex", gap: "1px" }}>
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
              <linearGradient id={`starGrad-home-${i}`}>
                <stop offset={`${fill * 100}%`} stopColor="#FFB800" />
                <stop offset={`${fill * 100}%`} stopColor="#E0E0E0" />
              </linearGradient>
            </defs>
            <path
              d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.26 5.06 16.7 6 11.21l-4-3.9 5.53-.8L10 1.5z"
              fill={`url(#starGrad-home-${i})`}
            />
          </svg>
        );
      })}
    </span>
  );
}

function RatingDistribution({ distribution }: { distribution: number[] }) {
  const total = distribution.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "24px 0",
          color: "#8c9196",
          fontSize: "14px",
        }}
      >
        No ratings data yet
      </div>
    );
  }

  const colors = ["#E74C3C", "#E67E22", "#F1C40F", "#9ACD32", "#2ECC71"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {[5, 4, 3, 2, 1].map((star) => {
        const count = distribution[star - 1];
        const pct = total > 0 ? (count / total) * 100 : 0;
        return (
          <div
            key={star}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "13px",
            }}
          >
            <span
              style={{
                width: "20px",
                textAlign: "right",
                fontWeight: 600,
                color: "#444",
              }}
            >
              {star}
            </span>
            <span style={{ fontSize: "12px", color: "#FFB800" }}>★</span>
            <div
              style={{
                flex: 1,
                height: "10px",
                background: "#f0f0f0",
                borderRadius: "5px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: colors[star - 1],
                  borderRadius: "5px",
                  transition: "width 0.6s ease",
                }}
              />
            </div>
            <span
              style={{
                width: "40px",
                textAlign: "right",
                color: "#6d7175",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SetupStep({
  number,
  title,
  description,
  done,
}: {
  number: number;
  title: string;
  description: string;
  done?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "16px",
        alignItems: "flex-start",
        padding: "16px 0",
      }}
    >
      <div
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          background: done ? "#1a8d1a" : "#5C6AC4",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: "14px",
          flexShrink: 0,
        }}
      >
        {done ? "✓" : number}
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: "14px",
            color: "#1a1a1a",
            marginBottom: "4px",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: "13px", color: "#6d7175", lineHeight: 1.5 }}>
          {description}
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "12px",
        padding: "24px",
        border: "1px solid #e3e3e3",
        flex: "1 1 280px",
        transition: "box-shadow 0.2s, border-color 0.2s",
      }}
    >
      <div style={{ fontSize: "28px", marginBottom: "12px" }}>{icon}</div>
      <div
        style={{
          fontWeight: 650,
          fontSize: "15px",
          color: "#1a1a1a",
          marginBottom: "8px",
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: "13px", color: "#6d7175", lineHeight: 1.6 }}>
        {description}
      </div>
    </div>
  );
}

function RecentActivity({
  ratings,
}: {
  ratings: DashboardStats["recentRatings"];
}) {
  if (ratings.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "24px 0",
          color: "#8c9196",
          fontSize: "14px",
        }}
      >
        No recent activity
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      {ratings.map((r, idx) => (
        <div
          key={idx}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 0",
            borderBottom: idx < ratings.length - 1 ? "1px solid #f0f0f0" : "none",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 500,
                color: "#1a1a1a",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {r.productTitle}
            </div>
            <div style={{ fontSize: "12px", color: "#8c9196", marginTop: "2px" }}>
              {formatRelativeDate(r.date)}
            </div>
          </div>
          <div style={{ marginLeft: "12px", flexShrink: 0 }}>
            <MiniStars rating={r.rating} size={14} />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRelativeDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

/* ─── Main page ─── */

export default function Index() {
  const { stats } = useLoaderData<{ stats: DashboardStats }>();

  return (
    <s-page heading="Star Rating">
      <s-button slot="primary-action" href="/app/ratings" variant="primary">
        Manage Ratings
      </s-button>

      {/* ── Stats Cards ── */}
      <s-section>
        <div
          style={{
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <StatCard
            icon="📦"
            label="Products"
            value={String(stats.totalProducts)}
            sublabel={`${stats.ratedProducts} with ratings`}
            accent="#5C6AC4"
          />
          <StatCard
            icon="⭐"
            label="Avg Rating"
            value={stats.averageRating > 0 ? stats.averageRating.toFixed(1) : "—"}
            sublabel={
              stats.averageRating > 0 ? (
                undefined
              ) : (
                "No ratings yet"
              )
            }
            accent="#FFB800"
          />
          <StatCard
            icon="💬"
            label="Total Reviews"
            value={String(stats.totalReviews)}
            sublabel={
              stats.totalReviews > 0
                ? `Across ${stats.ratedProducts} products`
                : "Start collecting reviews"
            }
            accent="#50B83C"
          />
        </div>
      </s-section>

      {/* ── Two Column: Distribution + Activity ── */}
      <s-section>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
          }}
        >
          {/* Rating Distribution */}
          <div
            style={{
              background: "#fff",
              borderRadius: "12px",
              border: "1px solid #e3e3e3",
              padding: "24px",
            }}
          >
            <div
              style={{
                fontWeight: 650,
                fontSize: "15px",
                color: "#1a1a1a",
                marginBottom: "20px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>📊</span> Rating Distribution
            </div>
            <RatingDistribution distribution={stats.ratingDistribution} />
          </div>

          {/* Recent Activity */}
          <div
            style={{
              background: "#fff",
              borderRadius: "12px",
              border: "1px solid #e3e3e3",
              padding: "24px",
            }}
          >
            <div
              style={{
                fontWeight: 650,
                fontSize: "15px",
                color: "#1a1a1a",
                marginBottom: "20px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span>🕐</span> Recent Activity
            </div>
            <RecentActivity ratings={stats.recentRatings} />
          </div>
        </div>
      </s-section>

      {/* ── Features ── */}
      <s-section heading="What's Included">
        <div
          style={{
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <FeatureCard
            icon="⭐"
            title="Star Rating Display"
            description="Shows the average star rating and total review count on product pages and collection grids. Supports Online Store 2.0 themes."
          />
          <FeatureCard
            icon="📝"
            title="Rating Submission Form"
            description="An interactive form on product pages where customers submit their 1–5 star rating. Ratings sync instantly to product metafields."
          />
          <FeatureCard
            icon="🛠️"
            title="Admin Management"
            description="View, override, and manage ratings for any product directly from Shopify admin. Full control over your store's ratings."
          />
        </div>
      </s-section>

      {/* ── Setup Guide (aside) ── */}
      <s-section slot="aside" heading="Setup Guide">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          <SetupStep
            number={1}
            title="Install the app"
            description="You're already here — nice!"
            done
          />
          <SetupStep
            number={2}
            title="Add display block"
            description='Go to Online Store → Customize → add the "Star Rating Display" block to your product pages.'
            done={stats.ratedProducts > 0}
          />
          <SetupStep
            number={3}
            title="Add submission form"
            description='Add the "Star Rating Form" block so customers can submit ratings on product pages.'
          />
          <SetupStep
            number={4}
            title="Manage ratings"
            description="Visit the Ratings page to view, moderate, and override product ratings from the admin."
          />
        </div>
      </s-section>

      <s-section slot="aside" heading="Resources">
        <s-stack direction="block" gap="small-200">
          <s-link href="/app/ratings">→ Manage Ratings</s-link>
          <s-link
            href="https://shopify.dev/docs/apps/build/online-store/theme-app-extensions"
            target="_blank"
          >
            → Theme Extensions Docs
          </s-link>
          <s-link
            href="https://shopify.dev/docs/api/admin-graphql/latest/mutations/metafieldsSet"
            target="_blank"
          >
            → Metafields API Docs
          </s-link>
        </s-stack>
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
