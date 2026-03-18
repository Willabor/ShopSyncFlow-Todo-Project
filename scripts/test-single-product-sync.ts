/**
 * Test script to sync a single product by ID and check style number extraction
 */

import "dotenv/config";
import { shopifyImportService } from "../server/services/shopify-import.service";

const SHOPIFY_PRODUCT_ID = "9252613718248"; // Ethika Men Find Love Boxer

async function testSingleProductSync() {
  console.log(`\n🧪 Testing single product sync for Shopify ID: ${SHOPIFY_PRODUCT_ID}\n`);

  try {
    // The importAllProducts would normally sync all, but we can check the service directly
    const result = await shopifyImportService.importAllProducts();

    console.log("\n✅ Sync completed!");
    console.log(`Total: ${result.progress.total}`);
    console.log(`Imported: ${result.progress.imported}`);
    console.log(`Updated: ${result.progress.updated}`);
    console.log(`Skipped: ${result.progress.skipped}`);
    console.log(`Failed: ${result.progress.failed}`);

    if (result.changeLog.length > 0) {
      console.log(`\n📝 Change Log (${result.changeLog.length} changes):`);
      result.changeLog.forEach((change, idx) => {
        if (idx < 20) { // Show first 20
          console.log(`  ${idx + 1}. ${change.productTitle} - ${change.variantTitle}`);
          console.log(`     ${change.field}: "${change.oldValue}" → "${change.newValue}"`);
        }
      });
      if (result.changeLog.length > 20) {
        console.log(`  ... and ${result.changeLog.length - 20} more changes`);
      }
    }

  } catch (error: any) {
    console.error("❌ Error:");
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testSingleProductSync();
