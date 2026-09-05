import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <s-page heading="Star Rating App">
      <s-section heading="Welcome to Star Rating">
        <s-paragraph>
          This app lets your customers rate products with a 5-star system.
          Ratings are stored on product metafields for fast storefront rendering
          and can be managed from the admin.
        </s-paragraph>
      </s-section>

      <s-section heading="How it works">
        <s-stack direction="block" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-heading>⭐ Theme App Extension Blocks</s-heading>
              <s-paragraph>
                Two blocks are included for your Online Store 2.0 theme:
              </s-paragraph>
              <s-unordered-list>
                <s-list-item>
                  <s-text type="strong">Star Rating Display</s-text> — Shows
                  the average rating and review count on any product page or
                  collection listing.
                </s-list-item>
                <s-list-item>
                  <s-text type="strong">Star Rating Form</s-text> — An
                  interactive form on the product page where customers can submit
                  their rating.
                </s-list-item>
              </s-unordered-list>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-heading>📊 Admin Management</s-heading>
              <s-paragraph>
                Visit the{" "}
                <s-link href="/app/ratings">Ratings</s-link> page to view and
                manage product ratings. You can override ratings directly from
                the admin.
              </s-paragraph>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-heading>🔧 Setup</s-heading>
              <s-unordered-list>
                <s-list-item>
                  Go to your theme editor (Online Store &gt; Customize).
                </s-list-item>
                <s-list-item>
                  Add the &ldquo;Star Rating Display&rdquo; block to show ratings.
                </s-list-item>
                <s-list-item>
                  Add the &ldquo;Star Rating Form&rdquo; block on product pages
                  to collect ratings.
                </s-list-item>
              </s-unordered-list>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Quick Links">
        <s-unordered-list>
          <s-list-item>
            <s-link href="/app/ratings">Manage Ratings</s-link>
          </s-list-item>
          <s-list-item>
            <s-link
              href="https://shopify.dev/docs/apps/build/online-store/theme-app-extensions"
              target="_blank"
            >
              Theme Extensions Docs
            </s-link>
          </s-list-item>
        </s-unordered-list>
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
