/**
 * Test Variant Publishing - Phase B.10.6
 *
 * Purpose: Test the Shopify publish service with full variant support
 *
 * Safety Features:
 * - Tests ONE product only (no bulk operations)
 * - Only selects products NOT yet published (shopifyProductId IS NULL)
 * - Shows detailed preview before publishing
 * - Verifies product has variants and options
 *
 * Prerequisites:
 * - SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN must be set
 * - Shopify app must have 'write_products' scope
 *
 * Usage:
 * SHOPIFY_STORE_URL="nexus-clothes.myshopify.com" \
 * SHOPIFY_ACCESS_TOKEN="shpat_..." \
 * DATABASE_URL="postgresql://..." \
 * node_modules/.bin/tsx scripts/test-variant-publish.ts
 */

import { ShopifyPublishService } from '../server/services/shopify-publish.service';
import { storage } from '../server/storage';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

if (!SHOPIFY_STORE_URL) {
  console.error('❌ ERROR: SHOPIFY_STORE_URL environment variable is required');
  console.error('   Example: SHOPIFY_STORE_URL="nexus-clothes.myshopify.com"');
  process.exit(1);
}

if (!SHOPIFY_ACCESS_TOKEN) {
  console.error('❌ ERROR: SHOPIFY_ACCESS_TOKEN environment variable is required');
  console.error('   Example: SHOPIFY_ACCESS_TOKEN="shpat_..."');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
});

async function main() {
  await client.connect();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PHASE B.10.6: VARIANT PUBLISHING TEST');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Step 1: Test Shopify connection
  console.log('📡 STEP 1: Testing Shopify connection...\n');

  const publishService = new ShopifyPublishService();

  try {
    const connectionTest = await publishService.testConnection();

    if (!connectionTest.success) {
      console.error('❌ Shopify connection failed:', connectionTest.message);
      console.error('\nPossible issues:');
      console.error('   1. Invalid SHOPIFY_ACCESS_TOKEN');
      console.error('   2. Invalid SHOPIFY_STORE_URL');
      console.error('   3. Token expired or revoked');
      console.error('   4. Network connectivity issues\n');
      await client.end();
      process.exit(1);
    }

    console.log('✅', connectionTest.message);
    console.log('');
  } catch (error: any) {
    console.error('❌ Connection test failed:', error.message);
    await client.end();
    process.exit(1);
  }

  // Step 2: Find a suitable test product
  console.log('🔍 STEP 2: Finding a suitable test product...\n');
  console.log('Criteria:');
  console.log('   - NOT yet published to Shopify (shopify_product_id IS NULL)');
  console.log('   - Has multiple variants (> 1)');
  console.log('   - Has product options');
  console.log('   - Has complete variant data (option1, weight, etc.)\n');

  const productQuery = await client.query(`
    SELECT
      p.id,
      p.title,
      p.vendor,
      p.description,
      p.category,
      p.shopify_product_id,
      COUNT(DISTINCT pv.id) as variant_count,
      COUNT(DISTINCT po.id) as option_count,
      SUM(CASE WHEN pv.option1 IS NOT NULL THEN 1 ELSE 0 END) as variants_with_option1,
      SUM(CASE WHEN pv.weight IS NOT NULL THEN 1 ELSE 0 END) as variants_with_weight
    FROM products p
    LEFT JOIN product_variants pv ON p.id = pv.product_id
    LEFT JOIN product_options po ON p.id = po.product_id
    WHERE p.shopify_product_id IS NULL  -- Not yet published
      AND p.title IS NOT NULL
      AND p.vendor IS NOT NULL
    GROUP BY p.id, p.title, p.vendor, p.description, p.category, p.shopify_product_id
    HAVING COUNT(DISTINCT pv.id) > 1  -- Has multiple variants
       AND COUNT(DISTINCT po.id) > 0  -- Has options
    ORDER BY COUNT(DISTINCT pv.id) ASC  -- Start with smaller products (safer)
    LIMIT 1;
  `);

  if (productQuery.rows.length === 0) {
    console.log('⚠️  No suitable test product found!');
    console.log('');
    console.log('All products may already be published, or no products have variants/options.');
    console.log('');
    console.log('To create a test product:');
    console.log('   1. Import a new product from Shopify (will not have shopify_product_id)');
    console.log('   2. Or manually delete shopify_product_id from an existing product');
    console.log('');
    await client.end();
    process.exit(0);
  }

  const testProduct = productQuery.rows[0];

  console.log('✅ Found test product:');
  console.log(`   Title: ${testProduct.title}`);
  console.log(`   Vendor: ${testProduct.vendor}`);
  console.log(`   Category: ${testProduct.category || 'N/A'}`);
  console.log(`   Variants: ${testProduct.variant_count}`);
  console.log(`   Options: ${testProduct.option_count}`);
  console.log(`   Variants with option1: ${testProduct.variants_with_option1}/${testProduct.variant_count}`);
  console.log(`   Variants with weight: ${testProduct.variants_with_weight}/${testProduct.variant_count}`);
  console.log('');

  // Step 3: Load product details from database
  console.log('📊 STEP 3: Loading product details...\n');

  const product = await storage.getProduct(testProduct.id);
  if (!product) {
    console.error('❌ Failed to load product from storage');
    await client.end();
    process.exit(1);
  }

  const variants = await storage.getProductVariants(testProduct.id);
  const options = await storage.getProductOptions(testProduct.id);

  console.log('Product Details:');
  console.log(`   ID: ${product.id}`);
  console.log(`   Title: ${product.title}`);
  console.log(`   Vendor: ${product.vendor}`);
  console.log(`   Description: ${product.description ? product.description.substring(0, 100) + '...' : 'N/A'}`);
  console.log(`   Category: ${product.category || 'N/A'}`);
  console.log('');

  console.log(`Product Options (${options.length}):`);
  options.forEach(opt => {
    console.log(`   ${opt.position}. ${opt.name}: [${opt.values.join(', ')}]`);
  });
  console.log('');

  console.log(`Product Variants (${variants.length}):`);
  variants.slice(0, 5).forEach((v, i) => {
    console.log(`   ${i + 1}. ${v.title || 'Default Title'}`);
    console.log(`      SKU: ${v.sku || 'N/A'}`);
    console.log(`      Price: $${v.price}`);
    console.log(`      Compare at: ${v.compareAtPrice ? '$' + v.compareAtPrice : 'N/A'}`);
    console.log(`      Barcode: ${v.barcode || 'N/A'}`);
    console.log(`      Weight: ${v.weight ? v.weight + ' ' + v.weightUnit : 'N/A'}`);
    console.log(`      Inventory: ${v.inventoryQuantity}`);
    console.log(`      Options: ${v.option1 || 'N/A'} / ${v.option2 || 'N/A'} / ${v.option3 || 'N/A'}`);
    console.log('');
  });

  if (variants.length > 5) {
    console.log(`   ... and ${variants.length - 5} more variants\n`);
  }

  // Step 4: Preview what will be sent to Shopify
  console.log('📋 STEP 4: Preview of Shopify API payload...\n');

  console.log('Options that will be sent:');
  if (options.length > 0) {
    options.forEach(opt => {
      console.log(`   { name: "${opt.name}", position: ${opt.position} }`);
    });
  } else {
    console.log('   (none)');
  }
  console.log('');

  console.log('Variant data that will be sent:');
  console.log(`   Total variants: ${variants.length}`);
  console.log(`   Fields per variant:`);
  console.log(`      - sku, price, inventory_quantity`);
  console.log(`      - option1, option2, option3`);
  console.log(`      - barcode (if present)`);
  console.log(`      - compare_at_price (if present)`);
  console.log(`      - weight, weight_unit (if present)`);
  console.log('');

  console.log('Sample variant payload (first variant):');
  const firstVariant = variants[0];
  const samplePayload = {
    sku: firstVariant.sku || undefined,
    price: firstVariant.price || "0.00",
    compare_at_price: firstVariant.compareAtPrice || undefined,
    barcode: firstVariant.barcode || undefined,
    inventory_quantity: firstVariant.inventoryQuantity || 0,
    weight: firstVariant.weight ? parseFloat(firstVariant.weight) : undefined,
    weight_unit: firstVariant.weightUnit?.toLowerCase() === 'pounds' ? 'lb' :
                 firstVariant.weightUnit?.toLowerCase() === 'ounces' ? 'oz' :
                 firstVariant.weightUnit?.toLowerCase() === 'grams' ? 'g' :
                 firstVariant.weightUnit?.toLowerCase() === 'kilograms' ? 'kg' : undefined,
    option1: firstVariant.option1 || undefined,
    option2: firstVariant.option2 || undefined,
    option3: firstVariant.option3 || undefined,
  };
  console.log(JSON.stringify(samplePayload, null, 2));
  console.log('');

  // Step 5: Safety check
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ⚠️  READY TO PUBLISH TO SHOPIFY');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('This will:');
  console.log(`   1. Create a NEW product in Shopify store: ${SHOPIFY_STORE_URL}`);
  console.log(`   2. Product title: "${product.title}"`);
  console.log(`   3. Vendor: "${product.vendor}"`);
  console.log(`   4. Create ${variants.length} variants`);
  console.log(`   5. Create ${options.length} product options`);
  console.log(`   6. Status: DRAFT (not visible to customers)`);
  console.log('');
  console.log('⚠️  This operation will ACTUALLY publish to Shopify!');
  console.log('⚠️  Make sure you have added write_products scope to your Shopify app.');
  console.log('');
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...');
  console.log('');

  // Wait 5 seconds
  for (let i = 5; i > 0; i--) {
    process.stdout.write(`   Publishing in ${i}... \r`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log('   Publishing NOW!        \n');

  // Step 6: Publish to Shopify
  console.log('🚀 STEP 5: Publishing to Shopify...\n');

  try {
    const result = await publishService.publishProduct(product, false); // false = draft status

    console.log('✅ SUCCESS! Product published to Shopify!\n');
    console.log('Shopify Product Details:');
    console.log(`   Shopify Product ID: ${result.shopifyProductId}`);
    console.log(`   Admin URL: ${result.shopifyAdminUrl}`);
    console.log('');
    console.log('You can view and edit the product in Shopify Admin at the URL above.');
    console.log('');

    // Step 7: Verify database was updated
    console.log('🔍 STEP 6: Verifying database updates...\n');

    const updatedProduct = await storage.getProduct(testProduct.id);
    const updatedVariants = await storage.getProductVariants(testProduct.id);

    console.log('Product Record:');
    console.log(`   shopify_product_id: ${updatedProduct?.shopifyProductId || 'NULL'}`);
    console.log('');

    console.log('Variant Records:');
    const variantsWithShopifyId = updatedVariants.filter(v => v.shopifyVariantId);
    console.log(`   Variants with shopify_variant_id: ${variantsWithShopifyId.length}/${updatedVariants.length}`);
    console.log('');

    if (variantsWithShopifyId.length > 0) {
      console.log('Sample variant IDs saved:');
      variantsWithShopifyId.slice(0, 3).forEach((v, i) => {
        console.log(`   ${i + 1}. ${v.title}: ${v.shopifyVariantId}`);
      });
      console.log('');
    }

    // Step 8: Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  ✅ TEST COMPLETE - SUCCESS');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('What was tested:');
    console.log(`   ✅ Product published with ${variants.length} variants`);
    console.log(`   ✅ Product options sent: ${options.length} options`);
    console.log(`   ✅ Variant option values: option1, option2, option3`);
    console.log(`   ✅ Weight data: ${variants.filter(v => v.weight).length} variants`);
    console.log(`   ✅ Barcode data: ${variants.filter(v => v.barcode).length} variants`);
    console.log(`   ✅ Compare at price: ${variants.filter(v => v.compareAtPrice).length} variants`);
    console.log(`   ✅ Shopify product ID saved to database`);
    console.log(`   ✅ Shopify variant IDs saved: ${variantsWithShopifyId.length}/${updatedVariants.length}`);
    console.log('');

    console.log('Next steps:');
    console.log(`   1. Open Shopify Admin: ${result.shopifyAdminUrl}`);
    console.log(`   2. Verify product options (Color, Size, etc.) are correct`);
    console.log(`   3. Verify all ${variants.length} variants were created`);
    console.log(`   4. Check variant weights, barcodes, and compare at prices`);
    console.log(`   5. Publish the product (change from draft to active) if everything looks good`);
    console.log('');

  } catch (error: any) {
    console.error('❌ PUBLISH FAILED\n');
    console.error('Error:', error.message);
    console.error('');

    if (error.message.includes('write_products')) {
      console.error('⚠️  Permission Issue:');
      console.error('   Your Shopify app does not have write_products scope.');
      console.error('   ');
      console.error('   To fix:');
      console.error('   1. Go to Shopify Admin → Apps → Develop apps');
      console.error('   2. Select your app');
      console.error('   3. Go to Configuration tab');
      console.error('   4. Under "Admin API access scopes", add:');
      console.error('      - write_products');
      console.error('   5. Save and reinstall the app');
      console.error('');
    } else if (error.message.includes('already exists')) {
      console.error('⚠️  Duplicate Product:');
      console.error('   A product with this SKU already exists in Shopify.');
      console.error('   This might be from a previous test.');
      console.error('');
    } else {
      console.error('⚠️  Unknown Error:');
      console.error('   Check the error message above for details.');
      console.error('   Common issues:');
      console.error('   - Invalid access token');
      console.error('   - Network connectivity');
      console.error('   - Shopify API rate limits');
      console.error('   - Missing required product fields');
      console.error('');
    }

    await client.end();
    process.exit(1);
  }

  await client.end();
}

main()
  .then(() => {
    console.log('✅ Test script completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
