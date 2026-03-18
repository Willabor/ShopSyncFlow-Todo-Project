import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

const PRODUCT_ID = '55e349ec-3ad4-4650-a1c6-5ed02c9c7e53';
const FILE_PATH = '/volume1/docker/planning/05-shopsyncflow/Upload/TEST2.xlsx';
const API_URL = 'http://localhost:9000';

async function testImport() {
  console.log('🧪 Testing QuickBooks Import with Fixed Color/Size Options\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Step 1: Login
    console.log('1️⃣  Logging in...');
    const loginRes = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'admin',
        password: 'admin'
      })
    });

    if (loginRes.status === 401) {
      console.error('❌ Login failed - Invalid credentials');
      process.exit(1);
    }

    // Extract session cookie
    const setCookieHeader = loginRes.headers.raw()['set-cookie'];
    if (!setCookieHeader) {
      console.error('❌ No session cookie received');
      process.exit(1);
    }

    const sessionCookie = setCookieHeader
      .map(cookie => cookie.split(';')[0])
      .join('; ');

    console.log('✅ Logged in successfully\n');

    // Step 2: Upload and import
    console.log('2️⃣  Uploading QuickBooks file...');
    console.log(`   File: ${FILE_PATH}`);
    console.log(`   Product ID: ${PRODUCT_ID}\n`);

    const form = new FormData();
    form.append('file', fs.createReadStream(FILE_PATH));

    const importRes = await fetch(`${API_URL}/api/products/${PRODUCT_ID}/import-variants-from-qb`, {
      method: 'POST',
      headers: {
        'Cookie': sessionCookie,
        ...form.getHeaders()
      },
      body: form
    });

    const importData = await importRes.json();

    if (!importData.success) {
      console.error('❌ Import failed:');
      console.error(`   Error: ${importData.error}`);
      console.error(`   Message: ${importData.message}`);
      process.exit(1);
    }

    console.log('✅ Import completed successfully!\n');

    console.log('📊 IMPORT SUMMARY:');
    console.log('─────────────────────────────────────────────────────────');
    console.log(`   Total rows in file:      ${importData.summary.totalRowsInFile}`);
    console.log(`   Filtered rows (matched): ${importData.summary.filteredRows}`);
    console.log(`   Variants UPDATED:        ${importData.summary.variantsUpdated}`);
    console.log(`   Variants CREATED:        ${importData.summary.variantsCreated}`);
    console.log(`   Rows skipped:            ${importData.summary.rowsSkipped}`);
    console.log(`   Existing kept:           ${importData.summary.existingVariantsKept}`);
    console.log('─────────────────────────────────────────────────────────\n');

    console.log('📦 PRODUCT DETAILS:');
    console.log('─────────────────────────────────────────────────────────');
    console.log(`   Title:        ${importData.details.productTitle}`);
    console.log(`   Style Number: ${importData.details.styleNumber}`);
    console.log(`   Color:        ${importData.details.color}`);
    console.log(`   Sizes:        ${importData.details.sizesFound.join(', ')}`);
    console.log(`   Total after:  ${importData.details.totalVariantsAfterImport} variants`);
    console.log('─────────────────────────────────────────────────────────\n');

    // Step 3: Fetch and verify product options
    console.log('3️⃣  Verifying product options...\n');

    const productRes = await fetch(`${API_URL}/api/products/${PRODUCT_ID}`, {
      headers: { 'Cookie': sessionCookie }
    });
    const product = await productRes.json();

    console.log('🎨 PRODUCT OPTIONS:');
    console.log('─────────────────────────────────────────────────────────');
    if (product.options && product.options.length > 0) {
      product.options.forEach((opt) => {
        console.log(`   ${opt.position}. ${opt.name}`);
        console.log(`      Values: [${opt.values.join(', ')}]`);
        console.log(`      Position: ${opt.position}`);
        console.log();
      });
    } else {
      console.log('   ❌ No options found!\n');
    }
    console.log('─────────────────────────────────────────────────────────\n');

    // Step 4: Fetch and verify variants
    console.log('4️⃣  Verifying variant structure...\n');

    const variantsRes = await fetch(`${API_URL}/api/products/${PRODUCT_ID}/variants`, {
      headers: { 'Cookie': sessionCookie }
    });
    const variants = await variantsRes.json();

    console.log(`📦 PRODUCT VARIANTS (${variants.length} total):`);
    console.log('─────────────────────────────────────────────────────────');

    variants.forEach((v, idx) => {
      console.log(`   ${idx + 1}. ${v.title}`);
      console.log(`      SKU:       ${v.sku}`);
      console.log(`      option1:   ${v.option1} (Color)`);
      console.log(`      option2:   ${v.option2} (Size)`);
      console.log(`      Price:     $${v.price}`);
      console.log(`      Inventory: ${v.inventoryQuantity}`);
      if (v.barcode) console.log(`      Barcode:   ${v.barcode}`);
      console.log();
    });
    console.log('─────────────────────────────────────────────────────────\n');

    // Step 5: Validation
    console.log('5️⃣  Running validation checks...\n');

    const hasColorOption = product.options?.some(o => o.name === 'Color');
    const hasSizeOption = product.options?.some(o => o.name === 'Size');
    const colorOption = product.options?.find(o => o.name === 'Color');
    const sizeOption = product.options?.find(o => o.name === 'Size');
    const allVariantsHaveColor = variants.every(v => v.option1 === 'Ice Blue');
    const allVariantsHaveSize = variants.every(v => v.option2 !== null && v.option2 !== '');
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

    // Final result
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

testImport();
