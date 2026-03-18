/**
 * Test Script: Verify Variant System Implementation
 *
 * This script tests:
 * 1. Database integrity (variants and options exist)
 * 2. Storage layer methods (getProductWithVariants, etc.)
 * 3. Data consistency (every product has at least 1 variant)
 */

import { db } from "../server/db";
import { products, productOptions, productVariants } from "../shared/schema";
import { storage } from "../server/storage";
import { eq } from "drizzle-orm";

async function testVariantSystem() {
  console.log("================================================================");
  console.log("🧪 Testing Variant System Implementation");
  console.log("================================================================\n");

  let allTestsPassed = true;

  try {
    // ============================================================
    // Test 1: Database Integrity
    // ============================================================
    console.log("📊 Test 1: Database Integrity");
    console.log("─────────────────────────────────────────────────────────────");

    const productCount = await db.select().from(products).then(rows => rows.length);
    const variantCount = await db.select().from(productVariants).then(rows => rows.length);
    const optionCount = await db.select().from(productOptions).then(rows => rows.length);

    console.log(`   Products in database: ${productCount}`);
    console.log(`   Variants in database: ${variantCount}`);
    console.log(`   Options in database: ${optionCount}`);

    // Test 1a: Every product should have at least 1 variant
    const productsWithoutVariants = await db
      .select({ id: products.id, title: products.title })
      .from(products)
      .leftJoin(productVariants, eq(products.id, productVariants.productId))
      .where(eq(productVariants.id, null as any));

    if (productsWithoutVariants.length === 0) {
      console.log("   ✅ All products have variants");
    } else {
      console.log(`   ❌ FAIL: ${productsWithoutVariants.length} products have NO variants`);
      allTestsPassed = false;
    }

    // Test 1b: Variant count should be >= product count
    if (variantCount >= productCount) {
      console.log(`   ✅ Variant count (${variantCount}) >= product count (${productCount})`);
    } else {
      console.log(`   ❌ FAIL: Variant count (${variantCount}) < product count (${productCount})`);
      allTestsPassed = false;
    }

    console.log();

    // ============================================================
    // Test 2: Storage Layer Methods
    // ============================================================
    console.log("🔧 Test 2: Storage Layer Methods");
    console.log("─────────────────────────────────────────────────────────────");

    // Get a random product ID
    const [sampleProduct] = await db
      .select({ id: products.id, title: products.title })
      .from(products)
      .limit(1);

    if (!sampleProduct) {
      console.log("   ❌ FAIL: No products found in database");
      allTestsPassed = false;
    } else {
      console.log(`   Testing with product: "${sampleProduct.title}" (${sampleProduct.id})\n`);

      // Test 2a: getProductWithVariants
      try {
        const productWithVariants = await storage.getProductWithVariants(sampleProduct.id);
        if (productWithVariants) {
          console.log(`   ✅ getProductWithVariants() works`);
          console.log(`      - Product ID: ${productWithVariants.id}`);
          console.log(`      - Variants: ${productWithVariants.variants?.length || 0}`);
          console.log(`      - Options: ${productWithVariants.options?.length || 0}`);
        } else {
          console.log(`   ❌ FAIL: getProductWithVariants() returned null`);
          allTestsPassed = false;
        }
      } catch (error) {
        console.log(`   ❌ FAIL: getProductWithVariants() threw error:`, error);
        allTestsPassed = false;
      }

      // Test 2b: getProductVariants
      try {
        const variants = await storage.getProductVariants(sampleProduct.id);
        if (variants.length > 0) {
          console.log(`   ✅ getProductVariants() works (${variants.length} variants)`);
        } else {
          console.log(`   ⚠️  WARNING: getProductVariants() returned 0 variants`);
        }
      } catch (error) {
        console.log(`   ❌ FAIL: getProductVariants() threw error:`, error);
        allTestsPassed = false;
      }

      // Test 2c: getProductOptions
      try {
        const options = await storage.getProductOptions(sampleProduct.id);
        console.log(`   ✅ getProductOptions() works (${options.length} options)`);
      } catch (error) {
        console.log(`   ❌ FAIL: getProductOptions() threw error:`, error);
        allTestsPassed = false;
      }
    }

    console.log();

    // ============================================================
    // Test 3: Data Quality
    // ============================================================
    console.log("🔍 Test 3: Data Quality");
    console.log("─────────────────────────────────────────────────────────────");

    // Test 3a: Variants have valid prices
    const variantsWithoutPrice = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.price, ""));

    if (variantsWithoutPrice.length === 0) {
      console.log("   ✅ All variants have prices");
    } else {
      console.log(`   ⚠️  WARNING: ${variantsWithoutPrice.length} variants have empty price`);
    }

    // Test 3b: Check for products with multiple variants
    const multiVariantProducts = await db
      .select({
        productId: productVariants.productId,
        count: db.$count()
      })
      .from(productVariants)
      .groupBy(productVariants.productId)
      .having(({ count }) => count > 1);

    console.log(`   ℹ️  Products with multiple variants: ${multiVariantProducts.length}`);

    // Test 3c: Sample a multi-variant product
    if (multiVariantProducts.length > 0) {
      const [multiVariantProductId] = multiVariantProducts;
      const variants = await storage.getProductVariants(multiVariantProductId.productId);
      const product = await storage.getProduct(multiVariantProductId.productId);

      if (product) {
        console.log(`   ℹ️  Example multi-variant product: "${product.title}"`);
        console.log(`      - Variant count: ${variants.length}`);
        variants.forEach((v, i) => {
          console.log(`      - Variant ${i + 1}: ${v.title} (${v.option1 || 'Default'})`);
        });
      }
    }

    console.log();

    // ============================================================
    // Test Summary
    // ============================================================
    console.log("================================================================");
    if (allTestsPassed) {
      console.log("✅ All tests PASSED!");
    } else {
      console.log("❌ Some tests FAILED - see details above");
    }
    console.log("================================================================\n");

    console.log("💡 Next Steps:");
    console.log("   1. If all tests passed, proceed to Phase 4b: API endpoints");
    console.log("   2. Test API endpoints with authentication");
    console.log("   3. Proceed to Phase 5: Update Shopify sync logic\n");

    process.exit(allTestsPassed ? 0 : 1);

  } catch (error) {
    console.error("\n❌ Test suite failed with error:");
    console.error(error);
    process.exit(1);
  }
}

// Run tests
console.log("Starting tests at:", new Date().toISOString());
testVariantSystem()
  .then(() => {
    console.log("Tests finished at:", new Date().toISOString());
  })
  .catch((error) => {
    console.error("Test suite error:", error);
    process.exit(1);
  });
