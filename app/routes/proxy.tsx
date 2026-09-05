import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.public.appProxy(request);

  if (!session || !admin) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }

  try {
    const formData = await request.formData();
    const productId = formData.get("productId") as string;
    const ratingStr = formData.get("rating") as string;
    const customerIdentifier = formData.get("customerIdentifier") as string;

    if (!productId || !ratingStr) {
      return new Response(
        JSON.stringify({ error: "Missing productId or rating" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    const rating = parseInt(ratingStr, 10);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      return new Response(
        JSON.stringify({ error: "Rating must be an integer between 1 and 5" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    if (!customerIdentifier) {
      return new Response(
        JSON.stringify({
          error:
            "A customer identifier (email or customer ID) is required to submit a rating",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    const shop = session.shop;

    // Upsert the rating (create or update for the same customer+product)
    await db.rating.upsert({
      where: {
        shop_productId_customerIdentifier: {
          shop,
          productId,
          customerIdentifier,
        },
      },
      create: {
        shop,
        productId,
        customerIdentifier,
        rating,
      },
      update: {
        rating,
      },
    });

    // Recalculate aggregate for this product
    const ratings = await db.rating.findMany({
      where: { shop, productId },
      select: { rating: true },
    });

    const count = ratings.length;
    const average =
      count > 0
        ? ratings.reduce((sum, r) => sum + r.rating, 0) / count
        : 0;

    // Update product metafields via Admin GraphQL
    const ownerId = `gid://shopify/Product/${productId}`;
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
              ownerId,
              type: "number_decimal",
              value: average.toFixed(1),
            },
            {
              namespace: "$app",
              key: "rating_count",
              ownerId,
              type: "number_integer",
              value: String(count),
            },
          ],
        },
      },
    );

    const responseJson = await response.json();
    const userErrors = responseJson.data?.metafieldsSet?.userErrors;

    if (userErrors && userErrors.length > 0) {
      console.error("metafieldsSet errors:", userErrors);
      return new Response(
        JSON.stringify({ error: "Failed to update product rating" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        average: parseFloat(average.toFixed(1)),
        count,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error) {
    console.error("Proxy action error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
};
