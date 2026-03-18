/**
 * Test Variant Import - Phase B.9
 *
 * Purpose: Test the fixed Shopify import service to verify:
 * 1. All variants are imported (not just first)
 * 2. option1/option2/option3 fields are populated
 * 3. Weight data is captured
 * 4. Cost data is captured
 * 5. product_options table is populated
 *
 * Usage: DATABASE_URL=postgresql://... node_modules/.bin/tsx scripts/test-variant-import.ts
 */

import { ShopifyImportService } from '../server/services/shopify-import.service';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
});

async function main() {
  await client.connect();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE B.9: VARIANT IMPORT TEST');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Step 1: Get baseline counts
  console.log('📊 STEP 1: Getting baseline statistics...\n');

  const beforeStats = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM products) as products,
      (SELECT COUNT(*) FROM product_variants) as variants,
      (SELECT COUNT(*) FROM product_options) as options
  `);

  console.log('BEFORE Import:');
  console.log(`   Products: ${beforeStats.rows[0].products}`);
  console.log(`   Variants: ${beforeStats.rows[0].variants}`);
  console.log(`   Options: ${beforeStats.rows[0].options}\n`);

  // Step 2: Import a single product from Shopify
  console.log('🔄 STEP 2: Importing a test product from Shopify...\n');

  const importService = new ShopifyImportService();

  try {
    // Import products for testing (imports in batches of 50)
    const result = await importService.importAllProducts();

    console.log('\n✅ Import completed!');
    console.log(`   Imported: ${result.progress.imported}`);
    console.log(`   Skipped: ${result.progress.skipped}`);
    console.log(`   Failed: ${result.progress.failed}\n`);

    if (result.errors.length > 0) {
      console.error('⚠️  Errors during import:');
      result.errors.forEach(err => {
        console.error(`   - ${err.productId}: ${err.error}`);
      });
      console.log('');
    }

  } catch (error: any) {
    console.error('❌ Import failed:', error.message);
    await client.end();
    process.exit(1);
  }

  // Step 3: Get new counts
  console.log('📊 STEP 3: Checking results...\n');

  const afterStats = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM products) as products,
      (SELECT COUNT(*) FROM product_variants) as variants,
      (SELECT COUNT(*) FROM product_options) as options
  `);

  console.log('AFTER Import:');
  console.log(`   Products: ${afterStats.rows[0].products} (+${afterStats.rows[0].products - beforeStats.rows[0].products})`);
  console.log(`   Variants: ${afterStats.rows[0].variants} (+${afterStats.rows[0].variants - beforeStats.rows[0].variants})`);
  console.log(`   Options: ${afterStats.rows[0].options} (+${afterStats.rows[0].options - beforeStats.rows[0].options})\n`);

  // Step 4: Analyze the most recently imported product
  console.log('🔍 STEP 4: Analyzing imported product details...\n');

  const productAnalysis = await client.query(`
    SELECT
      p.id,
      p.title,
      p.vendor,
      p.shopify_product_id,
      COUNT(pv.id) as variant_count,
      COUNT(po.id) as option_count
    FROM products p
    LEFT JOIN product_variants pv ON p.id = pv.product_id
    LEFT JOIN product_options po ON p.id = po.product_id
    WHERE p.created_at >= NOW() - INTERVAL '5 minutes'
    GROUP BY p.id, p.title, p.vendor, p.shopify_product_id
    ORDER BY p.created_at DESC
    LIMIT 1;
  `);

  if (productAnalysis.rows.length === 0) {
    console.log('⚠️  No products imported in the last 5 minutes\n');
    await client.end();
    return;
  }

  const product = productAnalysis.rows[0];
  console.log(`Product: ${product.title}`);
  console.log(`Vendor: ${product.vendor}`);
  console.log(`Shopify ID: ${product.shopify_product_id}`);
  console.log(`Variants: ${product.variant_count}`);
  console.log(`Options: ${product.option_count}\n`);

  // Step 5: Check variant details
  console.log('🔍 STEP 5: Checking variant details...\n');

  const variantDetails = await client.query(`
    SELECT
      title,
      sku,
      barcode,
      price,
      cost,
      weight,
      weight_unit,
      option1,
      option2,
      option3,
      inventory_quantity
    FROM product_variants
    WHERE product_id = $1
    ORDER BY created_at
    LIMIT 10;
  `, [product.id]);

  console.log(`Found ${variantDetails.rows.length} variants:\n`);

  variantDetails.rows.forEach((v, i) => {
    console.log(`Variant ${i + 1}: ${v.title}`);
    console.log(`   SKU: ${v.sku || 'N/A'}`);
    console.log(`   Barcode: ${v.barcode || 'N/A'}`);
    console.log(`   Price: $${v.price}`);
    console.log(`   Cost: ${v.cost ? '$' + v.cost : 'N/A'}`);
    console.log(`   Weight: ${v.weight ? v.weight + ' ' + v.weight_unit : 'N/A'}`);
    console.log(`   Option1: ${v.option1 || 'NULL'}`);
    console.log(`   Option2: ${v.option2 || 'NULL'}`);
    console.log(`   Option3: ${v.option3 || 'NULL'}`);
    console.log(`   Inventory: ${v.inventory_quantity}`);
    console.log('');
  });

  // Step 6: Check product options
  console.log('🔍 STEP 6: Checking product options...\n');

  const optionDetails = await client.query(`
    SELECT
      name,
      position,
      values
    FROM product_options
    WHERE product_id = $1
    ORDER BY position;
  `, [product.id]);

  if (optionDetails.rows.length > 0) {
    console.log(`Found ${optionDetails.rows.length} product options:\n`);

    optionDetails.rows.forEach((o, i) => {
      console.log(`Option ${o.position}: ${o.name}`);
      console.log(`   Values: ${o.values.join(', ')}`);
      console.log('');
    });
  } else {
    console.log('⚠️  No product options found!\n');
  }

  // Step 7: Verification Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  VERIFICATION SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  const hasMultipleVariants = product.variant_count > 1;
  const hasOptions = product.option_count > 0;
  const hasOptionValues = variantDetails.rows.some(v => v.option1 || v.option2 || v.option3);
  const hasWeight = variantDetails.rows.some(v => v.weight);
  const hasCost = variantDetails.rows.some(v => v.cost);

  console.log(`✅ Multiple variants imported: ${hasMultipleVariants ? 'YES' : 'NO'} (${product.variant_count} variants)`);
  console.log(`✅ Product options created: ${hasOptions ? 'YES' : 'NO'} (${product.option_count} options)`);
  console.log(`✅ Option values populated: ${hasOptionValues ? 'YES' : 'NO'}`);
  console.log(`✅ Weight data captured: ${hasWeight ? 'YES' : 'NO'}`);
  console.log(`✅ Cost data captured: ${hasCost ? 'YES' : 'NO'}\n`);

  const allPassed = hasMultipleVariants && hasOptions && hasOptionValues;

  if (allPassed) {
    console.log('🎉 ALL CRITICAL TESTS PASSED!\n');
  } else {
    console.log('⚠️  SOME TESTS FAILED - Review the details above\n');
  }

  await client.end();
}

main()
  .then(() => {
    console.log('✅ Test completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
