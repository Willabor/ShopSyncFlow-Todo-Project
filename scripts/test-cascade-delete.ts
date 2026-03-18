/**
 * Test Script: Cascade Delete for Product Options
 *
 * Tests that deleting a product option also deletes all associated variants.
 * This is necessary because variants are defined by their option values.
 *
 * Test Scenario:
 * 1. Find a multi-variant product (EPTM Track Pants)
 * 2. Count variants before deletion
 * 3. Delete the "Size" option
 * 4. Verify all variants are deleted
 * 5. Cleanup (recreate variants for the product)
 */

import { db } from "../server/db";
import { products, productOptions, productVariants } from "../shared/schema";
import { storage } from "../server/storage";
import { eq } from "drizzle-orm";

async function testCascadeDelete() {
  console.log("================================================================");
  console.log("🧪 Testing Cascade Delete for Product Options");
  console.log("================================================================\n");

  let testPassed = true;

  try {
    // Step 1: Find the multi-variant product (EPTM Track Pants)
    console.log("📋 Step 1: Finding multi-variant product...");

    const [multiVariantOption] = await db
      .select()
      .from(productOptions)
      .limit(1);

    if (!multiVariantOption) {
      console.log("   ⚠️  No product options found. Skipping test.");
      console.log("   ℹ️  This is expected if no products have options.\n");
      return;
    }

    const productId = multiVariantOption.productId;
    const optionId = multiVariantOption.id;

    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId));

    console.log(`   ✓ Found product: "${product.title}"`);
    console.log(`   ✓ Option ID: ${optionId}`);
    console.log(`   ✓ Option name: ${multiVariantOption.name}\n`);

    // Step 2: Count variants before deletion
    console.log("📊 Step 2: Counting variants before deletion...");

    const variantsBefore = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId));

    console.log(`   ✓ Variants before: ${variantsBefore.length}`);

    if (variantsBefore.length === 0) {
      console.log("   ⚠️  Product has no variants. Cannot test cascade delete.\n");
      testPassed = false;
      return;
    }

    // Display variants
    console.log("   Variants:");
    variantsBefore.forEach((v, i) => {
      console.log(`      ${i + 1}. ${v.title} (${v.option1 || 'Default'})`);
    });
    console.log();

    // Step 3: Delete the option (should cascade delete variants)
    console.log("🗑️  Step 3: Deleting option (cascade delete)...");

    const deleted = await storage.deleteProductOption(optionId);

    if (!deleted) {
      console.log("   ❌ FAIL: Option deletion failed\n");
      testPassed = false;
      return;
    }

    console.log("   ✓ Option deleted successfully\n");

    // Step 4: Verify variants are deleted
    console.log("✅ Step 4: Verifying cascade delete...");

    const variantsAfter = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId));

    console.log(`   ✓ Variants after: ${variantsAfter.length}`);

    if (variantsAfter.length === 0) {
      console.log("   ✅ SUCCESS: All variants deleted (cascade worked)\n");
    } else {
      console.log(`   ❌ FAIL: ${variantsAfter.length} variants remain (cascade failed)\n`);
      testPassed = false;
    }

    // Step 5: Verify option is deleted
    console.log("🔍 Step 5: Verifying option deletion...");

    const optionAfter = await db
      .select()
      .from(productOptions)
      .where(eq(productOptions.id, optionId));

    if (optionAfter.length === 0) {
      console.log("   ✅ SUCCESS: Option deleted\n");
    } else {
      console.log("   ❌ FAIL: Option still exists\n");
      testPassed = false;
    }

    // Step 6: Cleanup - Recreate a default variant for the product
    console.log("🔧 Step 6: Cleanup - Recreating default variant...");

    // Get product price
    const productPrice = product.price || "0.00";
    const productSku = product.sku || null;

    await storage.createProductVariant({
      productId: productId,
      title: "Default",
      option1: null,
      option2: null,
      option3: null,
      price: productPrice,
      inventoryQuantity: 0,
      sku: productSku,
    });

    console.log("   ✓ Default variant recreated\n");

    // Summary
    console.log("================================================================");
    if (testPassed) {
      console.log("✅ TEST PASSED: Cascade delete works correctly");
    } else {
      console.log("❌ TEST FAILED: Cascade delete did not work as expected");
    }
    console.log("================================================================\n");

    console.log("📋 Test Summary:");
    console.log(`   Product tested: ${product.title}`);
    console.log(`   Variants before deletion: ${variantsBefore.length}`);
    console.log(`   Variants after deletion: ${variantsAfter.length}`);
    console.log(`   Expected after: 0`);
    console.log(`   Cascade delete: ${variantsAfter.length === 0 ? 'WORKING' : 'BROKEN'}\n`);

    console.log("💡 Next Steps:");
    console.log("   1. If test passed, cascade delete is working correctly");
    console.log("   2. Frontend UI should warn users before deleting options");
    console.log("   3. Consider adding confirmation dialog in UI\n");

    process.exit(testPassed ? 0 : 1);

  } catch (error) {
    console.error("\n❌ Test failed with error:");
    console.error(error);
    process.exit(1);
  }
}

// Run test
console.log("Starting cascade delete test at:", new Date().toISOString());
testCascadeDelete()
  .then(() => {
    console.log("Test finished at:", new Date().toISOString());
  })
  .catch((error) => {
    console.error("Test error:", error);
    process.exit(1);
  });
