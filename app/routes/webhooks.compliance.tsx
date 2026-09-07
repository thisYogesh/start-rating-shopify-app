import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getDb } from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} compliance webhook for ${shop}`);

  const db = getDb();

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST": {
      // Log what data we store for the customer
      const customerEmail =
        (payload as { customer?: { email?: string } })?.customer?.email ?? "";
      const customerId = String(
        (payload as { customer?: { id?: number } })?.customer?.id ?? "",
      );

      const { results: ratings } = await db
        .prepare(
          'SELECT "productId", "rating", "createdAt", "updatedAt" FROM "Rating" WHERE "shop" = ? AND ("customerIdentifier" = ? OR "customerIdentifier" = ?)',
        )
        .bind(shop, customerEmail, customerId)
        .all();

      console.log(
        `Customer data request for ${shop}: found ${ratings.length} rating(s) for customer ${customerEmail || customerId}`,
      );
      // In production, you'd send this data to the merchant
      break;
    }

    case "CUSTOMERS_REDACT": {
      // Delete all rating records for this customer
      const customerEmail =
        (payload as { customer?: { email?: string } })?.customer?.email ?? "";
      const customerId = String(
        (payload as { customer?: { id?: number } })?.customer?.id ?? "",
      );

      await db
        .prepare(
          'DELETE FROM "Rating" WHERE "shop" = ? AND ("customerIdentifier" = ? OR "customerIdentifier" = ?)',
        )
        .bind(shop, customerEmail, customerId)
        .run();

      console.log(
        `Deleted customer data for ${customerEmail || customerId} in shop ${shop}`,
      );
      break;
    }

    case "SHOP_REDACT": {
      // Delete ALL rating records for this shop
      await db
        .prepare('DELETE FROM "Rating" WHERE "shop" = ?')
        .bind(shop)
        .run();

      console.log(`Deleted all rating data for shop ${shop}`);
      break;
    }

    default:
      console.log(`Unhandled compliance topic: ${topic}`);
  }

  return new Response();
};
