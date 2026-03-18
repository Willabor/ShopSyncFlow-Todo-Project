/**
 * Shopify Product History Research
 *
 * This file tests what historical data Shopify provides about products,
 * specifically for archived products and status changes.
 */

export async function testShopifyHistoryData() {
  const storeUrl = process.env.SHOPIFY_STORE_URL || "";
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";

  // Test Query 1: Check available product fields
  const query1 = `
    query {
      products(first: 1, query: "status:archived") {
        edges {
          node {
            id
            title
            status

            # Timestamps we already get
            createdAt
            updatedAt
            publishedAt

            # Check if these exist for history
            __typename
          }
        }
      }
    }
  `;

  // Test Query 2: Product Events (if available)
  const query2 = `
    query {
      products(first: 1) {
        edges {
          node {
            id
            title

            # Try to get product events
            events(first: 50) {
              edges {
                node {
                  __typename
                  createdAt
                  message
                  ... on ResourcePublication {
                    __typename
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  // Test Query 3: Publication history
  const query3 = `
    query {
      products(first: 1) {
        edges {
          node {
            id
            title

            # Publication information
            publications(first: 10) {
              edges {
                node {
                  publication {
                    name
                  }
                  publishDate
                }
              }
            }
          }
        }
      }
    }
  `;

  // Test Query 4: Metafields for custom tracking
  const query4 = `
    query {
      products(first: 1, query: "status:archived") {
        edges {
          node {
            id
            title
            status

            # Check metafields that might contain history
            metafields(first: 20) {
              edges {
                node {
                  namespace
                  key
                  value
                  type
                  description
                }
              }
            }
          }
        }
      }
    }
  `;

  console.log("Test queries prepared - use these to explore Shopify API");
  console.log("Query 1: Basic fields with timestamps");
  console.log("Query 2: Product events (if available)");
  console.log("Query 3: Publication history");
  console.log("Query 4: Metafields that might contain custom history");
}

/**
 * What Shopify Provides for Product History:
 *
 * AVAILABLE (what we can get):
 * ✅ createdAt - When product was first created
 * ✅ updatedAt - When product was last modified (any field)
 * ✅ publishedAt - When product was first published
 * ✅ status - Current status (ACTIVE, DRAFT, ARCHIVED)
 * ✅ metafields - Custom fields where YOU can store history
 *
 * NOT AVAILABLE (what Shopify doesn't provide via API):
 * ❌ Status change history (when it became archived, how many times)
 * ❌ Event log / audit trail
 * ❌ Number of times status changed
 * ❌ Previous status values
 * ❌ Who made the changes
 *
 * WORKAROUNDS:
 *
 * 1. Use updatedAt as proxy for "when archived"
 *    - If status = ARCHIVED and updatedAt = recent, probably just archived
 *    - Not perfect but gives you some idea
 *
 * 2. Use metafields to track YOUR OWN history
 *    - When you import, store status change timestamps in metafields
 *    - Example: metafield namespace "history", key "status_changes"
 *    - Value: JSON array of {timestamp, oldStatus, newStatus}
 *
 * 3. Track changes in YOUR database
 *    - Create a product_history table
 *    - On each import, compare current status with previous
 *    - Log status changes with timestamp
 *    - This gives you full history going forward
 *
 * 4. Use Shopify webhooks (best for real-time tracking)
 *    - Listen to products/update webhook
 *    - Track status changes as they happen
 *    - Store in your database
 */
