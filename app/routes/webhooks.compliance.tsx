import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} compliance webhook for ${shop}`);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST": {
      // Log what data we store for the customer
      const customerEmail =
        (payload as { customer?: { email?: string } })?.customer?.email ?? "";
      const customerId = String(
        (payload as { customer?: { id?: number } })?.customer?.id ?? "",
      );

      const ratings = await db.rating.findMany({
        where: {
          shop,
          OR: [
            { customerIdentifier: customerEmail },
            { customerIdentifier: customerId },
          ],
        },
        select: {
          productId: true,
          rating: true,
          createdAt: true,
          updatedAt: true,
        },
      });

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

      await db.rating.deleteMany({
        where: {
          shop,
          OR: [
            { customerIdentifier: customerEmail },
            { customerIdentifier: customerId },
          ],
        },
      });

      console.log(
        `Deleted customer data for ${customerEmail || customerId} in shop ${shop}`,
      );
      break;
    }

    case "SHOP_REDACT": {
      // Delete ALL rating records for this shop
      await db.rating.deleteMany({
        where: { shop },
      });

      console.log(`Deleted all rating data for shop ${shop}`);
      break;
    }

    default:
      console.log(`Unhandled compliance topic: ${topic}`);
  }

  return new Response();
};
