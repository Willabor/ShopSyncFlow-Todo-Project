import XLSX from 'xlsx';

const xlsPath = '/volume1/docker/planning/05-shopsyncflow/Upload/order-record-8117779-1761843972.xls';

// Read the XLS file
const workbook = XLSX.readFile(xlsPath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Get raw data as array of arrays
const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

console.log('Total Rows:', rawData.length);
console.log('\n=== FULL FILE STRUCTURE (first 50 rows) ===\n');

rawData.slice(0, 50).forEach((row, idx) => {
  // Only show rows that have content in first few columns
  const content = row.slice(0, 10).filter(cell => cell !== '').length;
  if (content > 0) {
    console.log(`Row ${idx + 1}: ${JSON.stringify(row.slice(0, 15))}`);
  }
});

console.log('\n\n=== Looking for product line items ===\n');

// Find where the product table starts
let productTableStart = -1;
for (let i = 0; i < rawData.length; i++) {
  const row = rawData[i];
  // Look for rows that might be headers for product data
  if (row[0] && (
    row[0].toString().toLowerCase().includes('sku') ||
    row[0].toString().toLowerCase().includes('style') ||
    row[0].toString().toLowerCase().includes('product') ||
    row[0].toString().toLowerCase().includes('item')
  )) {
    console.log(`Potential product header at row ${i + 1}: ${JSON.stringify(row.slice(0, 10))}`);
    productTableStart = i;
  }
}

if (productTableStart >= 0) {
  console.log(`\n\nProduct table appears to start at row ${productTableStart + 1}`);
  console.log('\nShowing 10 rows from that point:\n');
  rawData.slice(productTableStart, productTableStart + 10).forEach((row, idx) => {
    console.log(`Row ${productTableStart + idx + 1}: ${JSON.stringify(row)}`);
  });
}
