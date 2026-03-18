/**
 * Create Test Product for Publishing
 *
 * Creates a brand new test product with complete variant data
 * specifically for testing the publish functionality.
 */

import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://shopsyncflow_user:ShopSyncSecurePass2025@localhost:5433/shopsyncflow_db';

const client = new pg.Client({ connectionString: DATABASE_URL });

async function main() {
  await client.connect();

  console.log('Creating test product for variant publishing...\n');

  // Create product
  const productId = '99999999-test-product-variant-publish';

  await client.query(`
    INSERT INTO products (
      id,
      title,
      description,
      vendor,
      category,
      created_at,
      updated_at
    ) VALUES (
      $1,
      'TEST PRODUCT - Variant Publishing Test',
      'This is a test product created for testing variant publishing functionality. Safe to delete after testing.',
      'Test Vendor',
      'Test Category',
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      updated_at = NOW()
  `, [productId]);

  console.log('✅ Product created');

  // Create product options
  const option1Id = '99999999-option-1-color';
  const option2Id = '99999999-option-2-size';

  await client.query(`
    INSERT INTO product_options (
      id,
      product_id,
      name,
      position,
      values,
      created_at,
      updated_at
    ) VALUES
      ($1, $2, 'Color', 1, ARRAY['Red', 'Blue'], NOW(), NOW()),
      ($3, $2, 'Size', 2, ARRAY['Small', 'Large'], NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      values = EXCLUDED.values,
      updated_at = NOW()
  `, [option1Id, productId, option2Id]);

  console.log('✅ Product options created (Color, Size)');

  // Create 4 variants (Red/Small, Red/Large, Blue/Small, Blue/Large)
  const variants = [
    { color: 'Red', size: 'Small', sku: 'TEST-RED-SM', price: '29.99', barcode: '1234567890001', weight: '0.5' },
    { color: 'Red', size: 'Large', sku: 'TEST-RED-LG', price: '29.99', barcode: '1234567890002', weight: '0.7' },
    { color: 'Blue', size: 'Small', sku: 'TEST-BLUE-SM', price: '34.99', barcode: '1234567890003', weight: '0.5' },
    { color: 'Blue', size: 'Large', sku: 'TEST-BLUE-LG', price: '34.99', barcode: '1234567890004', weight: '0.7' },
  ];

  for (const [index, variant] of variants.entries()) {
    const variantId = `99999999-variant-${index + 1}`;

    await client.query(`
      INSERT INTO product_variants (
        id,
        product_id,
        title,
        sku,
        barcode,
        price,
        compare_at_price,
        cost,
        inventory_quantity,
        weight,
        weight_unit,
        option1,
        option2,
        option3,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        sku = EXCLUDED.sku,
        barcode = EXCLUDED.barcode,
        price = EXCLUDED.price,
        option1 = EXCLUDED.option1,
        option2 = EXCLUDED.option2,
        updated_at = NOW()
    `, [
      variantId,
      productId,
      `${variant.color} / ${variant.size}`,  // title
      variant.sku,  // sku
      variant.barcode,  // barcode
      variant.price,  // price
      null,  // compare_at_price
      '15.00',  // cost
      10,  // inventory_quantity
      variant.weight,  // weight
      'POUNDS',  // weight_unit
      variant.color,  // option1
      variant.size,  // option2
      null,  // option3
    ]);
  }

  console.log('✅ Product variants created (4 variants)');
  console.log('');

  console.log('Test product details:');
  console.log('  ID:', productId);
  console.log('  Title: TEST PRODUCT - Variant Publishing Test');
  console.log('  Vendor: Test Vendor');
  console.log('  Options: Color (Red, Blue), Size (Small, Large)');
  console.log('  Variants: 4');
  console.log('    - Red / Small ($29.99)');
  console.log('    - Red / Large ($29.99)');
  console.log('    - Blue / Small ($34.99)');
  console.log('    - Blue / Large ($34.99)');
  console.log('');
  console.log('✅ Test product ready for publishing!');
  console.log('');
  console.log('You can now run the test script:');
  console.log('  DATABASE_URL="..." node_modules/.bin/tsx --env-file=.env scripts/test-variant-publish.ts');
  console.log('');
  console.log('To delete this test product after testing:');
  console.log(`  DELETE FROM products WHERE id = '${productId}';`);
  console.log('  (Variants and options will be cascade deleted)');
  console.log('');

  await client.end();
}

main().catch(console.error);
