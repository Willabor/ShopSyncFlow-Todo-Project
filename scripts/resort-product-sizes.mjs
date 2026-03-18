/**
 * Re-sort Size Options for Existing Products
 *
 * This script updates the Size option values for products to follow
 * the new predefined size order.
 *
 * Usage:
 *   node scripts/resort-product-sizes.mjs [productId]
 *
 * Examples:
 *   node scripts/resort-product-sizes.mjs                                    # Re-sort all products
 *   node scripts/resort-product-sizes.mjs 55e349ec-3ad4-4650-a1c6-5ed02c9c7e53  # Re-sort specific product
 */

import { db } from '../server/db.js';
import { productOptions } from '../shared/schema.js';
import { eq } from 'drizzle-orm';
import { sortSizes } from '../server/qb-import-helpers.js';

const PRODUCT_ID = process.argv[2]; // Optional: specific product ID

async function resortProductSizes() {
  console.log('🔄 Re-sorting Product Size Options\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Get all Size options (optionally filtered by product ID)
    let query = db
      .select()
      .from(productOptions)
      .where(eq(productOptions.name, 'Size'));

    if (PRODUCT_ID) {
      console.log(`📦 Processing product: ${PRODUCT_ID}\n`);
      query = db
        .select()
        .from(productOptions)
        .where(eq(productOptions.productId, PRODUCT_ID))
        .where(eq(productOptions.name, 'Size'));
    } else {
      console.log('📦 Processing all products with Size options\n');
    }

    const sizeOptions = await query;

    if (sizeOptions.length === 0) {
      console.log('⚠️  No Size options found.');
      process.exit(0);
    }

    console.log(`Found ${sizeOptions.length} Size option(s) to process\n`);

    let updatedCount = 0;
    let unchangedCount = 0;

    for (const option of sizeOptions) {
      const originalValues = [...option.values];
      const sortedValues = sortSizes([...option.values]);

      // Check if order changed
      const hasChanged = JSON.stringify(originalValues) !== JSON.stringify(sortedValues);

      if (hasChanged) {
        console.log(`📝 Product ID: ${option.productId}`);
        console.log(`   Original:  [${originalValues.join(', ')}]`);
        console.log(`   Sorted:    [${sortedValues.join(', ')}]`);

        // Update the option
        await db
          .update(productOptions)
          .set({
            values: sortedValues,
            updatedAt: new Date()
          })
          .where(eq(productOptions.id, option.id));

        console.log(`   ✅ Updated\n`);
        updatedCount++;
      } else {
        console.log(`✓ Product ID: ${option.productId} - Already sorted correctly`);
        unchangedCount++;
      }
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\n📊 Summary:`);
    console.log(`   Total processed: ${sizeOptions.length}`);
    console.log(`   Updated:         ${updatedCount}`);
    console.log(`   Already sorted:  ${unchangedCount}`);
    console.log('\n✅ Re-sorting complete!\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error re-sorting sizes:');
    console.error(error);
    process.exit(1);
  }
}

resortProductSizes();
