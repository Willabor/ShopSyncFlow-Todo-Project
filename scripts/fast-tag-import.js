/**
 * FAST Tag Import - Updates ONLY tags, skips everything else
 * Expected time: 1-2 minutes for 5,481 products
 */

import { config } from 'dotenv';
import { db } from '../server/db.js';
import { products } from '../shared/schema.js';
import { eq } from 'drizzle-orm';

config();

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function fetchProductTags() {
  console.log('Fetching all product tags from Shopify...');

  let allProducts = [];
  let cursor = null;
  let page = 0;

  while (true) {
    page++;
    const query = `
      query($cursor: String) {
        products(first: 250, after: $cursor) {
          edges {
            node {
              id
              tags
            }
            cursor
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `;

    const response = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
      },
      body: JSON.stringify({ query, variables: { cursor } }),
    });

    const result = await response.json();
    const edges = result.data.products.edges;

    allProducts.push(...edges.map(e => ({
      gid: e.node.id,
      id: e.node.id.split('/').pop(),
      tags: e.node.tags.join(', ')
    })));

    console.log(`Fetched page ${page}: ${allProducts.length} products total`);

    if (!result.data.products.pageInfo.hasNextPage) break;
    cursor = edges[edges.length - 1].cursor;

    // Rate limit: 2 requests per second
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n✅ Fetched ${allProducts.length} products with tags from Shopify\n`);
  return allProducts;
}

async function updateTags(productList) {
  console.log('Updating tags in database...');

  let updated = 0;
  let skipped = 0;

  for (const product of productList) {
    try {
      const result = await db
        .update(products)
        .set({
          tags: product.tags,
          updatedAt: new Date()
        })
        .where(eq(products.shopifyProductId, product.id));

      if (result.rowCount > 0) {
        updated++;
      } else {
        skipped++;
      }

      if ((updated + skipped) % 100 === 0) {
        console.log(`Progress: ${updated + skipped}/${productList.length} (${updated} updated, ${skipped} skipped)`);
      }
    } catch (error) {
      console.error(`Error updating product ${product.id}:`, error.message);
    }
  }

  console.log(`\n✅ Complete: ${updated} products updated, ${skipped} skipped\n`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('FAST TAG IMPORT - Updates ONLY tags');
  console.log('='.repeat(60));
  console.log();

  const startTime = Date.now();

  const productTags = await fetchProductTags();
  await updateTags(productTags);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Total time: ${elapsed} seconds`);

  // Verify
  const result = await db.execute(
    `SELECT COUNT(*) FILTER (WHERE tags IS NOT NULL AND tags <> '') as with_tags,
            COUNT(*) as total
     FROM products`
  );

  console.log(`\nVerification:`);
  console.log(`  Products with tags: ${result.rows[0].with_tags}`);
  console.log(`  Total products: ${result.rows[0].total}`);
}

main().catch(console.error).finally(() => process.exit());
