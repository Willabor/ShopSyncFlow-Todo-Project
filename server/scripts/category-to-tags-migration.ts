/**
 * Category to Tags Migration Script
 *
 * Migrates products from old category system to Shopify's 4-part system:
 * 1. Product Type ← Last segment of category name
 * 2. Tags ← Gender + intermediate segments + descriptors
 * 3. Shopify Taxonomy ← Standard Google Product Category
 * 4. Collections ← Keep existing (already working)
 *
 * Usage:
 *   npm run migrate:category -- --category "Gift Cards" --dry-run
 *   npm run migrate:category -- --category "Gift Cards" --execute
 */

// Load environment variables
import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../../.env") });

import { db } from "../db.js";
import { products, categories } from "../../shared/schema.js";
import { eq, and, isNotNull } from "drizzle-orm";

// Migration mapping for all 86 categories
const CATEGORY_MAPPINGS: Record<string, {
  productType: string;
  tags: string[];
  shopifyTaxonomy: {
    id: string;
    path: string;
  };
  notes?: string;
}> = {
  "Gift Cards": {
    productType: "Gift Card",
    tags: ["Gift Card"],
    shopifyTaxonomy: {
      id: "aa-1-5-5-1",
      path: "Arts & Entertainment > Party & Celebration > Gift Giving > Gift Cards & Certificates"
    },
    notes: "Perfect pilot test candidate"
  },
  "Insurance": {
    productType: "Insurance",
    tags: ["Insurance", "Protection"],
    shopifyTaxonomy: {
      id: "bb-1-10-2-5",
      path: "Business & Industrial > Retail > Retail Supplies > Retail Insurance Products"
    }
  },
  "Men-Tops-Hoodies & Sweatshirts-Mystery Box": {
    productType: "Mystery Box",
    tags: ["Men", "Tops", "Hoodies", "Sweatshirts", "Mystery Box", "Bundle"],
    shopifyTaxonomy: {
      id: "aa-1-1-1-5",
      path: "Apparel & Accessories > Clothing > Shirts & Tops > Hoodies"
    }
  },
  "Men-Tops-Outerwear-Jackets-Leather": {
    productType: "Leather Jackets",
    tags: ["Men", "Tops", "Outerwear", "Jackets", "Leather"],
    shopifyTaxonomy: {
      id: "aa-1-1-6-1",
      path: "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets"
    }
  },
  "Men-Tops-TrackPants-Mystery Box": {
    productType: "Mystery Box",
    tags: ["Men", "Bottoms", "Track Pants", "Mystery Box", "Bundle"],
    shopifyTaxonomy: {
      id: "aa-1-1-1-3-1",
      path: "Apparel & Accessories > Clothing > Activewear > Activewear Pants"
    },
    notes: "Category name says 'Tops' but TrackPants are bottoms - fixing hierarchy"
  },
  "Men-Tops-Tshirts-Mystery Box": {
    productType: "Mystery Box",
    tags: ["Men", "Tops", "T-Shirts", "Mystery Box", "Bundle"],
    shopifyTaxonomy: {
      id: "aa-1-1-1-8",
      path: "Apparel & Accessories > Clothing > Shirts & Tops > T-Shirts"
    }
  },
  "Men-Underwear-Leggings": {
    productType: "Leggings",
    tags: ["Men", "Underwear", "Leggings", "Base Layer"],
    shopifyTaxonomy: {
      id: "aa-1-1-13-1",
      path: "Apparel & Accessories > Clothing > Underwear & Socks > Underwear"
    }
  },
  "Sample": {
    productType: "Sample",
    tags: ["Sample", "Test Product"],
    shopifyTaxonomy: {
      id: "",
      path: ""
    },
    notes: "Test product - minimal taxonomy"
  },
  "T-Shirt": {
    productType: "T-Shirts",
    tags: ["T-Shirts", "Tops"],
    shopifyTaxonomy: {
      id: "aa-1-1-1-8",
      path: "Apparel & Accessories > Clothing > Shirts & Tops > T-Shirts"
    },
    notes: "Missing gender - add based on product details"
  },
  "UpCart - Shipping Protection": {
    productType: "Shipping Protection",
    tags: ["UpCart", "Shipping Protection", "Insurance"],
    shopifyTaxonomy: {
      id: "bb-1-10-2-6",
      path: "Business & Industrial > Retail > Retail Supplies > Shipping Protection"
    },
    notes: "Add-on product managed by UpCart app"
  }
  // NOTE: Add more mappings here as you migrate additional categories
  // See: /volume1/docker/planning/05-shopsyncflow/CATEGORIES-VS-TAGS/FULL-MIGRATION-MAPPING.md
};

interface MigrationStats {
  categoryName: string;
  productsFound: number;
  productsUpdated: number;
  errors: string[];
  updatedProducts: Array<{
    id: string;
    title: string;
    oldCategory: string | null;
    newProductType: string;
    oldTags: string | null;
    newTags: string;
    shopifyTaxonomy: string;
  }>;
}

async function migrateCategory(categoryName: string, dryRun: boolean = true): Promise<MigrationStats> {
  const stats: MigrationStats = {
    categoryName,
    productsFound: 0,
    productsUpdated: 0,
    errors: [],
    updatedProducts: []
  };

  console.log(`\n${"=".repeat(80)}`);
  console.log(`🚀 Category Migration: ${categoryName}`);
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes)" : "EXECUTE (will modify database)"}`);
  console.log(`${"=".repeat(80)}\n`);

  // 1. Get mapping for this category
  const mapping = CATEGORY_MAPPINGS[categoryName];
  if (!mapping) {
    stats.errors.push(`No mapping found for category: ${categoryName}`);
    console.error(`❌ ERROR: No mapping found for category "${categoryName}"`);
    console.error(`Available categories: ${Object.keys(CATEGORY_MAPPINGS).join(", ")}`);
    return stats;
  }

  console.log(`📋 Migration Mapping:`);
  console.log(`   Product Type: ${mapping.productType}`);
  console.log(`   Tags: ${mapping.tags.join(", ")}`);
  console.log(`   Shopify Taxonomy: ${mapping.shopifyTaxonomy.path}`);
  if (mapping.notes) {
    console.log(`   Notes: ${mapping.notes}`);
  }
  console.log();

  // 2. Find all products in this category
  const categoryRecord = await db
    .select()
    .from(categories)
    .where(eq(categories.name, categoryName))
    .limit(1);

  if (categoryRecord.length === 0) {
    stats.errors.push(`Category not found in database: ${categoryName}`);
    console.error(`❌ ERROR: Category "${categoryName}" not found in database`);
    return stats;
  }

  const category = categoryRecord[0];
  console.log(`✅ Found category: ${category.name} (ID: ${category.id})`);
  console.log(`   Product count: ${category.productCount}\n`);

  // 3. Get all products in this category
  const productsInCategory = await db
    .select()
    .from(products)
    .where(eq(products.categoryId, category.id));

  stats.productsFound = productsInCategory.length;
  console.log(`📦 Found ${stats.productsFound} products to migrate\n`);

  if (stats.productsFound === 0) {
    console.log(`⚠️  No products found in this category. Nothing to migrate.`);
    return stats;
  }

  // 4. Process each product
  for (const product of productsInCategory) {
    try {
      console.log(`\n${"─".repeat(80)}`);
      console.log(`📦 Product: ${product.title}`);
      console.log(`   ID: ${product.id}`);
      console.log(`   Handle: ${product.handle}`);

      // Parse existing tags
      const existingTags = product.tags ? product.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
      console.log(`   Existing tags (${existingTags.length}): ${existingTags.join(", ") || "(none)"}`);

      // Build new tags - append to existing, avoid duplicates
      const newTagsSet = new Set([...existingTags, ...mapping.tags]);
      const newTags = Array.from(newTagsSet).join(", ");
      console.log(`   New tags (${newTagsSet.size}): ${newTags}`);

      // Prepare update
      const updates = {
        productType: mapping.productType,
        tags: newTags,
        shopifyCategoryId: mapping.shopifyTaxonomy.id || null,
        shopifyCategoryPath: mapping.shopifyTaxonomy.path || null,
        // Clear old category references
        categoryId: null,
        category: null,
        updatedAt: new Date()
      };

      console.log(`\n   📝 Changes to apply:`);
      console.log(`      Product Type: ${product.productType || "(empty)"} → ${updates.productType}`);
      console.log(`      Tags: ${existingTags.length} tags → ${newTagsSet.size} tags`);
      console.log(`      Shopify Taxonomy: ${updates.shopifyCategoryPath || "(none)"}`);
      console.log(`      Category: ${product.category} → (removed)`);

      if (!dryRun) {
        // Execute the update
        await db
          .update(products)
          .set(updates)
          .where(eq(products.id, product.id));

        console.log(`   ✅ Updated successfully`);
        stats.productsUpdated++;
      } else {
        console.log(`   🔍 DRY RUN - No changes made`);
      }

      // Track for summary
      stats.updatedProducts.push({
        id: product.id,
        title: product.title,
        oldCategory: product.category,
        newProductType: updates.productType,
        oldTags: product.tags,
        newTags: newTags,
        shopifyTaxonomy: updates.shopifyCategoryPath || ""
      });

    } catch (error: any) {
      const errorMsg = `Failed to migrate product ${product.id} (${product.title}): ${error.message}`;
      stats.errors.push(errorMsg);
      console.error(`   ❌ ERROR: ${error.message}`);
    }
  }

  return stats;
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let categoryName = "";
  let dryRun = true;
  let showHelp = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--category" && i + 1 < args.length) {
      categoryName = args[i + 1];
      i++;
    } else if (args[i] === "--execute") {
      dryRun = false;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--help" || args[i] === "-h") {
      showHelp = true;
    }
  }

  if (showHelp || !categoryName) {
    console.log(`
Category to Tags Migration Script
=================================

Migrates products from old category system to Shopify's 4-part system.

Usage:
  npm run migrate:category -- --category "Gift Cards" --dry-run
  npm run migrate:category -- --category "Gift Cards" --execute

Arguments:
  --category <name>  Category name to migrate (required)
  --dry-run          Preview changes without modifying database (default)
  --execute          Actually perform the migration
  --help, -h         Show this help message

Available categories (Tier 1 - Safe for testing):
  - Gift Cards (1 product) ⭐ RECOMMENDED PILOT
  - Insurance (1 product)
  - Men-Tops-Hoodies & Sweatshirts-Mystery Box (1 product)
  - Men-Tops-Outerwear-Jackets-Leather (1 product)
  - Men-Tops-TrackPants-Mystery Box (1 product)
  - Men-Tops-Tshirts-Mystery Box (1 product)
  - Men-Underwear-Leggings (1 product)
  - Sample (1 product)
  - T-Shirt (1 product)
  - UpCart - Shipping Protection (1 product)

See: /volume1/docker/planning/05-shopsyncflow/CATEGORIES-VS-TAGS/FULL-MIGRATION-MAPPING.md
for complete mapping of all 86 categories.
    `);
    process.exit(0);
  }

  try {
    const stats = await migrateCategory(categoryName, dryRun);

    // Print summary
    console.log(`\n\n${"=".repeat(80)}`);
    console.log(`📊 MIGRATION SUMMARY`);
    console.log(`${"=".repeat(80)}`);
    console.log(`Category: ${stats.categoryName}`);
    console.log(`Mode: ${dryRun ? "DRY RUN" : "EXECUTE"}`);
    console.log(`Products found: ${stats.productsFound}`);
    console.log(`Products ${dryRun ? "to be updated" : "updated"}: ${dryRun ? stats.productsFound : stats.productsUpdated}`);
    console.log(`Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log(`\n❌ ERRORS:`);
      stats.errors.forEach(error => console.log(`   - ${error}`));
    }

    if (dryRun && stats.productsFound > 0) {
      console.log(`\n✅ DRY RUN COMPLETE - No changes were made to the database`);
      console.log(`\nTo execute this migration, run:`);
      console.log(`   npm run migrate:category -- --category "${categoryName}" --execute`);
    } else if (!dryRun && stats.productsUpdated > 0) {
      console.log(`\n✅ MIGRATION COMPLETE`);
      console.log(`\n📋 Next Steps:`);
      console.log(`   1. Verify products in database:`);
      console.log(`      SELECT id, title, product_type, tags, shopify_category_path`);
      console.log(`      FROM products WHERE product_type = '${CATEGORY_MAPPINGS[categoryName]?.productType}';`);
      console.log(`\n   2. Check product on storefront`);
      console.log(`   3. Verify collections still working`);
      console.log(`   4. Test Searchanise filters`);
    }

    console.log(`\n${"=".repeat(80)}\n`);

    process.exit(stats.errors.length > 0 ? 1 : 0);

  } catch (error: any) {
    console.error(`\n❌ FATAL ERROR: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
