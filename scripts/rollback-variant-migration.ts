/**
 * Rollback Script: Undo Variant System Migration
 *
 * This script rolls back the variant system migration by:
 * 1. Deleting all records from product_variants table
 * 2. Deleting all records from product_options table
 * 3. (Optional) Restoring metadata.sizes from variants
 *
 * ⚠️  WARNING: This will DELETE ALL variant data!
 * ⚠️  Make sure you have a database backup before running this script.
 *
 * Usage:
 *   cd /volume1/docker/ShopSyncFlow-Todo-Project
 *   DATABASE_URL=postgresql://... npx tsx scripts/rollback-variant-migration.ts
 *
 * Options:
 *   --dry-run : Show what would be deleted without actually deleting
 *   --restore-metadata : Restore metadata.sizes from variants (experimental)
 */

import { db } from "../server/db";
import { products, productOptions, productVariants } from "../shared/schema";
import { eq } from "drizzle-orm";

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const restoreMetadata = args.includes("--restore-metadata");

async function rollbackVariantMigration() {
  console.log("================================================================");
  console.log("⚠️  ROLLBACK: Variant System Migration");
  console.log("================================================================\n");

  if (isDryRun) {
    console.log("🔍 DRY RUN MODE: No data will be deleted\n");
  } else {
    console.log("⚠️  DANGER: This will DELETE ALL variant data!");
    console.log("⚠️  Make sure you have a database backup!");
    console.log("⚠️  Press Ctrl+C now to cancel...\n");

    // Wait 5 seconds for user to cancel
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log("⏳ Proceeding with rollback...\n");
  }

  try {
    // Step 1: Count records before deletion
    console.log("📊 Current State:");
    const variantCount = await db.select().from(productVariants).then(rows => rows.length);
    const optionCount = await db.select().from(productOptions).then(rows => rows.length);
    const productCount = await db.select().from(products).then(rows => rows.length);

    console.log(`   Products: ${productCount}`);
    console.log(`   Variants: ${variantCount}`);
    console.log(`   Options: ${optionCount}\n`);

    if (variantCount === 0 && optionCount === 0) {
      console.log("ℹ️  No variant data to rollback. Database is clean.");
      return;
    }

    // Step 2: (Optional) Restore metadata.sizes from variants
    if (restoreMetadata && !isDryRun) {
      console.log("🔄 Restoring metadata.sizes from variants...");

      // Find products with multiple variants (multi-variant products)
      const multiVariantProducts = await db
        .select({
          productId: productVariants.productId,
        })
        .from(productVariants)
        .groupBy(productVariants.productId)
        .having(({ count }) => count > 1);

      console.log(`   Found ${multiVariantProducts.length} multi-variant products`);

      // For each multi-variant product, restore sizes to metadata
      for (const { productId } of multiVariantProducts) {
        // Get all variants for this product
        const variants = await db
          .select()
          .from(productVariants)
          .where(eq(productVariants.productId, productId));

        // Extract option1 values (sizes)
        const sizes = variants
          .map(v => v.option1)
          .filter(Boolean) as string[];

        if (sizes.length > 0) {
          // Get current product data
          const [product] = await db
            .select()
            .from(products)
            .where(eq(products.id, productId));

          if (product) {
            // Update metadata with sizes
            const updatedMetadata = {
              ...(product.metadata as object || {}),
              sizes,
            };

            await db
              .update(products)
              .set({ metadata: updatedMetadata })
              .where(eq(products.id, productId));

            console.log(`      ✓ Restored ${sizes.length} sizes for product ${productId}`);
          }
        }
      }

      console.log(`   ✅ Metadata restored for ${multiVariantProducts.length} products\n`);
    } else if (restoreMetadata && isDryRun) {
      console.log("🔍 Would restore metadata.sizes (dry run mode)\n");
    }

    // Step 3: Delete variants
    console.log("🗑️  Deleting product variants...");
    if (!isDryRun) {
      await db.delete(productVariants);
      console.log(`   ✅ Deleted ${variantCount} variants\n`);
    } else {
      console.log(`   🔍 Would delete ${variantCount} variants\n`);
    }

    // Step 4: Delete options
    console.log("🗑️  Deleting product options...");
    if (!isDryRun) {
      await db.delete(productOptions);
      console.log(`   ✅ Deleted ${optionCount} options\n`);
    } else {
      console.log(`   🔍 Would delete ${optionCount} options\n`);
    }

    // Step 5: Verify deletion
    if (!isDryRun) {
      console.log("✅ Verifying rollback...");
      const remainingVariants = await db.select().from(productVariants).then(rows => rows.length);
      const remainingOptions = await db.select().from(productOptions).then(rows => rows.length);

      if (remainingVariants === 0 && remainingOptions === 0) {
        console.log("   ✅ All variant data deleted successfully\n");
      } else {
        console.error(`   ❌ ERROR: ${remainingVariants} variants and ${remainingOptions} options remain`);
        throw new Error("Rollback incomplete");
      }
    }

    // Step 6: Summary
    console.log("================================================================");
    if (isDryRun) {
      console.log("🔍 DRY RUN COMPLETE - No data was deleted");
    } else {
      console.log("✅ ROLLBACK COMPLETE");
    }
    console.log("================================================================\n");

    if (!isDryRun) {
      console.log("📊 Final State:");
      console.log(`   Products: ${productCount} (unchanged)`);
      console.log(`   Variants: 0 (deleted)`);
      console.log(`   Options: 0 (deleted)\n`);

      if (restoreMetadata) {
        console.log("ℹ️  Metadata restored: metadata.sizes fields updated for multi-variant products\n");
      }

      console.log("💡 Next Steps:");
      console.log("   1. Verify database state");
      console.log("   2. Re-run migration if needed: npm run migrate-variants");
      console.log("   3. Restore from backup if something went wrong\n");
    } else {
      console.log("💡 To actually perform rollback:");
      console.log("   Run without --dry-run flag\n");
      console.log("💡 To restore metadata.sizes:");
      console.log("   Add --restore-metadata flag\n");
    }

    process.exit(0);

  } catch (error) {
    console.error("\n❌ Rollback failed!");
    console.error(error);
    console.error("\n⚠️  Database may be in inconsistent state!");
    console.error("⚠️  Restore from backup immediately!");
    process.exit(1);
  }
}

// Display usage if --help flag
if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Rollback Variant System Migration

Usage:
  npx tsx scripts/rollback-variant-migration.ts [options]

Options:
  --dry-run           Show what would be deleted without deleting
  --restore-metadata  Restore metadata.sizes from variants before deleting
  --help, -h          Show this help message

Examples:
  # See what would be deleted (safe)
  npx tsx scripts/rollback-variant-migration.ts --dry-run

  # Rollback and restore metadata
  npx tsx scripts/rollback-variant-migration.ts --restore-metadata

  # Rollback without restoring metadata
  npx tsx scripts/rollback-variant-migration.ts

⚠️  WARNING: Always backup your database before running this script!
`);
  process.exit(0);
}

// Run rollback
console.log("Starting rollback at:", new Date().toISOString());
rollbackVariantMigration()
  .then(() => {
    console.log("Rollback finished at:", new Date().toISOString());
  })
  .catch((error) => {
    console.error("Rollback error:", error);
    process.exit(1);
  });
