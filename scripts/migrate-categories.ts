/**
 * Category Migration Script
 *
 * Migrates existing product categories from text field to structured categories table
 *
 * Safety Features:
 * - Dry-run mode (no data modification)
 * - Validation before migration
 * - Rollback capability
 * - Progress logging
 * - Idempotent (can run multiple times)
 *
 * Usage:
 *   npm run migrate:categories -- --dry-run    (preview changes)
 *   npm run migrate:categories                 (execute migration)
 *   npm run migrate:categories -- --rollback   (undo migration)
 */

// Load environment variables
import * as dotenv from 'dotenv';
dotenv.config();

import { db } from '../server/db';
import { categories, products } from '@shared/schema';
import { eq, sql, isNull } from 'drizzle-orm';

interface MigrationStats {
  categoriesFound: number;
  categoriesCreated: number;
  productsToUpdate: number;
  productsUpdated: number;
  uncategorizedProducts: number;
  errors: string[];
  warnings: string[];
}

interface CategoryToCreate {
  name: string;
  slug: string;
  productCount: number;
}

/**
 * Generate URL-friendly slug from category name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with dash
    .replace(/^-+|-+$/g, '')       // Remove leading/trailing dashes
    .replace(/-+/g, '-');          // Replace multiple dashes with single dash
}

/**
 * Validate category name and slug
 */
function validateCategory(name: string, slug: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Category name cannot be empty' };
  }

  if (name.length > 100) {
    return { valid: false, error: `Category name too long: ${name} (${name.length} chars)` };
  }

  if (!slug || slug.length === 0) {
    return { valid: false, error: `Cannot generate slug for: ${name}` };
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { valid: false, error: `Invalid slug format: ${slug}` };
  }

  return { valid: true };
}

/**
 * Step 1: Analyze existing data
 */
async function analyzeData(): Promise<{ categories: CategoryToCreate[]; stats: MigrationStats }> {
  console.log('📊 Step 1: Analyzing existing data...\n');

  const stats: MigrationStats = {
    categoriesFound: 0,
    categoriesCreated: 0,
    productsToUpdate: 0,
    productsUpdated: 0,
    uncategorizedProducts: 0,
    errors: [],
    warnings: []
  };

  // Get unique categories with product counts
  const uniqueCategories = await db
    .select({
      name: products.category,
      count: sql<number>`count(*)::int`
    })
    .from(products)
    .where(sql`${products.category} IS NOT NULL AND ${products.category} != ''`)
    .groupBy(products.category)
    .orderBy(products.category);

  stats.categoriesFound = uniqueCategories.length;
  console.log(`✅ Found ${stats.categoriesFound} unique categories`);

  // Get uncategorized product count
  const [uncategorizedResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(sql`${products.category} IS NULL OR ${products.category} = ''`);

  stats.uncategorizedProducts = uncategorizedResult?.count || 0;
  console.log(`⚠️  Found ${stats.uncategorizedProducts} uncategorized products\n`);

  // Create category objects with validation
  const categoriesToCreate: CategoryToCreate[] = [];

  console.log('🔍 Validating categories...\n');
  for (const row of uniqueCategories) {
    const name = row.name!;
    const slug = generateSlug(name);
    const productCount = row.count;

    // Validate
    const validation = validateCategory(name, slug);
    if (!validation.valid) {
      stats.errors.push(validation.error!);
      console.error(`❌ Invalid category: ${name} - ${validation.error}`);
      continue;
    }

    categoriesToCreate.push({ name, slug, productCount });
    console.log(`✅ ${name.padEnd(40)} → ${slug.padEnd(40)} (${productCount} products)`);
  }

  console.log(`\n✅ Validated ${categoriesToCreate.length} categories`);
  if (stats.errors.length > 0) {
    console.error(`❌ Found ${stats.errors.length} validation errors`);
  }

  return { categories: categoriesToCreate, stats };
}

/**
 * Step 2: Check for existing categories
 */
async function checkExistingCategories(): Promise<void> {
  console.log('\n🔍 Step 2: Checking for existing categories...\n');

  const existingCategories = await db.select().from(categories);

  if (existingCategories.length > 0) {
    console.warn(`⚠️  Warning: Found ${existingCategories.length} existing categories in database:`);
    for (const cat of existingCategories) {
      console.log(`   - ${cat.name} (${cat.productCount} products)`);
    }
    console.log('\n   These will be skipped if duplicates detected.\n');
  } else {
    console.log('✅ Categories table is empty\n');
  }
}

/**
 * Step 3: Create categories in database
 */
async function createCategories(
  categoriesToCreate: CategoryToCreate[],
  dryRun: boolean
): Promise<Map<string, string>> {
  console.log(`\n📝 Step 3: ${dryRun ? 'Previewing' : 'Creating'} categories...\n`);

  const categoryIdMap = new Map<string, string>(); // name -> id

  if (dryRun) {
    console.log('🔒 DRY RUN MODE - No data will be modified\n');
    for (const cat of categoriesToCreate) {
      console.log(`[DRY RUN] Would create: ${cat.name} → ${cat.slug}`);
      categoryIdMap.set(cat.name, `dry-run-id-${cat.slug}`);
    }
    return categoryIdMap;
  }

  let created = 0;
  let skipped = 0;

  for (const cat of categoriesToCreate) {
    try {
      // Check if already exists (by name or slug)
      const existing = await db
        .select()
        .from(categories)
        .where(sql`${categories.name} = ${cat.name} OR ${categories.slug} = ${cat.slug}`)
        .limit(1);

      if (existing.length > 0) {
        console.log(`⏭️  Skipped (exists): ${cat.name}`);
        categoryIdMap.set(cat.name, existing[0].id);
        skipped++;
        continue;
      }

      // Create category
      const [newCategory] = await db
        .insert(categories)
        .values({
          name: cat.name,
          slug: cat.slug,
          description: null,
          color: null,
          isActive: true,
          displayOrder: 0,
          productCount: 0 // Will be updated in step 5
        })
        .returning();

      categoryIdMap.set(cat.name, newCategory.id);
      console.log(`✅ Created: ${cat.name} (${newCategory.id})`);
      created++;

    } catch (error: any) {
      console.error(`❌ Failed to create ${cat.name}:`, error.message);
      throw error;
    }
  }

  console.log(`\n✅ Created ${created} categories, skipped ${skipped} existing\n`);
  return categoryIdMap;
}

/**
 * Step 4: Link products to categories
 */
async function linkProducts(
  categoryIdMap: Map<string, string>,
  dryRun: boolean
): Promise<number> {
  console.log(`\n🔗 Step 4: ${dryRun ? 'Previewing' : 'Linking'} products to categories...\n`);

  if (dryRun) {
    console.log('🔒 DRY RUN MODE - No products will be modified\n');

    // Count products that would be updated
    let wouldUpdate = 0;
    for (const [categoryName] of categoryIdMap) {
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(eq(products.category, categoryName));

      wouldUpdate += result?.count || 0;
    }

    console.log(`[DRY RUN] Would update ${wouldUpdate} products\n`);
    return wouldUpdate;
  }

  let updated = 0;

  for (const [categoryName, categoryId] of categoryIdMap) {
    try {
      const result = await db
        .update(products)
        .set({ categoryId: categoryId })
        .where(eq(products.category, categoryName));

      const count = result.rowCount || 0;
      updated += count;

      if (count > 0) {
        console.log(`✅ Linked ${count} products to: ${categoryName}`);
      }

    } catch (error: any) {
      console.error(`❌ Failed to link products for ${categoryName}:`, error.message);
      throw error;
    }
  }

  console.log(`\n✅ Updated ${updated} products\n`);
  return updated;
}

/**
 * Step 5: Update category product counts
 */
async function updateProductCounts(dryRun: boolean): Promise<void> {
  console.log(`\n🔢 Step 5: ${dryRun ? 'Previewing' : 'Updating'} category product counts...\n`);

  if (dryRun) {
    console.log('🔒 DRY RUN MODE - Product counts will not be updated\n');
    return;
  }

  // Reset all counts to 0
  await db.update(categories).set({ productCount: 0 });

  // Count products per category
  const counts = await db
    .select({
      categoryId: products.categoryId,
      count: sql<number>`count(*)::int`
    })
    .from(products)
    .where(sql`${products.categoryId} IS NOT NULL`)
    .groupBy(products.categoryId);

  // Update each category
  for (const row of counts) {
    await db
      .update(categories)
      .set({ productCount: row.count })
      .where(eq(categories.id, row.categoryId!));
  }

  console.log(`✅ Updated product counts for ${counts.length} categories\n`);
}

/**
 * Step 6: Verify migration results
 */
async function verifyMigration(): Promise<boolean> {
  console.log('\n✅ Step 6: Verifying migration results...\n');

  let allChecksPass = true;

  // Check 1: All categories created
  const [categoryCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(categories);

  console.log(`📊 Categories in database: ${categoryCount.count}`);

  // Check 2: Products linked
  const [linkedCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(sql`${products.categoryId} IS NOT NULL`);

  console.log(`🔗 Products linked to categories: ${linkedCount.count}`);

  // Check 3: Uncategorized products
  const [unlinkedCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(isNull(products.categoryId));

  console.log(`⚠️  Uncategorized products: ${unlinkedCount.count}`);

  // Check 4: Product count accuracy
  const categoriesWithCounts = await db
    .select({
      id: categories.id,
      name: categories.name,
      productCount: categories.productCount
    })
    .from(categories);

  console.log(`\n📊 Category Product Counts:\n`);
  for (const cat of categoriesWithCounts.slice(0, 10)) {
    console.log(`   ${cat.name.padEnd(40)} ${cat.productCount} products`);
  }
  if (categoriesWithCounts.length > 10) {
    console.log(`   ... and ${categoriesWithCounts.length - 10} more`);
  }

  // Check 5: No orphaned category_id references
  const orphanCheck = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(sql`${products.categoryId} IS NOT NULL AND ${categories.id} IS NULL`);

  if (orphanCheck[0].count > 0) {
    console.error(`\n❌ ERROR: Found ${orphanCheck[0].count} products with invalid category_id!`);
    allChecksPass = false;
  } else {
    console.log(`\n✅ No orphaned category references`);
  }

  return allChecksPass;
}

/**
 * Rollback: Remove category links
 */
async function rollbackMigration(): Promise<void> {
  console.log('\n🔄 Rolling back migration...\n');

  // Step 1: Clear category_id from products
  console.log('1️⃣  Clearing product category links...');
  const result = await db
    .update(products)
    .set({ categoryId: null });

  console.log(`✅ Cleared ${result.rowCount} product links\n`);

  // Step 2: Delete all categories
  console.log('2️⃣  Deleting categories...');
  const deleteResult = await db.delete(categories);

  console.log(`✅ Deleted ${deleteResult.rowCount} categories\n`);

  // Step 3: Verify rollback
  const [categoryCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(categories);

  const [linkedCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(sql`${products.categoryId} IS NOT NULL`);

  if (categoryCount.count === 0 && linkedCount.count === 0) {
    console.log('✅ Rollback successful - database restored to pre-migration state\n');
  } else {
    console.error('❌ Rollback incomplete!');
    console.error(`   Categories remaining: ${categoryCount.count}`);
    console.error(`   Products still linked: ${linkedCount.count}`);
  }
}

/**
 * Main migration function
 */
async function migrate() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const rollback = args.includes('--rollback');

  console.log('\n' + '='.repeat(80));
  console.log('🚀 Category Migration Script');
  console.log('='.repeat(80) + '\n');

  if (rollback) {
    console.log('⚠️  ROLLBACK MODE - This will undo the migration!\n');
    console.log('Press Ctrl+C within 5 seconds to cancel...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
    await rollbackMigration();
    return;
  }

  if (dryRun) {
    console.log('🔒 DRY RUN MODE - No data will be modified\n');
  } else {
    console.log('⚠️  LIVE MODE - Data will be modified!\n');
    console.log('Press Ctrl+C within 5 seconds to cancel...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  try {
    // Step 1: Analyze data
    const { categories: categoriesToCreate, stats } = await analyzeData();

    if (stats.errors.length > 0) {
      console.error('\n❌ Migration aborted due to validation errors\n');
      process.exit(1);
    }

    // Step 2: Check existing categories
    await checkExistingCategories();

    // Step 3: Create categories
    const categoryIdMap = await createCategories(categoriesToCreate, dryRun);

    // Step 4: Link products
    const productsUpdated = await linkProducts(categoryIdMap, dryRun);

    // Step 5: Update product counts
    await updateProductCounts(dryRun);

    if (!dryRun) {
      // Step 6: Verify results
      const success = await verifyMigration();

      if (!success) {
        console.error('\n❌ Migration completed with errors - please review results\n');
        process.exit(1);
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(80));
    console.log('✅ Migration Summary');
    console.log('='.repeat(80));
    console.log(`Categories found: ${stats.categoriesFound}`);
    console.log(`Categories created: ${categoryIdMap.size}`);
    console.log(`Products updated: ${productsUpdated}`);
    console.log(`Uncategorized products: ${stats.uncategorizedProducts}`);
    console.log('='.repeat(80) + '\n');

    if (dryRun) {
      console.log('🔒 DRY RUN COMPLETE - No changes were made\n');
      console.log('Run without --dry-run to execute migration:\n');
      console.log('   npm run migrate:categories\n');
    } else {
      console.log('✅ MIGRATION COMPLETE\n');
      console.log('To rollback if needed:\n');
      console.log('   npm run migrate:categories -- --rollback\n');
    }

    process.exit(0);

  } catch (error: any) {
    console.error('\n💥 Migration failed:', error.message);
    console.error(error.stack);
    console.error('\nDatabase may be in inconsistent state!');
    console.error('Run rollback to restore:\n');
    console.error('   npm run migrate:categories -- --rollback\n');
    process.exit(1);
  }
}

// Run migration
migrate();
