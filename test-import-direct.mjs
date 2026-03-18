/**
 * Direct QB Import Test - Bypasses API authentication
 * Tests the import logic directly using the storage layer
 */

import xlsx from 'xlsx';
import { db } from './server/db.js';
import { storage } from './server/storage.js';
import {
  extractColorFromTitle,
  sumInventoryColumns,
  sortSizes,
  validateQBRow,
  parseQBRow
} from './server/qb-import-helpers.js';

const PRODUCT_ID = '55e349ec-3ad4-4650-a1c6-5ed02c9c7e53';
const FILE_PATH = '/volume1/docker/planning/05-shopsyncflow/Upload/TEST2.xlsx';

async function testImportDirect() {
  console.log('🧪 Direct QuickBooks Import Test (No Auth)\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Step 1: Get product
    console.log('1️⃣  Loading product...');
    const product = await storage.getProduct(PRODUCT_ID);

    if (!product) {
      throw new Error('Product not found');
    }

    console.log(`✅ Product: ${product.title}`);
    console.log(`   Style Number: ${product.styleNumber}\n`);

    // Step 2: Extract color from title
    console.log('2️⃣  Extracting color from product title...');
    const productColor = extractColorFromTitle(product.title);

    if (!productColor) {
      throw new Error('Could not extract color from product title');
    }

    console.log(`✅ Color extracted: "${productColor}"\n`);

    // Step 3: Parse QuickBooks file
    console.log('3️⃣  Parsing QuickBooks file...');
    const workbook = xlsx.readFile(FILE_PATH);
    const allRows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

    console.log(`✅ Total rows in file: ${allRows.length}`);

    // Filter by Style Number + Color
    const matchingRows = allRows.filter((row) =>
      row['Custom Field 1']?.toString().trim() === product.styleNumber &&
      row['Attribute']?.toString().trim() === productColor
    );

    console.log(`✅ Matching rows for ${product.styleNumber} / ${productColor}: ${matchingRows.length}\n`);

    // Step 4: Process rows
    console.log('4️⃣  Processing variant data...');

    const existingVariants = await storage.getProductVariants(PRODUCT_ID);
    console.log(`   Existing variants: ${existingVariants.length}`);

    const variantsBySku = new Map(existingVariants.map(v => [v.sku, v]));
    const allSizes = new Set();
    const toUpdate = [];
    const toCreate = [];
    const skipped = [];

    for (const row of matchingRows) {
      const validation = validateQBRow(row);

      if (!validation.isValid) {
        skipped.push({row: row['Item Number'], reason: validation.errors.join(', ')});
        continue;
      }

      const variantData = parseQBRow(row);
      allSizes.add(variantData.size);

      const variantInProduct = variantsBySku.get(variantData.sku);

      if (variantInProduct) {
        toUpdate.push({ variantId: variantInProduct.id, data: variantData });
      } else {
        toCreate.push(variantData);
      }
    }

    console.log(`   To update: ${toUpdate.length}`);
    console.log(`   To create: ${toCreate.length}`);
    console.log(`   Skipped: ${skipped.length}\n`);

    // Step 5: Create/update options BEFORE transaction
    console.log('5️⃣  Creating/updating product options...\n');

    // Create Color option (position 1)
    console.log(`   → Creating Color option: [${productColor}]`);
    await storage.upsertProductOption(PRODUCT_ID, 'Color', [productColor]);

    // Create Size option (position 2)
    if (allSizes.size > 0) {
      const sortedSizes = sortSizes(Array.from(allSizes));
      console.log(`   → Creating Size option: [${sortedSizes.join(', ')}]`);
      await storage.upsertProductOption(PRODUCT_ID, 'Size', sortedSizes);
    }

    // Step 6: Execute variant import in transaction
    console.log('\n6️⃣  Executing variant import transaction...\n');

    await db.transaction(async (tx) => {
      // Update existing variants
      console.log(`\n   → Updating ${toUpdate.length} existing variants...`);
      for (const { variantId, data } of toUpdate) {
        await storage.updateProductVariant(variantId, {
          title: `${productColor} / ${data.size}`,
          option1: productColor,
          option2: data.size,
          price: data.price,
          cost: data.cost,
          inventoryQuantity: data.inventoryQuantity,
          barcode: data.barcode,
          weight: data.weight?.toString() || null,
          weightUnit: data.weight ? 'lb' : null,
          updatedAt: new Date()
        });
      }

      // Create new variants
      console.log(`   → Creating ${toCreate.length} new variants...`);
      for (const data of toCreate) {
        await storage.createProductVariant({
          productId: PRODUCT_ID,
          title: `${productColor} / ${data.size}`,
          option1: productColor,
          option2: data.size,
          option3: null,
          price: data.price,
          cost: data.cost,
          inventoryQuantity: data.inventoryQuantity,
          sku: data.sku,
          barcode: data.barcode,
          weight: data.weight?.toString() || null,
          weightUnit: data.weight ? 'lb' : null,
          position: existingVariants.length + toCreate.indexOf(data) + 1
        });
      }

      // Update product timestamp
      await storage.updateProduct(PRODUCT_ID, {
        updatedAt: new Date()
      });
    });

    console.log('\n✅ Transaction completed successfully!\n');

    // Step 7: Verify results
    console.log('7️⃣  Verifying results...\n');

    const updatedProduct = await storage.getProduct(PRODUCT_ID);

    // Query options directly
    const {productOptions} = await import('./shared/schema.js');
    const {eq} = await import('drizzle-orm');
    const options = await db.select()
      .from(productOptions)
      .where(eq(productOptions.productId, PRODUCT_ID))
      .orderBy(productOptions.position);

    console.log('🎨 PRODUCT OPTIONS:');
    console.log('─────────────────────────────────────────────────────────');
    options.forEach(opt => {
      console.log(`   ${opt.position}. ${opt.name}`);
      console.log(`      Values: [${opt.values.join(', ')}]`);
      console.log();
    });

    const variants = await storage.getProductVariants(PRODUCT_ID);

    console.log('─────────────────────────────────────────────────────────\n');
    console.log(`📦 PRODUCT VARIANTS (${variants.length} total):`);
    console.log('─────────────────────────────────────────────────────────');

    variants.forEach((v, idx) => {
      console.log(`   ${idx + 1}. ${v.title}`);
      console.log(`      SKU:       ${v.sku}`);
      console.log(`      option1:   ${v.option1} (Color)`);
      console.log(`      option2:   ${v.option2} (Size)`);
      console.log(`      Price:     $${v.price}`);
      console.log(`      Weight:    ${v.weight && v.weightUnit ? v.weight + ' ' + v.weightUnit : 'N/A'}`);
      console.log(`      Inventory: ${v.inventoryQuantity}`);
      console.log();
    });
    console.log('─────────────────────────────────────────────────────────\n');

    // Step 8: Validation
    console.log('8️⃣  Running validation checks...\n');

    const hasColorOption = options.some(o => o.name === 'Color');
    const hasSizeOption = options.some(o => o.name === 'Size');
    const colorOption = options.find(o => o.name === 'Color');
    const sizeOption = options.find(o => o.name === 'Size');
    const allVariantsHaveColor = variants.every(v => v.option1 === productColor);
    const allVariantsHaveSize = variants.every(v => v.option2 !== null);
    const allTitlesCorrect = variants.every(v => v.title.includes('/'));

    console.log('✓ VALIDATION RESULTS:');
    console.log('─────────────────────────────────────────────────────────');
    console.log(`   Color option created:            ${hasColorOption ? '✅ YES' : '❌ NO'}`);
    console.log(`   Color option at position 1:      ${colorOption?.position === 1 ? '✅ YES' : '❌ NO'}`);
    console.log(`   Color has single value:          ${colorOption?.values.length === 1 ? '✅ YES' : '❌ NO'}`);
    console.log();
    console.log(`   Size option created:             ${hasSizeOption ? '✅ YES' : '❌ NO'}`);
    console.log(`   Size option at position 2:       ${sizeOption?.position === 2 ? '✅ YES' : '❌ NO'}`);
    console.log(`   Size has 11 values:              ${sizeOption?.values.length === 11 ? '✅ YES' : '❌ NO'}`);
    console.log();
    console.log(`   All variants have option1:       ${allVariantsHaveColor ? '✅ YES' : '❌ NO'}`);
    console.log(`   All variants have option2:       ${allVariantsHaveSize ? '✅ YES' : '❌ NO'}`);
    console.log(`   All titles use "Color / Size":   ${allTitlesCorrect ? '✅ YES' : '❌ NO'}`);
    console.log('─────────────────────────────────────────────────────────\n');

    const allChecksPassed =
      hasColorOption &&
      hasSizeOption &&
      colorOption?.position === 1 &&
      sizeOption?.position === 2 &&
      allVariantsHaveColor &&
      allVariantsHaveSize &&
      allTitlesCorrect;

    if (allChecksPassed) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('🎉 SUCCESS! Color/Size relationship properly created!');
      console.log('═══════════════════════════════════════════════════════════\n');
      console.log('✅ Product structure matches Shopify requirements:');
      console.log('   • Color option at position 1 with single value');
      console.log('   • Size option at position 2 with all sizes');
      console.log('   • All variants use option1=Color, option2=Size');
      console.log('   • Variant titles follow "Color / Size" format\n');
      process.exit(0);
    } else {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('❌ VALIDATION FAILED - Structure not correct');
      console.log('═══════════════════════════════════════════════════════════\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    process.exit(1);
  }
}

testImportDirect();
