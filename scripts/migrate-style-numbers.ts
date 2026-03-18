/**
 * Migration Script: Extract Style Numbers from Metadata
 *
 * Purpose: Add style_number column and populate it from existing metadata
 *
 * Data Sources:
 * 1. Content Studio products: metadata.styleNumber
 * 2. Shopify imported products: metadata.metafields[] where key="style_number"
 *
 * Run with: DATABASE_URL=postgresql://... npx tsx scripts/migrate-style-numbers.ts
 */

import pg from 'pg';

// Get DATABASE_URL from environment
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is required');
  console.error('   Usage: DATABASE_URL=postgresql://user:pass@host:port/db npx tsx scripts/migrate-style-numbers.ts');
  process.exit(1);
}

console.log('🚀 Starting Style Number Migration\n');
console.log('📊 Database:', DATABASE_URL.split('@')[1]); // Hide credentials
console.log('');

const client = new pg.Client({
  connectionString: DATABASE_URL,
});

interface Product {
  id: string;
  title: string;
  vendor: string;
  metadata: any;
}

async function main() {
  await client.connect();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PHASE 1: Add style_number Column to Database');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Check if column already exists
    const columnExistsResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'products'
        AND column_name = 'style_number';
    `);

    if (columnExistsResult.rows.length > 0) {
      console.log('✅ Column style_number already exists\n');
    } else {
      console.log('➕ Adding style_number column...');
      await client.query(`
        ALTER TABLE products
        ADD COLUMN style_number TEXT;
      `);
      console.log('✅ Column added successfully\n');
    }

    // Create index for faster queries
    console.log('🔍 Creating index on style_number...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_style_number
      ON products(style_number);
    `);
    console.log('✅ Index created\n');

  } catch (error) {
    console.error('❌ Error adding column:', error);
    await client.end();
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PHASE 2: Extract Style Numbers from Metadata');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Fetch all products with metadata
    console.log('📦 Fetching all products...');
    const productsResult = await client.query(`
      SELECT id, title, vendor, metadata
      FROM products
      WHERE metadata IS NOT NULL;
    `);
    const products: Product[] = productsResult.rows;

    console.log(`✅ Found ${products.length} products with metadata\n`);

    let contentStudioCount = 0;
    let shopifyCount = 0;
    let noStyleNumberCount = 0;
    let updatedCount = 0;

    console.log('🔄 Processing products...\n');

    for (const product of products) {
      const metadata = product.metadata;
      let styleNumber: string | null = null;
      let source: string = '';

      // Method 1: Check for Content Studio format (metadata.styleNumber)
      if (metadata.styleNumber) {
        styleNumber = metadata.styleNumber;
        source = 'Content Studio';
        contentStudioCount++;
      }
      // Method 2: Check for Shopify metafields format
      else if (metadata.metafields && Array.isArray(metadata.metafields)) {
        const styleField = metadata.metafields.find(
          (field: any) =>
            field.namespace === 'custom' && field.key === 'style_number'
        );

        if (styleField && styleField.value) {
          styleNumber = styleField.value;
          source = 'Shopify metafields';
          shopifyCount++;
        }
      }

      if (styleNumber) {
        // Update the product with extracted style number
        await client.query(
          'UPDATE products SET style_number = $1 WHERE id = $2',
          [styleNumber, product.id]
        );

        updatedCount++;

        // Log every 100th product for progress tracking
        if (updatedCount % 100 === 0) {
          console.log(`   ✓ Processed ${updatedCount} products...`);
        }

        // Show first 5 examples
        if (updatedCount <= 5) {
          console.log(`   📝 [${source}] ${product.title}`);
          console.log(`      Vendor: ${product.vendor}`);
          console.log(`      Style Number: ${styleNumber}`);
          console.log('');
        }
      } else {
        noStyleNumberCount++;
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  MIGRATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('📊 Summary Statistics:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`   Total Products:              ${products.length.toLocaleString()}`);
    console.log(`   ✅ Updated with Style Number: ${updatedCount.toLocaleString()}`);
    console.log(`   └─ From Content Studio:      ${contentStudioCount.toLocaleString()}`);
    console.log(`   └─ From Shopify Metafields:  ${shopifyCount.toLocaleString()}`);
    console.log(`   ⚠️  No Style Number Found:    ${noStyleNumberCount.toLocaleString()}`);
    console.log('─────────────────────────────────────────────────────────────\n');

    // Verification queries
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  VERIFICATION');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const verificationResult = await client.query(`
      SELECT
        COUNT(*) as total_products,
        COUNT(style_number) as products_with_style_number,
        COUNT(*) - COUNT(style_number) as products_without_style_number
      FROM products;
    `);

    console.log('✅ Verification Results:');
    console.log(`   Total Products: ${verificationResult.rows[0].total_products}`);
    console.log(`   With Style Number: ${verificationResult.rows[0].products_with_style_number}`);
    console.log(`   Without Style Number: ${verificationResult.rows[0].products_without_style_number}\n`);

    // Show some examples of populated style numbers
    const examplesResult = await client.query(`
      SELECT id, title, vendor, style_number
      FROM products
      WHERE style_number IS NOT NULL
      LIMIT 5;
    `);
    const examples = examplesResult.rows;

    console.log('📋 Sample Products with Style Numbers:');
    console.log('─────────────────────────────────────────────────────────────');
    examples.forEach((p, i) => {
      console.log(`${i + 1}. ${p.title}`);
      console.log(`   Vendor: ${p.vendor}`);
      console.log(`   Style #: ${p.style_number}`);
      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ✅ MIGRATION SUCCESSFUL');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log('📝 Next Steps:');
    console.log('   1. Update Product Edit UI to display styleNumber field');
    console.log('   2. Update Products list to filter by style number');
    console.log('   3. Add styleNumber to Shopify sync (write back as metafield)');
    console.log('   4. Test CRUD operations with style number\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    await client.end();
    process.exit(1);
  }

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
