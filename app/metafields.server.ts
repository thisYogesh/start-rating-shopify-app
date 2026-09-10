/**
 * Metafield namespace and helpers.
 *
 * We use a plain `star_rating` namespace — NOT the TOML `app` reserved
 * namespace — because the TOML auto-prefixes it with `app--<app_id>--`
 * which Liquid's `product.metafields.app.*` shorthand doesn't resolve for
 * product metafields.
 *
 * Instead, metafield definitions are created programmatically via
 * `metafieldDefinitionCreate` so the namespace stays exactly `star_rating`.
 */

/** The namespace used for all product rating metafields. */
export const METAFIELD_NAMESPACE = "star_rating";

/** Metafield keys used by this app. */
export const METAFIELD_KEYS = {
  AVG_RATING: "avg_rating",
  RATING_COUNT: "rating_count",
} as const;

interface AdminClient {
  graphql: (query: string, options?: { variables?: any }) => Promise<Response>;
}

/** Definition configs we ensure exist. */
const DEFINITIONS = [
  {
    namespace: METAFIELD_NAMESPACE,
    key: METAFIELD_KEYS.AVG_RATING,
    name: "Average Star Rating",
    description: "The average star rating for this product",
    type: "number_decimal",
  },
  {
    namespace: METAFIELD_NAMESPACE,
    key: METAFIELD_KEYS.RATING_COUNT,
    name: "Rating Count",
    description: "The total number of ratings for this product",
    type: "number_integer",
  },
];

let definitionsEnsured = false;

/**
 * Ensures metafield definitions exist with storefront `PUBLIC_READ` access.
 * Called once per worker lifetime (idempotent — skips if definitions exist).
 */
export async function ensureMetafieldDefinitions(
  admin: AdminClient,
): Promise<void> {
  if (definitionsEnsured) return;

  // Check which definitions already exist
  const checkResponse = await admin.graphql(
    `#graphql
      query checkMetafieldDefinitions($ns: String!) {
        metafieldDefinitions(
          ownerType: PRODUCT
          first: 10
          namespace: $ns
        ) {
          edges {
            node {
              namespace
              key
              access { storefront }
            }
          }
        }
      }
    `,
    { variables: { ns: METAFIELD_NAMESPACE } },
  );

  const checkJson: any = await checkResponse.json();
  const existing = new Set(
    (checkJson.data?.metafieldDefinitions?.edges ?? []).map(
      (e: any) => `${e.node.namespace}.${e.node.key}`,
    ),
  );

  for (const def of DEFINITIONS) {
    const defKey = `${def.namespace}.${def.key}`;

    if (existing.has(defKey)) {
      console.log(`Metafield definition ${defKey} already exists — skipping`);
      continue;
    }

    console.log(`Creating metafield definition ${defKey}...`);

    const createResponse = await admin.graphql(
      `#graphql
        mutation createMetafieldDefinition($definition: MetafieldDefinitionInput!) {
          metafieldDefinitionCreate(definition: $definition) {
            createdDefinition {
              id
              namespace
              key
              access { storefront }
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
          definition: {
            namespace: def.namespace,
            key: def.key,
            name: def.name,
            description: def.description,
            type: def.type,
            ownerType: "PRODUCT",
            access: {
              storefront: "PUBLIC_READ",
              admin: "MERCHANT_READ_WRITE",
            },
          },
        },
      },
    );

    const createJson: any = await createResponse.json();
    const userErrors =
      createJson.data?.metafieldDefinitionCreate?.userErrors ?? [];

    if (userErrors.length > 0) {
      // "Namespace and key already taken" is fine — another install path created it
      const isTaken = userErrors.some((e: any) =>
        e.message?.includes("already taken"),
      );
      if (!isTaken) {
        console.error(
          `Failed to create metafield definition ${defKey}:`,
          userErrors,
        );
      } else {
        console.log(`Definition ${defKey} already exists (race ok)`);
      }
    } else {
      const created =
        createJson.data?.metafieldDefinitionCreate?.createdDefinition;
      console.log(`Created metafield definition: ${created?.id}`);
    }
  }

  definitionsEnsured = true;
}
