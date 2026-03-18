/**
 * Data Recovery Migration: Extract Variants from Metadata
 *
 * Purpose: Recover the 75-90% of variant data sitting in products.metadata
 *
 * What this does:
 * 1. Query all products with metadata.variants arrays
 * 2. For each product, extract variant data from metadata.variants
 * 3. Create entries in product_variants table
 * 4. Skip variants that already exist (by SKU)
 * 5. Provide detailed statistics and examples
 *
 * Run with: DATABASE_URL=postgresql://... node_modules/.bin/tsx scripts/recover-variants-from-metadata.ts
 */

import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is required');
  console.error('   Usage: DATABASE_URL=postgresql://user:pass@host:port/db node_modules/.bin/tsx scripts/recover-variants-from-metadata.ts');
  process.exit(1);
}

console.log('🚀 Starting Variant Data Recovery Migration\n');
console.log('📊 Database:', DATABASE_URL.split('@')[1]); // Hide credentials
console.log('');

const client = new pg.Client({
  connectionString: DATABASE_URL,
});

interface ProductWithMetadata {
  id: string;
  title: string;
  vendor: string;
  metadata: {
    variants?: Array<{
      id: string;
      title: string;
      sku: string;
      price: string;
      compareAtPrice?: string;
      inventoryQuantity: number;
      barcode?: string;
    }>;
  };
}

async function main() {
  await client.connect();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  VARIANT DATA RECOVERY MIGRATION');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Step 1: Get baseline statistics
  console.log('📊 STEP 1: Getting baseline statistics...\n');

  const baselineResult = await client.query(`
    SELECT
      COUNT(DISTINCT product_id) as products_with_variants,
      COUNT(*) as total_variants
    FROM product_variants;
  `);

  const baselineProducts = parseInt(baselineResult.rows[0].products_with_variants);
  const baselineVariants = parseInt(baselineResult.rows[0].total_variants);

  console.log(`Current State BEFORE Migration:`);
  console.log(`   Products with Variants: ${baselineProducts.toLocaleString()}`);
  console.log(`   Total Variants: ${baselineVariants.toLocaleString()}`);
  console.log('');

  // Step 2: Find products with multiple variants in metadata
  console.log('🔍 STEP 2: Finding products with variant data in metadata...\n');

  const productsResult = await client.query(`
    SELECT id, title, vendor, metadata
    FROM products
    WHERE metadata IS NOT NULL
      AND metadata->'variants' IS NOT NULL
      AND jsonb_array_length(metadata->'variants') > 0;
  `);

  const products: ProductWithMetadata[] = productsResult.rows;
  console.log(`✅ Found ${products.length.toLocaleString()} products with variant data in metadata\n`);

  let totalVariantsCreated = 0;
  let totalVariantsSkipped = 0;
  let productsWithMultipleVariants = 0;
  let productsProcessed = 0;
  let errors = 0;

  // Step 3: Process each product
  console.log('🔄 STEP 3: Processing products and creating variants...\n');

  for (const product of products) {
    try {
      const metadataVariants = product.metadata.variants || [];

      if (metadataVariants.length === 0) continue;

      productsProcessed++;

      // Count products with multiple variants
      if (metadataVariants.length > 1) {
        productsWithMultipleVariants++;
      }

      // Show first 5 examples with multiple variants
      if (productsWithMultipleVariants <= 5 && metadataVariants.length > 1) {
        console.log(`📦 Product ${productsWithMultipleVariants}: ${product.title}`);
        console.log(`   Vendor: ${product.vendor}`);
        console.log(`   Variants in metadata: ${metadataVariants.length}`);
      }

      // Create variants for this product
      for (const variantData of metadataVariants) {
        // Skip if no SKU
        if (!variantData.sku) {
          totalVariantsSkipped++;
          continue;
        }

        // Check if variant already exists (by product_id AND SKU)
        const existingVariant = await client.query(
          'SELECT id FROM product_variants WHERE product_id = $1 AND sku = $2',
          [product.id, variantData.sku]
        );

        if (existingVariant.rows.length > 0) {
          // Variant already exists, skip
          totalVariantsSkipped++;
          continue;
        }

        // Construct variant title (use metadata title or "Default Title")
        const variantTitle = variantData.title || "Default Title";

        // Create variant
        await client.query(`
          INSERT INTO product_variants (
            id,
            product_id,
            shopify_variant_id,
            title,
            sku,
            price,
            compare_at_price,
            inventory_quantity,
            barcode,
            created_at,
            updated_at
          ) VALUES (
            gen_random_uuid(),
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            NOW(),
            NOW()
          )
        `, [
          product.id,
          variantData.id || null,
          variantTitle,
          variantData.sku,
          variantData.price || '0.00', // Keep as string, not parseFloat
          variantData.compareAtPrice || null, // Keep as string
          variantData.inventoryQuantity || 0,
          variantData.barcode || null,
        ]);

        totalVariantsCreated++;

        // Show first 5 variant examples
        if (productsWithMultipleVariants <= 5 && metadataVariants.length > 1) {
          const isLast = metadataVariants.indexOf(variantData) === metadataVariants.length - 1;
          const prefix = isLast ? '   └─' : '   ├─';
          console.log(`${prefix} Variant: ${variantData.title || variantData.sku}`);
          console.log(`      SKU: ${variantData.sku}`);
          console.log(`      Price: $${variantData.price || '0.00'}`);
          console.log(`      Inventory: ${variantData.inventoryQuantity || 0}`);
        }
      }

      if (productsWithMultipleVariants <= 5 && metadataVariants.length > 1) {
        console.log('');
      }

      // Log progress every 500 products
      if (productsProcessed % 500 === 0) {
        console.log(`   ✓ Processed ${productsProcessed.toLocaleString()} products... (Created ${totalVariantsCreated.toLocaleString()} variants)`);
      }

    } catch (error) {
      console.error(`❌ Error processing product ${product.id} (${product.title}):`, error);
      errors++;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  MIGRATION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Get new statistics
  const newStatsResult = await client.query(`
    SELECT
      COUNT(DISTINCT product_id) as products_with_variants,
      COUNT(*) as total_variants
    FROM product_variants;
  `);

  const newProducts = parseInt(newStatsResult.rows[0].products_with_variants);
  const newVariants = parseInt(newStatsResult.rows[0].total_variants);

  console.log('📊 Summary Statistics:');
  console.log('─────────────────────────────────────────────────────────');
  console.log(`   Products Processed:           ${productsProcessed.toLocaleString()}`);
  console.log(`   Products with >1 Variant:     ${productsWithMultipleVariants.toLocaleString()}`);
  console.log(`   ✅ New Variants Created:       ${totalVariantsCreated.toLocaleString()}`);
  console.log(`   ⏭️  Variants Skipped (exists): ${totalVariantsSkipped.toLocaleString()}`);
  console.log(`   ❌ Errors:                     ${errors}`);
  console.log('─────────────────────────────────────────────────────────');
  console.log(`   BEFORE: ${baselineVariants.toLocaleString()} variants across ${baselineProducts.toLocaleString()} products`);
  console.log(`   AFTER:  ${newVariants.toLocaleString()} variants across ${newProducts.toLocaleString()} products`);
  console.log(`   GAINED: +${(newVariants - baselineVariants).toLocaleString()} variants (+${(newProducts - baselineProducts).toLocaleString()} products)`);
  console.log('─────────────────────────────────────────────────────────\n');

  // Verification
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════\n');

  const verificationResult = await client.query(`
    SELECT
      COUNT(DISTINCT product_id) as products_with_variants,
      COUNT(*) as total_variants,
      ROUND(AVG(variant_count)::numeric, 2) as avg_variants_per_product
    FROM (
      SELECT product_id, COUNT(*) as variant_count
      FROM product_variants
      GROUP BY product_id
    ) subquery;
  `);

  console.log('✅ Verification Results:');
  console.log(`   Products with Variants: ${verificationResult.rows[0].products_with_variants}`);
  console.log(`   Total Variants: ${verificationResult.rows[0].total_variants}`);
  console.log(`   Avg Variants per Product: ${verificationResult.rows[0].avg_variants_per_product}\n`);

  // Show examples of products with most variants
  const examplesResult = await client.query(`
    SELECT
      p.title,
      p.vendor,
      COUNT(pv.id) as variant_count
    FROM products p
    LEFT JOIN product_variants pv ON p.id = pv.product_id
    GROUP BY p.id, p.title, p.vendor
    HAVING COUNT(pv.id) > 1
    ORDER BY COUNT(pv.id) DESC
    LIMIT 10;
  `);

  console.log('📋 Top 10 Products with Most Variants:');
  console.log('─────────────────────────────────────────────────────────');
  examplesResult.rows.forEach((p, i) => {
    console.log(`${i + 1}. ${p.title}`);
    console.log(`   Vendor: ${p.vendor}`);
    console.log(`   Variants: ${p.variant_count}`);
    console.log('');
  });

  // Check for products that still need work
  const needsWorkResult = await client.query(`
    SELECT COUNT(*) as count
    FROM products
    WHERE metadata->'variants' IS NOT NULL
      AND jsonb_array_length(metadata->'variants') > 1
      AND id NOT IN (
        SELECT DISTINCT product_id
        FROM product_variants
        GROUP BY product_id
        HAVING COUNT(*) > 1
      );
  `);

  const needsWork = parseInt(needsWorkResult.rows[0].count);

  if (needsWork > 0) {
    console.log('⚠️  Products Still Needing Variant Recovery:');
    console.log(`   ${needsWork.toLocaleString()} products have multiple variants in metadata but only 1 in database\n`);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ✅ DATA RECOVERY SUCCESSFUL');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('📝 Next Steps:');
  console.log('   1. Fix Shopify import service GraphQL query (Phase B.7)');
  console.log('   2. Fix Shopify import service logic (Phase B.8)');
  console.log('   3. Test with real Shopify imports (Phase B.9)');
  console.log('   4. Update Product Edit UI to display variants (Phase B.11)\n');

  await client.end();
}

// Run migration
main()
  .then(() => {
    console.log('✅ Script completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
