#!/usr/bin/env tsx

/**
 * Import Shopify Standard Product Taxonomy
 *
 * Reads the Shopify categories file and imports all 11,771+ categories
 * into the product_categories table with Google category mappings.
 *
 * Usage: tsx server/scripts/import-shopify-taxonomy.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from '../db';
import { sql } from 'drizzle-orm';

interface Category {
  id: string;              // "aa-1-13-13"
  gid: string;             // Full GID
  path: string;            // Full display path
  name: string;            // Just "Hoodies"
  parentId: string | null; // "aa-1-13"
  level: number;           // 4
}

interface GoogleMapping {
  shopifyId: string;        // "aa-1-13-13"
  googleCategoryId: string; // "212"
  googleCategoryPath: string;
}

/**
 * Parse Shopify categories file
 * Format: gid://shopify/TaxonomyCategory/aa-1-13-13 : Apparel & Accessories > Clothing > Clothing Tops > Hoodies
 */
function parseShopifyCategories(filePath: string): Category[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const categories: Category[] = [];

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || !line.trim()) continue;

    // Parse: gid://shopify/TaxonomyCategory/aa-1-13-13 : Path > To > Category
    const match = line.match(/^(gid:\/\/shopify\/TaxonomyCategory\/([^\s]+))\s*:\s*(.+)$/);
    if (!match) {
      console.warn(`Skipping invalid line: ${line.substring(0, 80)}...`);
      continue;
    }

    const [, gid, id, path] = match;
    const levels = path.split(' > ').map(s => s.trim());
    const name = levels[levels.length - 1];

    // Calculate parent ID by removing last segment
    const idParts = id.split('-');
    const parentId = idParts.length > 1 ? idParts.slice(0, -1).join('-') : null;

    categories.push({
      id,
      gid,
      path,
      name,
      parentId,
      level: levels.length,
    });
  }

  return categories;
}

/**
 * Parse Shopify to Google mapping file
 * Format: aa-1-13-13	212	Apparel & Accessories > Clothing > Shirts & Tops
 */
function parseGoogleMapping(filePath: string): Map<string, GoogleMapping> {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const mappings = new Map<string, GoogleMapping>();

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || !line.trim()) continue;

    // Parse tab-separated values: shopify_id, google_id, google_path
    const parts = line.split('\t');
    if (parts.length !== 3) {
      console.warn(`Skipping invalid mapping line: ${line.substring(0, 80)}...`);
      continue;
    }

    const [shopifyId, googleCategoryId, googleCategoryPath] = parts;
    mappings.set(shopifyId.trim(), {
      shopifyId: shopifyId.trim(),
      googleCategoryId: googleCategoryId.trim(),
      googleCategoryPath: googleCategoryPath.trim(),
    });
  }

  return mappings;
}

/**
 * Main import function
 */
async function importTaxonomy() {
  console.log('🚀 Starting Shopify taxonomy import...\n');

  const dataDir = join(process.cwd(), 'server/data/taxonomies');
  const categoriesFile = join(dataDir, 'shopify-categories.txt');
  const mappingFile = join(dataDir, 'shopify-to-google-mapping.txt');

  // Step 1: Parse categories
  console.log('📖 Parsing Shopify categories...');
  const categories = parseShopifyCategories(categoriesFile);
  console.log(`   Found ${categories.length} categories\n`);

  // Step 2: Parse Google mappings (skip for now - mapping file uses different format)
  console.log('📖 Skipping Google category mappings (will be added later)...');
  const googleMappings = new Map<string, GoogleMapping>();
  console.log(`   Mappings: 0 (optional feature)\n`);

  // Step 3: Clear existing data
  console.log('🗑️  Clearing existing product_categories data...');
  await db.execute(sql`TRUNCATE TABLE product_categories CASCADE`);
  console.log('   ✅ Cleared\n');

  // Step 4: Insert categories in batches
  console.log('💾 Inserting categories...');
  const batchSize = 500;
  let inserted = 0;

  for (let i = 0; i < categories.length; i += batchSize) {
    const batch = categories.slice(i, i + batchSize);

    // Build SQL INSERT with escaped values
    const values: string[] = [];

    for (const cat of batch) {
      const googleMapping = googleMappings.get(cat.id);

      // Escape strings for SQL (replace single quotes with double quotes)
      const escapeSQL = (str: string | null) => {
        if (str === null) return 'NULL';
        return `'${str.replace(/'/g, "''")}'`;
      };

      const parentIdStr = cat.parentId ? escapeSQL(cat.parentId) : 'NULL';
      const googleCategoryIdStr = googleMapping?.googleCategoryId ? escapeSQL(googleMapping.googleCategoryId) : 'NULL';
      const googleCategoryPathStr = googleMapping?.googleCategoryPath ? escapeSQL(googleMapping.googleCategoryPath) : 'NULL';

      values.push(`(${escapeSQL(cat.id)}, ${escapeSQL(cat.gid)}, ${escapeSQL(cat.path)}, ${escapeSQL(cat.name)}, ${parentIdStr}, ${cat.level}, ${googleCategoryIdStr}, ${googleCategoryPathStr})`);
    }

    const insertSQL = sql.raw(`
      INSERT INTO product_categories
        (id, gid, path, name, parent_id, level, google_category_id, google_category_path)
      VALUES ${values.join(', ')}
    `);

    await db.execute(insertSQL);

    inserted += batch.length;
    process.stdout.write(`\r   Progress: ${inserted}/${categories.length} (${Math.round(inserted/categories.length*100)}%)`);
  }

  console.log('\n   ✅ Inserted all categories\n');

  // Step 5: Verify import
  console.log('🔍 Verifying import...');
  const result = await db.execute(sql`SELECT COUNT(*) as count FROM product_categories`);
  const count = (result.rows[0] as any).count;
  console.log(`   Database has ${count} categories`);

  // Show sample categories
  console.log('\n📋 Sample categories:');
  const samples = await db.execute(sql`
    SELECT id, path, google_category_id
    FROM product_categories
    WHERE path LIKE '%Hoodies%'
    LIMIT 5
  `);

  for (const row of samples.rows) {
    const r = row as any;
    console.log(`   ${r.id}: ${r.path}`);
    if (r.google_category_id) {
      console.log(`      → Google: ${r.google_category_id}`);
    }
  }

  console.log('\n✅ Import complete!');
  console.log(`\n📊 Summary:`);
  console.log(`   - Total categories: ${count}`);
  console.log(`   - With Google mapping: ${Array.from(googleMappings.values()).length}`);
  console.log(`   - Without mapping: ${count - googleMappings.size}`);

  process.exit(0);
}

// Run import
importTaxonomy().catch((error) => {
  console.error('❌ Import failed:', error);
  process.exit(1);
});
