/**
 * Data Migration Script: Convert Products to Variant System
 *
 * This script migrates existing products from the old single-variant structure
 * to the new multi-variant system with product_options and product_variants tables.
 *
 * Strategy:
 * 1. Products with metadata.sizes → Create "Size" option + variant per size
 * 2. Products without sizes → Create single default variant
 *
 * Usage:
 *   cd /volume1/docker/ShopSyncFlow-Todo-Project
 *   npx tsx scripts/migrate-to-variants.ts
 */

import { db } from "../server/db";
import { products, productOptions, productVariants } from "../shared/schema";

async function migrateProductsToVariants() {
  console.log("================================================================");
  console.log("🔄 Starting Product → Variant Migration");
  console.log("================================================================\n");

  try {
    // Step 1: Fetch all products
    console.log("📦 Fetching all products...");
    const allProducts = await db.select().from(products);
    console.log(`   Found ${allProducts.length} products to migrate\n`);

    if (allProducts.length === 0) {
      console.log("⚠️  No products found. Nothing to migrate.");
      return;
    }

    let totalVariantsCreated = 0;
    let totalOptionsCreated = 0;
    let productsWithSizes = 0;
    let productsWithoutSizes = 0;

    // Step 2: Migrate each product
    for (const product of allProducts) {
      console.log(`\n📦 Product: "${product.title}" (${product.id})`);
      console.log(`   Vendor: ${product.vendor}`);
      console.log(`   SKU: ${product.sku || "N/A"}`);
      console.log(`   Price: ${product.price || "N/A"}`);

      // Extract sizes from metadata
      const metadata = product.metadata as any;
      const sizes = metadata?.sizes as string[] | undefined;

      if (sizes && sizes.length > 0) {
        // CASE 1: Multi-variant product (has sizes)
        productsWithSizes++;
        console.log(`   ✅ Multi-variant product (${sizes.length} sizes)`);
        console.log(`   Sizes: ${sizes.join(", ")}`);

        // Create "Size" option
        try {
          const [sizeOption] = await db
            .insert(productOptions)
            .values({
              productId: product.id,
              name: "Size",
              position: 1,
              values: sizes,
            })
            .returning();

          totalOptionsCreated++;
          console.log(`   📏 Created Size option (id: ${sizeOption.id})`);

          // Create variant for each size
          for (let i = 0; i < sizes.length; i++) {
            const size = sizes[i];
            const isFirst = i === 0;

            // For first variant, use product's SKU and price
            // For others, generate SKU and use same price
            const variantSku = isFirst
              ? (product.sku || null)
              : product.sku
                ? `${product.sku}-${i}`
                : null;

            await db.insert(productVariants).values({
              productId: product.id,
              title: size,
              option1: size,
              option2: null,
              option3: null,
              price: product.price || "0.00",
              inventoryQuantity: 0, // Default to 0 (will be updated when inventory system is built)
              sku: variantSku,
            });

            totalVariantsCreated++;
            console.log(`      ✓ Variant ${i + 1}: ${size} (SKU: ${variantSku || "N/A"})`);
          }

        } catch (error) {
          console.error(`   ❌ Error creating variants for product ${product.id}:`, error);
          throw error; // Stop migration on error
        }

      } else {
        // CASE 2: Simple product (no sizes)
        productsWithoutSizes++;
        console.log(`   ℹ️  Simple product (no sizes) - creating default variant`);

        try {
          await db.insert(productVariants).values({
            productId: product.id,
            title: "Default",
            option1: null,
            option2: null,
            option3: null,
            price: product.price || "0.00",
            sku: product.sku || null,
            inventoryQuantity: 0,
          });

          totalVariantsCreated++;
          console.log(`      ✓ Created default variant (SKU: ${product.sku || "N/A"})`);

        } catch (error) {
          console.error(`   ❌ Error creating default variant for product ${product.id}:`, error);
          throw error; // Stop migration on error
        }
      }
    }

    // Step 3: Verify migration results
    console.log("\n================================================================");
    console.log("📊 Verifying migration results...");
    console.log("================================================================\n");

    const finalVariants = await db.select().from(productVariants);
    const finalOptions = await db.select().from(productOptions);

    console.log("✅ Migration Complete!\n");
    console.log("📈 Summary:");
    console.log(`   • Products migrated: ${allProducts.length}`);
    console.log(`   • Products with sizes: ${productsWithSizes}`);
    console.log(`   • Products without sizes: ${productsWithoutSizes}`);
    console.log(`   • Total options created: ${totalOptionsCreated}`);
    console.log(`   • Total variants created: ${totalVariantsCreated}`);
    console.log(`   • Variants in database: ${finalVariants.length}`);
    console.log(`   • Options in database: ${finalOptions.length}\n`);

    // Step 4: Validation checks
    console.log("🔍 Validation Checks:");

    // Check 1: Every product should have at least 1 variant
    const productsWithoutVariants = allProducts.filter(p =>
      !finalVariants.some(v => v.productId === p.id)
    );

    if (productsWithoutVariants.length > 0) {
      console.warn(`   ⚠️  WARNING: ${productsWithoutVariants.length} products have NO variants!`);
      productsWithoutVariants.forEach(p => {
        console.warn(`      - ${p.title} (${p.id})`);
      });
    } else {
      console.log(`   ✅ All ${allProducts.length} products have variants`);
    }

    // Check 2: Variants should have valid prices
    const variantsWithoutPrice = finalVariants.filter(v => !v.price || v.price === "");
    if (variantsWithoutPrice.length > 0) {
      console.warn(`   ⚠️  WARNING: ${variantsWithoutPrice.length} variants have no price`);
    } else {
      console.log(`   ✅ All variants have prices`);
    }

    // Check 3: Total variants matches expected
    if (totalVariantsCreated === finalVariants.length) {
      console.log(`   ✅ Variant count matches: ${totalVariantsCreated} created, ${finalVariants.length} in DB`);
    } else {
      console.error(`   ❌ Mismatch: Created ${totalVariantsCreated} but found ${finalVariants.length} in DB`);
    }

    console.log("\n================================================================");
    console.log("🎉 Migration completed successfully!");
    console.log("================================================================\n");

    console.log("💡 Next Steps:");
    console.log("   1. Verify data in database: psql -h localhost -p 5433 -U shopsyncflow_user -d shopsyncflow_db");
    console.log("   2. Run: SELECT COUNT(*) FROM product_variants;");
    console.log("   3. Run: SELECT COUNT(*) FROM product_options;");
    console.log("   4. Update storage layer (storage.ts) to use new tables");
    console.log("   5. Update API routes (routes.ts) to return variants");
    console.log("   6. Update frontend to display variants\n");

  } catch (error) {
    console.error("\n❌ Migration failed!");
    console.error(error);
    process.exit(1);
  }
}

// Run migration
console.log("Starting migration at:", new Date().toISOString());
migrateProductsToVariants()
  .then(() => {
    console.log("Migration finished at:", new Date().toISOString());
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration error:", error);
    process.exit(1);
  });
