/**
 * Prepare Test Product for Publishing
 *
 * This script finds a suitable multi-variant product and temporarily
 * clears its shopify_product_id so we can test the publish functionality.
 */

import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://shopsyncflow_user:ShopSyncSecurePass2025@localhost:5433/shopsyncflow_db';

const client = new pg.Client({ connectionString: DATABASE_URL });

async function main() {
  await client.connect();

  console.log('Finding suitable product for testing...\n');

  // Find a small multi-variant product
  const result = await client.query(`
    SELECT
      p.id,
      p.title,
      p.vendor,
      p.shopify_product_id,
      COUNT(DISTINCT pv.id) as variant_count,
      COUNT(DISTINCT po.id) as option_count
    FROM products p
    LEFT JOIN product_variants pv ON p.id = pv.product_id
    LEFT JOIN product_options po ON p.id = po.product_id
    WHERE p.shopify_product_id IS NOT NULL
    GROUP BY p.id, p.title, p.vendor, p.shopify_product_id
    HAVING COUNT(DISTINCT pv.id) BETWEEN 2 AND 10  -- Small product for safe testing
       AND COUNT(DISTINCT po.id) > 0  -- Has options
    ORDER BY COUNT(DISTINCT pv.id) ASC
    LIMIT 1;
  `);

  if (result.rows.length === 0) {
    console.log('No suitable products found.');
    await client.end();
    return;
  }

  const product = result.rows[0];

  console.log('Selected product:');
  console.log(`  Title: ${product.title}`);
  console.log(`  Vendor: ${product.vendor}`);
  console.log(`  Variants: ${product.variant_count}`);
  console.log(`  Options: ${product.option_count}`);
  console.log(`  Current Shopify ID: ${product.shopify_product_id}`);
  console.log('');

  // Save the original shopify_product_id
  console.log(`Saving original Shopify ID to backup...`);
  await client.query(`
    UPDATE products
    SET description = CONCAT(
      COALESCE(description, ''),
      E'\n\n<!-- BACKUP_SHOPIFY_ID: ',
      shopify_product_id,
      ' -->'
    )
    WHERE id = $1
  `, [product.id]);

  // Clear shopify_product_id
  console.log(`Clearing shopify_product_id for testing...`);
  await client.query(`
    UPDATE products
    SET shopify_product_id = NULL
    WHERE id = $1
  `, [product.id]);

  // Also clear variant shopify_variant_ids
  console.log(`Clearing variant shopify_variant_ids for testing...`);
  await client.query(`
    UPDATE product_variants
    SET shopify_variant_id = NULL
    WHERE product_id = $1
  `, [product.id]);

  console.log('');
  console.log('✅ Product prepared for testing!');
  console.log('');
  console.log('You can now run the test script:');
  console.log('  DATABASE_URL="..." node_modules/.bin/tsx --env-file=.env scripts/test-variant-publish.ts');
  console.log('');
  console.log('To restore the original Shopify ID after testing:');
  console.log(`  UPDATE products SET shopify_product_id = '${product.shopify_product_id}' WHERE id = '${product.id}';`);
  console.log('');

  await client.end();
}

main().catch(console.error);
