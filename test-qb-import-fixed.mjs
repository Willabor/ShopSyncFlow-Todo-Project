import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

const PRODUCT_ID = '55e349ec-3ad4-4650-a1c6-5ed02c9c7e53';
const FILE_PATH = '/volume1/docker/planning/05-shopsyncflow/Upload/TEST2.xlsx';
const API_URL = 'http://localhost:9000';

async function testImport() {
  console.log('🧪 Testing QuickBooks Import with Fixed Color/Size Options\n');

  // Step 1: Login to get session cookie
  console.log('1️⃣ Logging in...');
  const loginRes = await fetch(`${API_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin',
      password: 'admin'
    })
  });

  const cookies = loginRes.headers.raw()['set-cookie'];
  const sessionCookie = cookies.find(c => c.startsWith('connect.sid='));

  if (!sessionCookie) {
    console.error('❌ Failed to login');
    process.exit(1);
  }
  console.log('✅ Logged in successfully\n');

  // Step 2: Upload QB file
  console.log('2️⃣ Uploading QuickBooks file...');
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

  const result = await importRes.json();

  if (!result.success) {
    console.error('❌ Import failed:', result.error);
    console.error('Message:', result.message);
    process.exit(1);
  }

  console.log('✅ Import completed successfully!\n');

  // Step 3: Display results
  console.log('📊 Import Summary:');
  console.log(`   Total rows in file: ${result.summary.totalRowsInFile}`);
  console.log(`   Filtered rows (matched): ${result.summary.filteredRows}`);
  console.log(`   Variants updated: ${result.summary.variantsUpdated}`);
  console.log(`   Variants created: ${result.summary.variantsCreated}`);
  console.log(`   Rows skipped: ${result.summary.rowsSkipped}`);
  console.log(`   Existing variants kept: ${result.summary.existingVariantsKept}`);
  console.log();

  console.log('📦 Product Details:');
  console.log(`   Product: ${result.details.productTitle}`);
  console.log(`   Style Number: ${result.details.styleNumber}`);
  console.log(`   Color: ${result.details.color}`);
  console.log(`   Sizes found: ${result.details.sizesFound.join(', ')}`);
  console.log(`   Total variants after import: ${result.details.totalVariantsAfterImport}`);
  console.log();

  // Step 4: Fetch product to verify options
  console.log('3️⃣ Verifying product options...');
  const productRes = await fetch(`${API_URL}/api/products/${PRODUCT_ID}`, {
    headers: { 'Cookie': sessionCookie }
  });
  const product = await productRes.json();

  console.log('\n🎨 Product Options:');
  if (product.options && product.options.length > 0) {
    product.options.forEach((opt, idx) => {
      console.log(`   Option ${opt.position}: ${opt.name}`);
      console.log(`      Values: ${opt.values.join(', ')}`);
    });
  } else {
    console.log('   ❌ No options found!');
  }

  // Step 5: Fetch variants to verify structure
  console.log('\n4️⃣ Verifying variant structure...');
  const variantsRes = await fetch(`${API_URL}/api/products/${PRODUCT_ID}/variants`, {
    headers: { 'Cookie': sessionCookie }
  });
  const variants = await variantsRes.json();

  console.log(`\n📦 Product Variants (${variants.length} total):`);
  variants.slice(0, 3).forEach(v => {
    console.log(`   ${v.title}`);
    console.log(`      SKU: ${v.sku}`);
    console.log(`      option1 (Color): ${v.option1}`);
    console.log(`      option2 (Size): ${v.option2}`);
    console.log(`      Price: $${v.price}`);
    console.log(`      Inventory: ${v.inventoryQuantity}`);
  });

  if (variants.length > 3) {
    console.log(`   ... and ${variants.length - 3} more variants`);
  }

  // Step 6: Validate structure
  console.log('\n5️⃣ Validation:');
  const hasColorOption = product.options?.some(o => o.name === 'Color');
  const hasSizeOption = product.options?.some(o => o.name === 'Size');
  const allVariantsHaveColor = variants.every(v => v.option1 === 'Ice Blue');
  const allVariantsHaveSize = variants.every(v => v.option2 !== null);

  console.log(`   ✓ Color option created: ${hasColorOption ? '✅ YES' : '❌ NO'}`);
  console.log(`   ✓ Size option created: ${hasSizeOption ? '✅ YES' : '❌ NO'}`);
  console.log(`   ✓ All variants have option1 (Color): ${allVariantsHaveColor ? '✅ YES' : '❌ NO'}`);
  console.log(`   ✓ All variants have option2 (Size): ${allVariantsHaveSize ? '✅ YES' : '❌ NO'}`);

  if (hasColorOption && hasSizeOption && allVariantsHaveColor && allVariantsHaveSize) {
    console.log('\n🎉 SUCCESS! Color/Size relationship properly created!');
  } else {
    console.log('\n❌ VALIDATION FAILED - Structure not correct');
  }
}

testImport().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
